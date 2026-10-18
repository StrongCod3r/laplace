import { expect, test } from '@playwright/test';

for (const local of [false, true]) {
  test(
    (local ? 'local' : 'browser') +
      ' workspace offers GitHub setup only for a local folder without Git',
    async ({ page }) => {
      const gitRequests: string[] = [];
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route(/git-worker-client|git\.worker/, (route) => {
        gitRequests.push(route.request().url());
        return route.abort();
      });
      if (local)
        await page.addInitScript(() => {
          Object.defineProperty(window, 'showDirectoryPicker', {
            configurable: true,
            value: async () => navigator.storage.getDirectory(),
          });
        });
      await page.goto('/laplace/');
      await expect(page.locator('#pageTitle')).toBeVisible();
      if (local) {
        if (!(await page.locator('#chooseDirectoryBtn').isVisible()))
          await page.getByRole('button', { name: 'Files', exact: true }).click();
        await page.locator('#chooseDirectoryBtn').click();
        await expect(page.locator('#workspaceSelect')).not.toHaveValue('browser');
      }
      await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
      const panel = page.locator('#gitPanel');
      await expect(
        panel.getByText('Git is not initialized in this workspace.', { exact: true }),
      ).toBeVisible();
      await expect(panel).toHaveAttribute('aria-busy', 'false');
      await expect(panel.getByRole('button')).toHaveCount(local ? 1 : 0);
      await expect(
        page.getByRole('button', { name: 'Open a GitHub web workspace', exact: true }),
      ).toHaveCount(0);
      if (local) {
        await panel.screenshot({ path: 'test-results/git-setup-light.png' });
        await page.evaluate(() => document.body.classList.add('dark'));
        await panel.screenshot({ path: 'test-results/git-setup-dark.png' });
        await page.evaluate(() => document.body.classList.remove('dark'));
        await panel
          .getByRole('button', { name: 'Configure GitHub synchronization', exact: true })
          .click();
        const dialog = page.getByRole('dialog', { name: 'Repository settings', exact: true });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByLabel('Remote repository (HTTPS)')).toBeEnabled();
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      }
      await expect(panel.getByRole('alert')).toHaveCount(0);
      await page.getByRole('button', { name: 'Files', exact: true }).click();
      await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
      await expect(
        panel.getByText('Git is not initialized in this workspace.', { exact: true }),
      ).toBeVisible();
      expect(gitRequests).toEqual([]);
      expect(errors).toEqual([]);
    },
  );
}

test('GitHub setup initializes the local folder on save, preserves notes and enables commits', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      value: async () => navigator.storage.getDirectory(),
    });
  });
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const writer = await (
      await root.getFileHandle('Existing.md', { create: true })
    ).createWritable();
    await writer.write('Preserve this local note.\n');
    await writer.close();
  });
  await page.locator('#chooseDirectoryBtn').click();
  await expect(page.locator('#pageTree')).toContainText('Existing');
  await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
  const panel = page.locator('#gitPanel');
  await panel
    .getByRole('button', { name: 'Configure GitHub synchronization', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Repository settings', exact: true });
  await dialog.getByLabel('Remote repository (HTTPS)').fill('https://example.com/notes.git');
  await dialog.getByLabel('Author name').fill('Local author');
  await dialog.getByLabel('Author email').fill('local@example.com');
  await dialog.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('GitHub HTTPS');
  expect(
    await page.evaluate(async () => {
      try {
        await (await navigator.storage.getDirectory()).getDirectoryHandle('.git');
        return true;
      } catch {
        return false;
      }
    }),
  ).toBe(false);
  await dialog.getByLabel('Remote repository (HTTPS)').fill('https://github.com/test/notes.git');
  await dialog.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(panel.getByLabel('Commit message')).toBeVisible();
  await panel.getByLabel('Commit message').fill('Initial local notes');
  await panel.getByRole('button', { name: 'Commit local changes', exact: true }).click();
  await expect(panel.getByText(/Commit created:/)).toBeVisible();
  const result = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const note = await (await root.getFileHandle('Existing.md')).getFile();
    const git = await root.getDirectoryHandle('.git');
    const config = await (await git.getFileHandle('config')).getFile();
    return { note: await note.text(), config: await config.text() };
  });
  expect(result.note).toContain('Preserve this local note.');
  expect(result.config).toContain('https://github.com/test/notes.git');
  await page.reload();
  await expect(page.locator('#gitPanel').getByLabel('Commit message')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Configure GitHub synchronization', exact: true }),
  ).toHaveCount(0);
});

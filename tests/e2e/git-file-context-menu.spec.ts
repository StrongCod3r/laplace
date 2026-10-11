import { expect, test } from '@playwright/test';

test('Git context menu handles multiple files, staging, unstaging and confirmed discard', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => navigator.storage.getDirectory(),
    });
  });
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.evaluate(async () => {
    const url = '/laplace/src/features/git/services/git-worker-client.ts';
    const { createGitClient } = await import(url);
    const root = await navigator.storage.getDirectory();
    const client = await createGitClient(root);
    try {
      await client.initialize();
      await client.configure({ url: '', corsProxy: '', name: 'Test', email: 'test@example.com' });
      for (const name of ['A', 'B', 'C']) {
        const writer = await (
          await root.getFileHandle(name + '.md', { create: true })
        ).createWritable();
        await writer.write(name + ' original\n');
        await writer.close();
      }
      await client.commit('Initial');
    } finally {
      client.dispose();
    }
  });
  await page.locator('#chooseDirectoryBtn').click();
  for (const name of ['A', 'B', 'C']) {
    await page
      .locator('#pageTree [data-action="open-page"]')
      .filter({ hasText: new RegExp('^' + name + '$') })
      .click();
    await page
      .locator('#blockEditor .block-content')
      .first()
      .fill(name + ' draft');
  }
  await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
  const panel = page.locator('#gitPanel');
  const row = (path: string, comparison = 'unstaged') =>
    panel.locator('[data-git-path="' + path + '"][data-git-comparison="' + comparison + '"]');
  await expect(row('A.md')).toBeVisible();
  await row('A.md').click({ modifiers: ['Control'] });
  await row('B.md').click({ modifiers: ['Shift'] });
  await expect(row('A.md')).toHaveAttribute('aria-pressed', 'true');
  await expect(row('B.md')).toHaveAttribute('aria-pressed', 'true');
  await row('B.md').click({ button: 'right' });
  let menu = page.getByRole('menu', { name: 'Git file actions' });
  await expect(menu).toContainText('2 files selected');
  await menu.getByRole('menuitem', { name: 'Copy path', exact: true }).click();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(
    'A.md\nB.md',
  );
  await row('B.md').click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Stage changes', exact: true }).click();
  await expect(row('A.md', 'staged')).toBeVisible();
  await expect(row('B.md', 'staged')).toBeVisible();
  await expect(row('A.md')).toHaveCount(0);
  await expect(row('C.md')).toBeVisible();
  await row('A.md', 'staged').click({ modifiers: ['Control'] });
  await row('B.md', 'staged').click({ modifiers: ['Control'] });
  await row('B.md', 'staged').click({ button: 'right' });
  await expect(menu).toContainText('2 files selected');
  await menu.getByRole('menuitem', { name: 'Unstage changes', exact: true }).click();
  await expect(row('A.md')).toBeVisible();
  await expect(row('B.md')).toBeVisible();
  await expect(row('A.md', 'staged')).toHaveCount(0);
  await row('A.md').click({ button: 'right' });
  await expect(menu).not.toContainText('2 files selected');
  await expect(menu.getByRole('menuitem', { name: 'View changes', exact: true })).toBeEnabled();
  await expect(menu.getByRole('menuitem', { name: 'Open file', exact: true })).toBeEnabled();
  await menu.getByRole('menuitem', { name: 'View changes', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'File comparison: A.md', exact: true }),
  ).toBeVisible();
  await row('A.md').focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await row('A.md').click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Open file', exact: true }).click();
  await expect(page.locator('#pageTitle')).toHaveText('A');
  await expect(page.locator('#blockEditor')).toContainText('A draft');
  await row('A.md').click({ button: 'right' });

  await menu.getByRole('menuitem', { name: 'Stage changes', exact: true }).click();
  await expect(row('A.md', 'staged')).toBeVisible();
  await row('A.md', 'staged').click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Discard changes', exact: true }).click();
  const confirmation = page.getByRole('alertdialog', { name: 'Discard changes?' });
  await expect(confirmation).toContainText('A.md');
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(row('A.md', 'staged')).toBeVisible();
  await row('A.md', 'staged').click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Discard changes', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(row('A.md', 'staged')).toHaveCount(0);
  await expect(row('A.md')).toHaveCount(0);
  await expect(row('B.md')).toBeVisible();
  await expect(row('C.md')).toBeVisible();
  const restored = await page.evaluate(async () => {
    const url = '/laplace/src/store/workspace.store.ts';
    const { useWorkspaceStore } = await import(url);
    const root = await navigator.storage.getDirectory();
    return {
      disk: await (await (await root.getFileHandle('A.md')).getFile()).text(),
      notes: useWorkspaceStore
        .getState()
        .controller.getDocument()
        .pages.map((note: { title: string; blocks: { text: string }[] }) => ({
          title: note.title,
          text: note.blocks.map((block) => block.text).join('\n'),
        })),
    };
  });
  expect(restored.disk).toBe('A original\n');
  expect(restored.notes).toContainEqual({ title: 'A', text: 'A original' });
  expect(restored.notes).toContainEqual({ title: 'B', text: 'B draft' });
  await row('B.md').click({ modifiers: ['Control'] });
  await row('C.md').click({ modifiers: ['Control'] });
  await row('C.md').click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Discard changes', exact: true }).click();
  await expect(confirmation).toContainText('B.md');
  await expect(confirmation).toContainText('C.md');
  await confirmation.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(row('B.md')).toHaveCount(0);
  await expect(row('C.md')).toHaveCount(0);
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await page.locator('#newPageBtn').click();
  await page.locator('#pageTitle').fill('Untracked');
  await page.locator('#pageTitle').press('Tab');
  await page.locator('#blockEditor .block-content').first().fill('New note');
  await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
  await expect(row('Untracked.md')).toBeVisible();
  await row('Untracked.md').click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Discard changes', exact: true }).click();
  await expect(confirmation).toContainText('untracked files');
  await confirmation.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(row('Untracked.md')).toHaveCount(0);
  const exists = await page.evaluate(async () => {
    try {
      await (await navigator.storage.getDirectory()).getFileHandle('Untracked.md');
      return true;
    } catch (error) {
      if ((error as DOMException).name === 'NotFoundError') return false;
      throw error;
    }
  });
  expect(exists).toBe(false);
});

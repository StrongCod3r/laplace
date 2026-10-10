import { expect, type Page } from '@playwright/test';

/** Prepare an existing repository independently of the Source Control UI. */
export async function prepareGitRepository(page: Page) {
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const git = await root.getDirectoryHandle('.git', { create: true });
    const write = async (name: string, value: string) => {
      const stream = await (await git.getFileHandle(name, { create: true })).createWritable();
      await stream.write(value);
      await stream.close();
    };
    await write('HEAD', 'ref: refs/heads/main\n');
    await write('config', '[core]\n\trepositoryformatversion = 0\n\tbare = false\n');
    const objects = await git.getDirectoryHandle('objects', { create: true });
    await objects.getDirectoryHandle('info', { create: true });
    await objects.getDirectoryHandle('pack', { create: true });
    const refs = await git.getDirectoryHandle('refs', { create: true });
    await refs.getDirectoryHandle('heads', { create: true });
    await refs.getDirectoryHandle('tags', { create: true });
  });
}

export async function openGitFixtureSettings(page: Page) {
  await prepareGitRepository(page);
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
  const panel = page.locator('#gitPanel');
  await expect(panel.getByLabel('Commit message')).toBeVisible();
  await panel.locator('header summary').click();
  await panel.getByRole('button', { name: 'Repository settings', exact: true }).click();
}

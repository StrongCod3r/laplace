import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createGitRemote } from '../fixtures/git-http';

test('first Sync downloads remote notes without an initial local commit and retains local notes', async ({
  page,
}) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'laplace-first-sync-'));
  const remote = await createGitRemote(directory);
  try {
    const seed = path.join(directory, 'seed');
    const git = (...args: string[]) => execFileSync('git', args, { windowsHide: true });
    git('clone', remote.bare, seed);
    git('-C', seed, 'config', 'user.name', 'Remote author');
    git('-C', seed, 'config', 'user.email', 'remote@example.com');
    await fs.writeFile(path.join(seed, 'Remote note.md'), 'Downloaded on the first Sync.\n');
    await fs.writeFile(path.join(seed, '.gitignore'), 'remote-only/\n');
    await fs.mkdir(path.join(seed, '.laplace'));
    await fs.writeFile(path.join(seed, '.laplace', 'app.json'), '{"spellcheckEnabled":true}');
    git('-C', seed, 'add', '.');
    git('-C', seed, 'commit', '-m', 'Remote notes');
    git('-C', seed, 'push', 'origin', 'main');
    const originalHead = git('--git-dir', remote.bare, 'rev-parse', 'main').toString().trim();
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showDirectoryPicker', {
        value: async () =>
          (await navigator.storage.getDirectory()).getDirectoryHandle('First Sync', {
            create: true,
          }),
      });
    });
    await page.route('**/first-sync-proxy/github.com/**', async (route) => {
      const url = new URL(route.request().url());
      await route.fulfill({
        response: await route.fetch({
          url: `${remote.url}${url.pathname.split('/notes.git')[1]}${url.search}`,
        }),
      });
    });
    await page.goto('/laplace/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await page.evaluate(async () => {
      const root = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('First Sync', { create: true });
      const writer = await (
        await root.getFileHandle('Local draft.md', { create: true })
      ).createWritable();
      await writer.write('Keep this uncommitted note.\n');
      await writer.close();
    });
    await page.locator('#chooseDirectoryBtn').click();
    await expect(page.locator('#pageTree')).toContainText('Local draft');
    await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
    const panel = page.locator('#gitPanel');
    await panel
      .getByRole('button', { name: 'Configure GitHub synchronization', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Repository settings', exact: true });
    await dialog.getByLabel('Remote repository (HTTPS)').fill('https://github.com/test/notes.git');
    await dialog.getByLabel('CORS proxy (optional)').fill('http://127.0.0.1:4175/first-sync-proxy');
    await dialog.getByLabel('Author name').fill('Local author');
    await dialog.getByLabel('Author email').fill('local@example.com');
    await dialog.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(panel.getByLabel('Commit message')).toHaveValue('');
    await expect(panel.getByRole('button', { name: 'Sync workspace', exact: true })).toBeEnabled();
    await panel.getByRole('button', { name: 'Sync workspace', exact: true }).click();
    await expect(panel.getByText('Workspace synchronized.', { exact: true })).toBeVisible();
    expect(git('--git-dir', remote.bare, 'rev-parse', 'main').toString().trim()).toBe(originalHead);
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await expect(page.locator('#pageTree')).toContainText('Remote note');
    await expect(page.locator('#pageTree')).toContainText('Local draft');
    await page.locator('#pageTree').getByText('Remote note', { exact: true }).click();
    await expect(page.locator('#blockEditor')).toContainText('Downloaded on the first Sync.');
    const local = await page.evaluate(async () => {
      const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('First Sync');
      const config = await root.getDirectoryHandle('.laplace');
      return {
        note: await (await (await root.getFileHandle('Local draft.md')).getFile()).text(),
        settings: JSON.parse(
          await (await (await config.getFileHandle('app.json')).getFile()).text(),
        ),
      };
    });
    expect(local.note).toContain('Keep this uncommitted note.');
    expect(local.settings.spellcheckEnabled).toBe(false);
    await page.reload();
    await expect(page.locator('#pageTree')).toContainText('Remote note');
    await expect(page.locator('#pageTree')).toContainText('Local draft');
  } finally {
    await remote.close();
    if (!directory.startsWith(path.join(os.tmpdir(), 'laplace-first-sync-')))
      throw new Error('Unexpected fixture path');
    await fs.rm(directory, { recursive: true, force: true });
  }
});

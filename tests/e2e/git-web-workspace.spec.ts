import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createGitRemote } from '../fixtures/git-http';

async function flush(page: Page) {
  return page.evaluate(async () => {
    const module = await import(new URL('src/store/workspace.store.ts', location.href).href);
    return module.useWorkspaceStore.getState().controller.flush();
  });
}

test('adding a local workspace opens the folder picker directly without an intermediate dialog', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.assign(window, { workspacePickerCalls: 0 });
    Object.defineProperty(window, 'showDirectoryPicker', {
      value: async () => {
        (window as unknown as { workspacePickerCalls: number }).workspacePickerCalls++;
        throw new DOMException('Cancelled', 'AbortError');
      },
    });
  });
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  const trigger = page.getByRole('button', { name: 'Add or open a local workspace', exact: true });
  await trigger.click();
  await expect(
    page.getByRole('dialog', { name: 'Add or open workspace', exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { workspacePickerCalls: number }).workspacePickerCalls,
    ),
  ).toBe(1);
  await expect(page.locator('#workspaceSelect')).toHaveValue('browser');
});

test('web Git clones, edits, commits, pushes, reloads and switches without a folder picker', async ({
  page,
}) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'laplace-web-git-'));
  const remote = await createGitRemote(directory);
  try {
    const seed = path.join(directory, 'seed');
    const git = (...args: string[]) => execFileSync('git', args, { windowsHide: true });
    git('clone', remote.bare, seed);
    git('-C', seed, 'config', 'user.name', 'Web test');
    git('-C', seed, 'config', 'user.email', 'web@example.com');
    await fs.writeFile(path.join(seed, 'Remote note.md'), 'A note from GitHub.\n');
    git('-C', seed, 'add', '.');
    git('-C', seed, 'commit', '-m', 'Seed');
    git('-C', seed, 'push', 'origin', 'main');
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showDirectoryPicker', {
        value: () => {
          throw new Error('No folder picker allowed');
        },
      });
    });
    await page.route('**/web-git/github.com/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const suffix = url.pathname.split('/notes.git/')[1];
      const headers: Record<string, string> = {};
      const contentType = request.headers()['content-type'];
      if (contentType) headers['Content-Type'] = contentType;
      const result = await fetch(`${remote.url}/${suffix}${url.search}`, {
        method: request.method(),
        headers,
        body: request.postDataBuffer() ? new Uint8Array(request.postDataBuffer()!) : undefined,
      });
      await route.fulfill({
        status: result.status,
        contentType: result.headers.get('content-type') || '',
        body: Buffer.from(await result.arrayBuffer()),
      });
    });
    await page.goto('/laplace/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    const browserTitle = await page.locator('#pageTitle').textContent();
    await page.evaluate(async () => {
      const module = await import(new URL('src/store/workspace.store.ts', location.href).href);
      await module.useWorkspaceStore.getState().controller.invoke(
        'createWebWorkspace',
        {
          url: 'https://github.com/test/notes.git',
          corsProxy: 'http://127.0.0.1:4175/web-git',
          name: 'Web test',
          email: 'web@example.com',
        },
        { username: '', token: '' },
      );
    });
    await expect(page.locator('#workspaceSelect')).toHaveValue(/^web_/);
    const workspaceId = await page.locator('#workspaceSelect').inputValue();
    await page
      .locator('#pageTree [data-page-id]')
      .filter({ hasText: 'Remote note' })
      .first()
      .click();
    await expect(page.locator('#pageTitle')).toHaveText('Remote note');
    const paragraph = page.locator('#blockEditor [contenteditable="true"]').first();
    await paragraph.fill('Edited in the web workspace.');
    expect(await flush(page)).toBe(true);
    await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
    const panel = page.locator('#gitPanel');
    await expect(panel.getByLabel('Commit message')).toBeVisible();
    await panel.getByLabel('Commit message').fill('Edit in browser');
    await panel.getByRole('button', { name: 'Commit local changes', exact: true }).click();
    await expect(panel.getByText(/Commit created:/)).toBeVisible();
    await panel.getByRole('button', { name: 'Sync workspace', exact: true }).click();
    await expect
      .poll(() => git('--git-dir', remote.bare, 'show', 'main:Remote note.md').toString())
      .toContain('Edited in the web workspace.');
    await page.reload();
    await expect(page.locator('#workspaceSelect')).toHaveValue(workspaceId);
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await page
      .locator('#pageTree [data-page-id]')
      .filter({ hasText: 'Remote note' })
      .first()
      .click();
    await expect(page.locator('#blockEditor')).toContainText('Edited in the web workspace.');
    git('-C', seed, 'pull', '--ff-only');
    await fs.writeFile(path.join(seed, 'Incoming.md'), 'Received from the remote.\n');
    git('-C', seed, 'add', '.');
    git('-C', seed, 'commit', '-m', 'Remote addition');
    git('-C', seed, 'push', 'origin', 'main');
    await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
    await panel.getByRole('button', { name: 'Sync workspace', exact: true }).click();
    await expect(panel.getByText('Workspace synchronized.')).toBeVisible();
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await expect(page.locator('#pageTree')).toContainText('Incoming');
    await page.locator('#workspaceSelect').selectOption('browser');
    await expect(page.locator('#pageTitle')).toHaveText(browserTitle!);
    await page.locator('#workspaceSelect').selectOption(workspaceId);
    await expect(page.locator('#pageTree')).toContainText('Remote note');
    await page.locator('#closeWorkspaceBtn').click();
    await expect(
      page.getByText(/including changes and commits that have not been pushed/),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Delete web workspace', exact: true }).click();
    await expect(page.locator('#workspaceSelect')).toHaveValue('browser');
    expect(git('--git-dir', remote.bare, 'show', 'main:Remote note.md').toString()).toContain(
      'Edited in the web workspace.',
    );
  } finally {
    await remote.close();
    if (!directory.startsWith(path.join(os.tmpdir(), 'laplace-web-git-')))
      throw new Error('Unexpected fixture path');
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('failed web clone leaves the current browser workspace and notes intact', async ({ page }) => {
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  const original = await page.locator('#pageTitle').textContent();
  await page.route('**/web-git/**', (route) => route.fulfill({ status: 403, body: 'Denied' }));
  const failure = await page.evaluate(async () => {
    const module = await import(new URL('src/store/workspace.store.ts', location.href).href);
    try {
      await module.useWorkspaceStore.getState().controller.invoke(
        'createWebWorkspace',
        {
          url: 'https://github.com/test/private.git',
          corsProxy: 'http://127.0.0.1:4175/web-git',
          name: 'Web test',
          email: 'web@example.com',
        },
        { username: '', token: '' },
      );
      return '';
    } catch (error) {
      return String(error);
    }
  });
  expect(failure).not.toBe('');
  await expect(page.locator('#workspaceSelect')).toHaveValue('browser');
  await expect(page.locator('#pageTitle')).toHaveText(original!);
  expect(await flush(page)).toBe(true);
  await page.reload();
  await expect(page.locator('#pageTitle')).toHaveText(original!);
  const leftover = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const parent = await root.getDirectoryHandle('laplace-web');
    const names = [];
    for await (const name of (parent as unknown as { keys(): AsyncIterable<string> }).keys())
      names.push(name);
    return names;
  });
  expect(leftover).toEqual([]);
});

import { openGitFixtureSettings } from '../fixtures/git-workspace';
import { expect, test, type Locator } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createGitRemote } from '../fixtures/git-http';

async function repositoryAction(panel: Locator, name: string) {
  await panel.locator('header summary').click();
  await panel.getByRole('button', { name, exact: true }).click();
}

test('Git informs browser workspaces without offering a local-folder picker', async ({ page }) => {
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
  await expect(page.locator('#gitPanel')).toBeVisible();
  await expect(page.getByText('Git is not initialized in this workspace.')).toBeVisible();
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await expect(page.locator('#gitPanel')).toBeHidden();
  await expect(page.locator('#pageTree')).toBeVisible();
});

test('Source Control resizes with the sidebar and preserves the width across panels and reloads', async ({
  page,
}) => {
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  const sidebar = page.locator('#sidebar');
  const width = async () => Math.round((await sidebar.boundingBox())!.width);
  const initialWidth = await width();
  await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
  await expect(page.locator('#gitPanel')).toBeVisible();
  expect(await width()).toBe(initialWidth);
  const resizer = (await page.locator('[data-resizer="left"]').boundingBox())!;
  await page.mouse.move(resizer.x + resizer.width / 2, resizer.y + 100);
  await page.mouse.down();
  await page.mouse.move(44 + 356, resizer.y + 100, { steps: 10 });
  await page.mouse.up();
  await expect.poll(width).toBe(356);
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await expect(page.locator('#pageTree')).toBeVisible();
  expect(await width()).toBe(356);
  await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
  await expect(page.locator('#gitPanel')).toBeVisible();
  expect(await width()).toBe(356);
  await page.reload();
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('#gitPanel')).toBeVisible();
  await expect.poll(width).toBe(356);
});

test('Git panel commits notes in an existing repository, previews changes and restores saved credentials', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => navigator.storage.getDirectory(),
    });
  });
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const file = await root.getFileHandle('Sync note.md', { create: true });
    const writer = await file.createWritable();
    await writer.write('Original note.\n');
    await writer.close();
  });
  await page.locator('#chooseDirectoryBtn').click();
  await expect(page.locator('#pageTree')).toContainText('Sync note');
  await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
  const panel = page.locator('#gitPanel');
  await openGitFixtureSettings(page);
  await expect(panel.getByRole('heading', { name: 'Source Control', exact: true })).toHaveAttribute(
    'title',
    /main/,
  );
  const dialog = page.getByRole('dialog', { name: 'Repository settings' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Remote repository (HTTPS)')).toBeFocused();
  await expect(panel.getByLabel('Remote repository (HTTPS)')).toHaveCount(0);
  await dialog.getByLabel('Remote repository (HTTPS)').fill('https://example.com/workspace.git');
  await dialog.getByLabel('Author name').fill('Browser test');
  await dialog.getByLabel('Author email').fill('test@example.com');
  await dialog.getByRole('button', { name: 'Save settings' }).click();
  await expect(dialog).toBeHidden();
  await expect(panel.getByLabel('Commit message')).toHaveValue('');
  await expect(panel.getByRole('button', { name: 'Commit local changes' })).toBeDisabled();
  await panel.getByLabel('Commit message').fill('Initial notes');
  await expect(panel.getByRole('button', { name: 'Commit local changes' })).toBeEnabled();
  await panel.getByRole('button', { name: 'Commit local changes' }).click();
  await expect(panel.getByText(/Commit created:/)).toBeVisible();
  await expect(panel.getByText('There are no pending local changes.')).toBeVisible();
  await repositoryAction(panel, 'Repository settings');
  await dialog.getByLabel('Access token').fill('secret-browser-token');
  await dialog.getByRole('button', { name: 'Save settings' }).click();
  await expect(dialog).toBeHidden();
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const file = await root.getFileHandle('Sync note.md');
    const writer = await file.createWritable();
    await writer.write('Updated outside the editor.\n');
    await writer.close();
  });
  await panel.getByRole('button', { name: 'Refresh Git changes' }).click();
  await expect(panel.getByRole('button', { name: /Sync note.md.*Modified/ })).toBeVisible();
  await panel.getByRole('button', { name: /Sync note.md.*Modified/ }).click();
  const comparison = page.getByRole('region', { name: 'File comparison: Sync note.md' });
  await expect(comparison).toBeVisible();
  await comparison.focus();
  await page.keyboard.press('Control+Alt+r');
  await expect(page.locator('#rightSidebar')).toHaveClass(/collapsed/);
  await page.keyboard.press('Control+Alt+r');
  await expect(page.locator('#rightSidebar')).not.toHaveClass(/collapsed/);
  await expect(comparison.locator('[data-diff-kind="added"]')).toContainText(
    'Updated outside the editor.',
  );
  await expect(comparison.locator('[data-diff-kind="removed"]')).toContainText('Original note.');
  await expect(panel.getByText('Original note.', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /Sync note.md \(Changes\)/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await comparison.getByRole('button', { name: 'Unified view' }).click();
  await expect(comparison.getByRole('button', { name: 'Unified view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await comparison.getByRole('button', { name: 'Next change' }).click();
  await page.screenshot({ path: 'test-results/git-diff-editor.png', fullPage: true });
  await comparison.focus();
  await page.keyboard.press('Control+w');
  await expect(comparison).toHaveCount(0);
  await expect(page.locator('#workspaceEditorContent')).not.toHaveAttribute('hidden', '');
  const config = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle('.git');
    return (await (await directory.getFileHandle('config')).getFile()).text();
  });
  expect(config).not.toContain('secret-browser-token');
  await page.locator('#workspaceSelect').selectOption('browser');
  await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
  await page.locator('#workspaceSelect').selectOption({ label: 'Local workspace' });
  await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
  await panel.getByLabel('Commit message').fill('Synchronize notes');
  await expect(panel.getByRole('button', { name: 'Sync workspace' })).toBeEnabled();
  await repositoryAction(panel, 'Repository settings');
  await expect(dialog.getByLabel('Access token')).toHaveValue('secret-browser-token');
  // Cancel and Escape discard drafts and restore focus to the settings button.
  await dialog.getByLabel('Remote repository (HTTPS)').fill('https://example.com/discard.git');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(panel.locator('header summary')).toBeFocused();
  await repositoryAction(panel, 'Repository settings');
  await expect(dialog.getByLabel('Remote repository (HTTPS)')).toHaveValue(
    'https://example.com/workspace.git',
  );
  await dialog.getByLabel('Author name').fill('Discard this name');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await repositoryAction(panel, 'Repository settings');
  await expect(dialog.getByLabel('Author name')).toHaveValue('Browser test');
  await dialog.getByRole('button', { name: 'Save settings' }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close repository settings' })).toBeFocused();
  await page.screenshot({ path: 'test-results/git-repository-dialog.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Close repository settings' }).click();
  await expect(panel.getByRole('button', { name: 'Refresh Git changes' })).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/git-panel.png', fullPage: true });
});

test('saving pages updates Git changes without refreshing or interrupting the editor', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => navigator.storage.getDirectory(),
    });
  });
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const file = await root.getFileHandle('Sync note.md', { create: true });
    const writer = await file.createWritable();
    await writer.write('Original note.\n');
    await writer.close();
  });
  await page.locator('#chooseDirectoryBtn').click();
  await page.locator('#pageTree').getByText('Sync note', { exact: true }).click();
  const content = page.locator('#blockEditor .block-content').first();
  await content.fill('Baseline from the editor.');
  await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
  const panel = page.locator('#gitPanel');
  await openGitFixtureSettings(page);
  const dialog = page.getByRole('dialog', { name: 'Repository settings' });
  await dialog.getByLabel('Author name').fill('Browser test');
  await dialog.getByLabel('Author email').fill('test@example.com');
  await dialog.getByRole('button', { name: 'Save settings' }).click();
  await panel.getByLabel('Commit message').fill('Initial notes');
  await panel.getByRole('button', { name: 'Commit local changes' }).click();
  await expect(panel.getByText('There are no pending local changes.')).toBeVisible();

  await content.fill('Saved without manual refresh.');
  const modified = panel.getByRole('button', { name: 'Sync note.md Modified', exact: true });
  await expect(modified).toBeVisible();
  await expect(content).toBeFocused();
  await expect(content).toHaveAttribute('contenteditable', 'true');
  await expect(page.locator('#workspaceEditorContent')).not.toHaveAttribute('inert', '');
  await modified.click();
  const comparison = page.getByRole('region', { name: 'File comparison: Sync note.md' });
  await expect(comparison.locator('[data-diff-kind="added"]')).toContainText(
    'Saved without manual refresh.',
  );
  await comparison.focus();
  await page.keyboard.press('Control+w');

  await content.fill('Baseline from the editor.');
  await expect(modified).toHaveCount(0);
  await expect(panel.getByText('There are no pending local changes.')).toBeVisible();
  await expect(content).toBeFocused();

  const title = page.locator('#pageTitle');
  await title.fill('Renamed note');
  await title.press('Tab');
  await expect(
    panel.getByRole('button', { name: 'Sync note.md Deleted', exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole('button', { name: 'Renamed note.md Untracked', exact: true }),
  ).toBeVisible();
  await title.fill('Sync note');
  await title.press('Tab');
  await expect(panel.getByText('There are no pending local changes.')).toBeVisible();

  // Several consecutive saves must settle on the latest content, including after a commit.
  await content.fill('First update.');
  await expect(modified).toBeVisible();
  await content.fill('Latest update.');
  await panel.getByLabel('Commit message').fill('Update notes');
  await panel.getByRole('button', { name: 'Commit local changes' }).click();
  await expect(panel.getByText('There are no pending local changes.')).toBeVisible();
  await content.fill('After the commit.');
  await expect(modified).toBeVisible();
  await expect(content).toBeFocused();

  // Duplicate creates a page while Source Control remains visible.
  await page.getByRole('button', { name: 'Page options', exact: true }).click();
  await page.locator('#blockMenu').getByRole('button', { name: 'Duplicate', exact: true }).click();
  const duplicateTitle = (await title.textContent())!.trim();
  expect(duplicateTitle).not.toBe('Sync note');
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole('button', { name: `${duplicateTitle}.md Untracked`, exact: true }),
  ).toBeVisible();
  await panel.getByLabel('Commit message').fill('Add duplicate note');
  await panel.getByRole('button', { name: 'Commit local changes' }).click();
  await expect(panel.getByText('There are no pending local changes.')).toBeVisible();
  await page.getByRole('button', { name: 'Page options', exact: true }).click();
  await page.locator('#blockMenu').getByRole('button', { name: 'Delete', exact: true }).click();
  await page
    .getByRole('alertdialog', { name: 'Delete note?' })
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await expect(
    panel.getByRole('button', { name: `${duplicateTitle}.md Deleted`, exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('browser Git pushes to a real remote and reloads received notes in the editor', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'laplace-browser-git-'));
  const remote = await createGitRemote(temporary);
  try {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showDirectoryPicker', {
        configurable: true,
        value: async () => navigator.storage.getDirectory(),
      });
    });
    await page.goto('/laplace/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const file = await root.getFileHandle('Local note.md', { create: true });
      const writer = await file.createWritable();
      await writer.write('Local note sent to Git.\n');
      await writer.close();
    });
    await page.locator('#chooseDirectoryBtn').click();
    await expect(page.locator('#pageTree')).toContainText('Local note');
    await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
    const panel = page.locator('#gitPanel');
    await openGitFixtureSettings(page);
    const dialog = page.getByRole('dialog', { name: 'Repository settings' });
    await expect(dialog).toBeVisible();
    const readConfig = () =>
      page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        const directory = await root.getDirectoryHandle('.git');
        return (await (await directory.getFileHandle('config')).getFile()).text();
      });
    const configBeforeTest = await readConfig();
    // Testing uses unsaved values, works before entering a commit author, and does not save them.
    await dialog.getByRole('button', { name: 'Test connection', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Enter the remote repository URL.');
    await dialog
      .getByLabel('Remote repository (HTTPS)')
      .fill(remote.url.replace('remote.git', 'missing.git'));
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Test connection', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Repository not found.');
    await dialog.getByLabel('Remote repository (HTTPS)').fill(remote.url);
    await dialog.getByRole('button', { name: 'Test connection', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText(
      'Connection successful. The repository is readable.',
    );
    expect(await readConfig()).toBe(configBeforeTest);
    await page.screenshot({ path: 'test-results/git-connection-success.png', fullPage: true });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await repositoryAction(panel, 'Repository settings');
    await expect(dialog.getByLabel('Remote repository (HTTPS)')).toHaveValue('');
    await expect(dialog.getByRole('status')).toHaveCount(0);
    await dialog.getByLabel('Remote repository (HTTPS)').fill(remote.url);
    // Closing a pending test cancels it; a late response cannot overwrite the reopened dialog.
    const discovery = `${remote.url}/info/refs?service=git-upload-pack`;
    let started!: () => void;
    let release!: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const requestReleased = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(discovery, async (route) => {
      started();
      await requestReleased;
      await route.abort().catch(() => {});
    });
    await dialog.getByRole('button', { name: 'Test connection', exact: true }).click();
    await requestStarted;
    await expect(dialog.getByRole('button', { name: 'Save settings' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await repositoryAction(panel, 'Repository settings');
    release();
    await page.unroute(discovery);
    await expect(dialog.getByRole('status')).toHaveCount(0);
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(
      dialog.getByRole('button', { name: 'Test connection', exact: true }),
    ).toBeEnabled();
    await dialog.getByLabel('Remote repository (HTTPS)').fill(remote.url);
    await dialog.getByLabel('Author name').fill('Browser sync');
    await dialog.getByLabel('Author email').fill('browser@example.com');
    await dialog.getByRole('button', { name: 'Save settings' }).click();
    await expect(dialog).toBeHidden();
    await panel.getByLabel('Commit message').fill('Synchronize notes');
    await panel.getByLabel('More commit actions', { exact: true }).click();
    await panel.getByRole('button', { name: 'Commit & Push', exact: true }).click();
    await expect(panel.getByText('Changes committed and pushed.', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    const sent = execFileSync('git', ['--git-dir', remote.bare, 'show', 'main:Local note.md'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    expect(sent).toContain('Local note sent to Git.');
    const other = path.join(temporary, 'other');
    execFileSync('git', ['clone', remote.bare, other], { windowsHide: true });
    await fs.writeFile(
      path.join(other, 'Remote note.md'),
      'Received through Git synchronization.\n',
    );
    execFileSync('git', ['-C', other, 'add', 'Remote note.md'], { windowsHide: true });
    execFileSync(
      'git',
      [
        '-C',
        other,
        '-c',
        'user.name=Remote',
        '-c',
        'user.email=remote@example.com',
        'commit',
        '-m',
        'Add remote note',
      ],
      { windowsHide: true },
    );
    execFileSync('git', ['-C', other, 'push', 'origin', 'main'], { windowsHide: true });
    await repositoryAction(panel, 'Fetch remote');
    await expect(panel.getByText('Add remote note', { exact: false })).toBeVisible({
      timeout: 30_000,
    });
    await expect(panel.getByText('Remote note.md', { exact: true })).toBeVisible();
    await panel.getByLabel('Commit message').fill('Synchronize notes');
    await panel.getByLabel('More commit actions', { exact: true }).click();
    await panel.getByRole('button', { name: 'Commit & Sync', exact: true }).click();
    await expect(panel.getByText('Workspace synchronized.', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(panel.getByRole('button', { name: 'Sync workspace' })).toBeEnabled();
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await expect(page.locator('#pageTree')).toContainText('Remote note');
    await page
      .locator('#pageTree [data-action="open-page"]')
      .filter({ hasText: 'Remote note' })
      .click();
    await expect(page.locator('#blockEditor')).toContainText(
      'Received through Git synchronization.',
    );
  } finally {
    await remote.close();
    if (!temporary.startsWith(path.join(os.tmpdir(), 'laplace-browser-git-')))
      throw new Error('Unexpected temporary path');
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

for (const tokenType of ['classic', 'fine-grained'] as const) {
  test(`GitHub ${tokenType} tokens authenticate through automatic and custom proxies and survive reload`, async ({
    page,
  }) => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'laplace-browser-git-'));
    const token =
      tokenType === 'classic' ? 'ghp_classic-test-token' : 'github_pat_fine-grained-test-token';
    const username = tokenType === 'classic' ? 'draft-user' : '';
    const remote = await createGitRemote(temporary, `${username || 'git'}:${token}`);
    const github = 'https://github.com/test/workspace.git';
    const proxied: string[] = [];
    const direct: string[] = [];
    page.on('request', (request) => {
      if (request.url().startsWith('https://github.com/')) direct.push(request.url());
    });
    try {
      // Model GitHub without an internet dependency. Actual proxy forwarding is tested with native Git in unit tests.
      await page.route(
        /\/(api\/git-proxy|custom-git-proxy)\/github\.com\/test\/workspace\.git\//,
        async (route) => {
          const url = new URL(route.request().url());
          proxied.push(url.pathname);
          const target = `${remote.url}${url.pathname.split('/workspace.git')[1]}${url.search}`;
          await route.fulfill({ response: await route.fetch({ url: target }) });
        },
      );
      await page.addInitScript(() => {
        Object.defineProperty(window, 'showDirectoryPicker', {
          configurable: true,
          value: async () => navigator.storage.getDirectory(),
        });
      });
      await page.goto('/laplace/');
      await expect(page.locator('#pageTitle')).toBeVisible();
      await page.locator('#chooseDirectoryBtn').click();
      await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
      const panel = page.locator('#gitPanel');
      await openGitFixtureSettings(page);
      const dialog = page.getByRole('dialog', { name: 'Repository settings' });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('Remote repository (HTTPS)').fill(github);
      await expect(
        dialog.getByText('GitHub connections use the local development proxy automatically.'),
      ).toBeVisible();
      await dialog.getByLabel('Remote username').fill(username);
      await dialog.getByLabel('Token type').selectOption(tokenType);
      await expect(
        dialog.getByText(
          tokenType === 'classic' ? /grant the repo scope/ : /Contents: Read and write/,
        ),
      ).toBeVisible();
      await expect(dialog.getByRole('link', { name: 'Create token on GitHub' })).toHaveAttribute(
        'href',
        tokenType === 'classic'
          ? 'https://github.com/settings/tokens/new'
          : 'https://github.com/settings/personal-access-tokens/new',
      );
      await dialog.getByLabel('Access token').fill('wrong-token');
      await dialog.getByRole('button', { name: 'Test connection', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText('Access denied (HTTP 401).');
      await dialog.getByLabel('Access token').fill(` ${token} `);
      await expect(dialog.getByLabel('Access token')).toHaveValue(token);
      await expect(dialog.getByLabel('Token type')).toHaveValue(tokenType);
      await dialog.getByRole('button', { name: 'Test connection', exact: true }).click();
      await expect(dialog.getByRole('status')).toContainText('Connection successful.');
      expect(proxied).toContain('/api/git-proxy/github.com/test/workspace.git/info/refs');
      await dialog
        .getByLabel('CORS proxy (optional)')
        .fill('http://127.0.0.1:4175/custom-git-proxy/');
      await dialog.getByRole('button', { name: 'Test connection', exact: true }).click();
      await expect(dialog.getByRole('status')).toContainText('Connection successful.');
      expect(proxied).toContain('/custom-git-proxy/github.com/test/workspace.git/info/refs');
      await dialog.getByLabel('CORS proxy (optional)').fill('');
      await dialog.getByLabel('Author name').fill('Proxy user');
      await dialog.getByLabel('Author email').fill('proxy@example.com');
      await dialog.getByRole('button', { name: 'Save settings' }).click();
      await expect(dialog).toBeHidden();
      await panel.getByLabel('Commit message').fill('Synchronize notes');
      await panel.getByRole('button', { name: 'Sync workspace' }).click();
      await expect(panel.getByText('Workspace synchronized.', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      expect(proxied).toContain('/api/git-proxy/github.com/test/workspace.git/git-receive-pack');
      expect(direct).toEqual([]);
      const config = await page.evaluate(async () => {
        const git = await (await navigator.storage.getDirectory()).getDirectoryHandle('.git');
        return (await (await git.getFileHandle('config')).getFile()).text();
      });
      expect(config).not.toContain(token);
      await page.reload();
      await expect(panel.getByLabel('Commit message')).toBeVisible();
      await repositoryAction(panel, 'Repository settings');
      await expect(dialog.getByLabel('Access token')).toHaveValue(token);
      await expect(dialog.getByLabel('Token type')).toHaveValue(tokenType);
      await dialog.getByRole('button', { name: 'Test connection', exact: true }).click();
      await expect(dialog.getByRole('status')).toContainText('Connection successful.');
    } finally {
      await remote.close();
      if (!temporary.startsWith(path.join(os.tmpdir(), 'laplace-browser-git-')))
        throw new Error('Unexpected temporary path');
      await fs.rm(temporary, { recursive: true, force: true });
    }
  });
}

test('static builds explain the required GitHub proxy before attempting a direct CORS request', async ({
  page,
}) => {
  const direct: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://github.com/')) direct.push(request.url());
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => navigator.storage.getDirectory(),
    });
  });
  await page.goto('http://127.0.0.1:4176/laplace/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.locator('#chooseDirectoryBtn').click();
  await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
  await openGitFixtureSettings(page);
  const dialog = page.getByRole('dialog', { name: 'Repository settings' });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel('Remote repository (HTTPS)')
    .fill('https://github.com/test/workspace.git');
  await dialog.getByRole('button', { name: 'Test connection', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'GitHub requires a CORS proxy in the browser. Enter a trusted proxy URL in Repository settings.',
  );
  expect(direct).toEqual([]);
});

test('source control matches the compact VS Code layout with real staged and unstaged files', async ({
  page,
}) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'laplace-git-layout-'));
  const directory = 'src/Assistant.Web/src';
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: temporary, encoding: 'utf8' }).trim();
  try {
    git('init', '--initial-branch=main');
    git('config', 'user.name', 'Layout test');
    git('config', 'user.email', 'layout@example.com');
    git('config', 'core.autocrlf', 'false');
    git('remote', 'add', 'origin', 'https://example.com/layout.git');
    await fs.mkdir(path.join(temporary, directory), { recursive: true });
    await fs.writeFile(path.join(temporary, '.gitignore'), '.laplace/\n.obsidian/\n.trash/\n');
    await fs.writeFile(path.join(temporary, 'Workspace.md'), 'Workspace note.\n');
    for (const file of ['App.tsx', 'main.tsx', 'styles.css']) {
      await fs.writeFile(path.join(temporary, directory, file), '// Initial content\n');
    }
    const originalApp = [
      "import { useState } from 'preact/hooks';",
      '',
      "type Theme = 'light' | 'dark';",
      '',
      'export function App() {',
      "  const [theme, setTheme] = useState<Theme>('light');",
      '',
      '  return (',
      '    <main className={`app ${theme}`}>',
      '      <h1>Workspace</h1>',
      "      <button onClick={() => setTheme('light')}>",
      '        Use light mode',
      '      </button>',
      '    </main>',
      '  );',
      '}',
      '',
      ...Array.from({ length: 30 }, (_, i) => `// Unchanged context line ${i + 1}`),
      '',
    ].join('\n');
    const modifiedApp = originalApp
      .replace("useState<Theme>('light')", "useState<Theme>('dark')")
      .replace("setTheme('light')", "setTheme(theme === 'light' ? 'dark' : 'light')")
      .replace('Use light mode', 'Toggle theme');
    await fs.writeFile(path.join(temporary, directory, 'App.tsx'), originalApp);
    git('add', '.');
    git('commit', '-m', 'Initial layout');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    for (const file of ['App.tsx', 'main.tsx', 'styles.css']) {
      await fs.writeFile(path.join(temporary, directory, file), '// Modified content\n');
    }
    await fs.writeFile(path.join(temporary, directory, 'App.tsx'), modifiedApp);
    git('add', `${directory}/App.tsx`);
    await fs.writeFile(path.join(temporary, directory, 'types.d.ts'), '// Untracked types\n');
    const files: { path: string; base64: string }[] = [];
    async function collect(folder: string) {
      for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
        const filename = path.join(folder, entry.name);
        if (entry.isDirectory()) await collect(filename);
        else
          files.push({
            path: path.relative(temporary, filename).split(path.sep).join('/'),
            base64: (await fs.readFile(filename)).toString('base64'),
          });
      }
    }
    await collect(temporary);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showDirectoryPicker', {
        configurable: true,
        value: async () => navigator.storage.getDirectory(),
      });
    });
    await page.goto('/laplace/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await page.evaluate(async (files) => {
      const root = await navigator.storage.getDirectory();
      for (const file of files) {
        const segments = file.path.split('/');
        let folder = root;
        for (const segment of segments.slice(0, -1))
          folder = await folder.getDirectoryHandle(segment, { create: true });
        const handle = await folder.getFileHandle(segments.at(-1)!, { create: true });
        const writer = await handle.createWritable();
        await writer.write(
          Uint8Array.from(atob(file.base64), (character) => character.charCodeAt(0)),
        );
        await writer.close();
      }
    }, files);
    await page.locator('#chooseDirectoryBtn').click();
    await page.locator('#pageTree').getByText('Workspace', { exact: true }).click();
    await expect(page.locator('#pageEditor')).toBeVisible();
    await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
    const panel = page.locator('#gitPanel');
    const staged = panel
      .locator('details')
      .filter({ has: page.locator('summary').filter({ hasText: /^Staged Changes1$/ }) });
    const pending = panel
      .locator('details')
      .filter({ has: page.locator('summary').filter({ hasText: /^Changes8$/ }) });
    await expect(staged.getByRole('button')).toHaveCount(1);
    await expect(staged.getByRole('button')).toHaveAccessibleName(`${directory}/App.tsx Modified`);
    // Opening a legacy vault also migrates .gitignore and adds shared app settings.
    await expect(pending.getByRole('button')).toHaveCount(8);
    await expect(
      pending.getByRole('button', { name: '.gitignore Modified', exact: true }),
    ).toBeVisible();
    await expect(
      pending.getByRole('button', { name: '.laplace/app.json Untracked', exact: true }),
    ).toBeVisible();
    await expect(
      pending.getByRole('button', { name: `${directory}/types.d.ts Untracked`, exact: true }),
    ).toContainText('U');
    const message = panel.getByLabel('Commit message');
    await message.fill('feat: implement theme\nmanagement with light and dark\nmodes');
    await panel.getByRole('heading', { name: 'Source Control' }).click();
    await expect(
      panel.getByRole('button', { name: 'Commit local changes', exact: true }),
    ).toBeEnabled();
    const commitBounds = (await panel
      .getByRole('button', { name: 'Commit local changes', exact: true })
      .boundingBox())!;
    const groupBounds = (await staged.boundingBox())!;
    expect(commitBounds.y + commitBounds.height).toBeLessThanOrEqual(groupBounds.y);
    const bounds = (await panel.boundingBox())!;
    expect(Math.round(bounds.width)).toBe(276);
    const capture = async (theme: 'dark' | 'light') => {
      await page.evaluate(
        (theme) => document.body.classList.toggle('dark', theme === 'dark'),
        theme,
      );
      await page.screenshot({
        path: `test-results/git-vscode-panel-${theme}.png`,
        clip: { x: bounds.x, y: bounds.y, width: bounds.width, height: 378 },
      });
    };
    await capture('dark');
    await capture('light');
    await staged.getByRole('button').click();
    const diff = page.getByRole('region', { name: `File comparison: ${directory}/App.tsx` });
    await expect(diff).toBeVisible();
    await expect(diff.getByText('Staged content', { exact: true })).toBeVisible();
    const editorBounds = (await diff.boundingBox())!;
    const newRevisionBounds = (await diff
      .getByText('Staged content', { exact: true })
      .boundingBox())!;
    expect(newRevisionBounds.x + newRevisionBounds.width).toBeLessThanOrEqual(
      editorBounds.x + editorBounds.width,
    );
    await expect(
      diff.locator('[data-diff-kind="removed"]').filter({ hasText: "useState<Theme>('light')" }),
    ).toBeVisible();
    await expect(
      diff.locator('[data-diff-kind="added"]').filter({ hasText: "useState<Theme>('dark')" }),
    ).toBeVisible();
    await expect(page.locator('#pageEditor')).toBeHidden();
    await expect(panel.getByText('Toggle theme')).toHaveCount(0);
    const noteTabs = page.locator('#editorTabs [data-tab-id]');
    const openNoteCount = await noteTabs.count();
    await page.getByRole('tab', { name: 'App.tsx (Changes)' }).click({ button: 'middle' });
    await expect(diff).toHaveCount(0);
    await expect(page.locator('#pageEditor')).toBeVisible();
    await expect(noteTabs).toHaveCount(openNoteCount);
    await staged.getByRole('button').click();
    await expect(diff).toBeVisible();
    await diff
      .getByRole('button', { name: /Show more context/ })
      .last()
      .click();
    await expect(
      diff.getByText('// Unchanged context line 10', { exact: true }).first(),
    ).toBeVisible();
    await diff.getByRole('button', { name: 'Next change', exact: true }).click();
    await expect(page.locator('#toast')).toBeHidden();
    await page.screenshot({ path: 'test-results/git-diff-split-light.png', fullPage: true });
    await page.evaluate(() => document.body.classList.add('dark'));
    await page.screenshot({ path: 'test-results/git-diff-split-dark.png', fullPage: true });
    await diff.getByRole('button', { name: 'Unified view' }).click();
    await expect(diff.getByRole('button', { name: 'Unified view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Close comparison', exact: true }).click();
    await expect(diff).toHaveCount(0);
    await pending
      .getByRole('button', { name: `${directory}/types.d.ts Untracked`, exact: true })
      .click();
    await expect(
      page.locator('#gitDiffEditor').getByText('Working tree', { exact: true }),
    ).toBeVisible();
    await expect(page.locator('#gitDiffEditor [data-diff-kind="added"]')).toContainText(
      '// Untracked types',
    );
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await expect(page.locator('#gitDiffEditor')).toBeVisible();
    await page.locator('#pageTree').getByText('Workspace', { exact: true }).click();
    await expect(page.locator('#gitDiffEditor')).toHaveCount(0);
    await expect(page.locator('#pageTitle')).toBeVisible();
    await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
    // The presentation must preserve the native Git index and keep the menus usable.
    const index = await page.evaluate(async () => {
      const git = await (await navigator.storage.getDirectory()).getDirectoryHandle('.git');
      const handle = await git.getFileHandle('index');
      const file = await handle.getFile();
      const bytes = new Uint8Array(await file.arrayBuffer());
      return btoa(String.fromCharCode(...bytes));
    });
    expect(index).toBe(files.find((file) => file.path === '.git/index')!.base64);
    await panel.getByLabel('More commit actions', { exact: true }).click();
    await expect(panel.getByRole('button', { name: 'Commit & Push', exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Commit & Sync', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel.getByRole('button', { name: 'Commit & Sync', exact: true })).toBeHidden();
    await repositoryAction(panel, 'Repository settings');
    await expect(page.getByRole('dialog', { name: 'Repository settings' })).toBeVisible();
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('authenticated Git survives a cache-bypassing reload and supports removing saved credentials', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'laplace-git-auth-'));
  const remote = await createGitRemote(temporary, 'reload-user:reload-test-token');
  try {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showDirectoryPicker', {
        configurable: true,
        value: async () => navigator.storage.getDirectory(),
      });
    });
    await page.goto('/laplace/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const file = await root.getFileHandle('Authenticated.md', { create: true });
      const writer = await file.createWritable();
      await writer.write('Authenticated workspace.\n');
      await writer.close();
    });
    await page.locator('#chooseDirectoryBtn').click();
    await expect(page.locator('#pageTree')).toContainText('Authenticated');
    await expect(page.locator('#workspaceSelect')).not.toHaveValue('browser');
    const workspaceId = await page.locator('#workspaceSelect').inputValue();
    await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
    const panel = page.locator('#gitPanel');
    const dialog = page.getByRole('dialog', { name: 'Repository settings' });
    await openGitFixtureSettings(page);
    await dialog.getByLabel('Remote repository (HTTPS)').fill(remote.url);
    await dialog.getByLabel('Author name').fill('Reload test');
    await dialog.getByLabel('Author email').fill('reload@example.com');
    await dialog.getByLabel('Remote username').fill('reload-user');
    await dialog.getByLabel('Access token').fill('reload-test-token');
    await dialog.getByRole('button', { name: 'Save settings' }).click();
    await expect(dialog).toBeHidden();
    await panel.getByLabel('Commit message').fill('Synchronize notes');
    await panel.getByRole('button', { name: 'Sync workspace', exact: true }).click();
    await expect(panel.getByText('Workspace synchronized.', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    expect(
      execFileSync('git', ['--git-dir', remote.bare, 'show', 'main:Authenticated.md'], {
        encoding: 'utf8',
        windowsHide: true,
      }),
    ).toContain('Authenticated workspace.');
    const persisted = await page.evaluate(
      async ({ workspaceId, url }) => {
        const modulePath = '/laplace/src/features/git/services/git-credentials.ts';
        const credentials = await import(modulePath);
        const otherWorkspace = await credentials.loadGitCredentials(`${workspaceId}-other`, url);
        const otherRepository = await credentials.loadGitCredentials(
          workspaceId,
          url.replace('remote.git', 'other.git'),
        );
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('laplace-git-credentials', 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const read = (store: string) =>
          new Promise<any[]>((resolve, reject) => {
            const transaction = database.transaction(store, 'readonly');
            const request = transaction.objectStore(store).getAll();
            transaction.oncomplete = () => resolve(request.result);
            transaction.onabort = () => reject(transaction.error);
          });
        const records = await read('credentials');
        const keys = await read('keys');
        database.close();
        const root = await navigator.storage.getDirectory();
        const git = await root.getDirectoryHandle('.git');
        const config = await (await (await git.getFileHandle('config')).getFile()).text();
        return {
          otherWorkspace,
          otherRepository,
          count: records.length,
          encrypted: records.every(
            (record) =>
              !('token' in record) &&
              !('username' in record) &&
              record.ciphertext instanceof ArrayBuffer &&
              !new TextDecoder().decode(record.ciphertext).includes('reload-test-token'),
          ),
          keyExtractable: keys[0].extractable,
          configContainsToken: config.includes('reload-test-token'),
        };
      },
      { workspaceId, url: remote.url },
    );
    expect(persisted).toEqual({
      otherWorkspace: { username: '', token: '' },
      otherRepository: { username: '', token: '' },
      count: 1,
      encrypted: true,
      keyExtractable: false,
      configContainsToken: false,
    });
    const hardReload = async () => {
      const session = await page.context().newCDPSession(page);
      await session.send('Network.enable');
      await session.send('Network.setCacheDisabled', { cacheDisabled: true });
      await page.reload();
      await expect(page.locator('#workspaceSelect')).toHaveValue(workspaceId);
      if (!(await panel.isVisible()))
        await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
      await expect(panel.getByRole('button', { name: 'Refresh Git changes' })).toBeEnabled();
      await session.detach();
    };
    await hardReload();
    // A real server requiring the saved credentials must accept the request after reload.
    await repositoryAction(panel, 'Fetch remote');
    await expect(
      panel.getByText('Remote fetched. The latest remote changes are shown below.', {
        exact: true,
      }),
    ).toBeVisible({ timeout: 30_000 });
    await repositoryAction(panel, 'Repository settings');
    await expect(dialog.getByLabel('Remote username')).toHaveValue('reload-user');
    await expect(dialog.getByLabel('Access token')).toHaveValue('reload-test-token');
    await dialog
      .getByLabel('Remote repository (HTTPS)')
      .fill(remote.url.replace('remote.git', 'other.git'));
    await expect(dialog.getByLabel('Access token')).toHaveValue('');
    await dialog.getByLabel('Remote repository (HTTPS)').fill(remote.url);
    await expect(dialog.getByLabel('Access token')).toHaveValue('reload-test-token');
    await dialog.getByLabel('Access token').fill('unsaved-token');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await repositoryAction(panel, 'Repository settings');
    await expect(dialog.getByLabel('Access token')).toHaveValue('reload-test-token');
    await dialog.getByLabel('Access token').fill('');
    await dialog.getByRole('button', { name: 'Save settings' }).click();
    await expect(dialog).toBeHidden();
    await hardReload();
    await repositoryAction(panel, 'Repository settings');
    await expect(dialog.getByLabel('Access token')).toHaveValue('');
    await dialog.getByRole('button', { name: 'Test connection', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Access denied (HTTP 401).');
  } finally {
    await remote.close();
    if (!temporary.startsWith(path.join(os.tmpdir(), 'laplace-git-auth-')))
      throw new Error('Unexpected temporary path');
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

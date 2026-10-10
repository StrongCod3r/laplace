import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createGitRemote } from '../fixtures/git-http';

test('automation keeps its deadline across panel switches and focused editing, and resumes overdue checks after dialogs', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => navigator.storage.getDirectory(),
    });
  });
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const file = await root.getFileHandle('Timing.md', { create: true });
    const writer = await file.createWritable();
    await writer.write('First scheduled version.\n');
    await writer.close();
  });
  await page.locator('#chooseDirectoryBtn').click();
  await page.locator('#pageTree').getByText('Timing', { exact: true }).click();
  await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
  const panel = page.locator('#gitPanel');
  await panel.getByRole('button', { name: 'Initialize repository', exact: true }).click();
  const repository = page.getByRole('dialog', { name: 'Repository settings' });
  await repository.getByLabel('Author name').fill('Timer test');
  await repository.getByLabel('Author email').fill('timer@example.com');
  await repository.getByRole('button', { name: 'Save settings' }).click();
  await expect(repository).toBeHidden();
  await page.clock.install();
  await panel.locator('header summary').click();
  await panel.getByRole('button', { name: 'Automatic commit settings', exact: true }).click();
  const automation = page.getByRole('dialog', { name: 'Automatic commits', exact: true });
  await automation.getByLabel('Enable automatic commits').check();
  await automation.getByLabel('Interval (minutes)').fill('1');
  await automation.getByLabel('Commit message format').fill('Timed commit');
  await automation.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(automation).toBeHidden();
  await page.clock.fastForward(20_000);
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await page.clock.fastForward(20_000);
  await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  const content = page.locator('#blockEditor .block-content').first();
  await content.fill('Committed with the editor focused.');
  await expect(content).toBeFocused();
  await page.evaluate(() => {
    const state = window as unknown as Window & { automaticUiLocks: string[] };
    state.automaticUiLocks = [];
    const editor = document.querySelector('main')!;
    new MutationObserver((records) => {
      if (records.some((record) => record.attributeName === 'inert'))
        state.automaticUiLocks.push('editor');
      if (document.body.classList.contains('workspace-read-only'))
        state.automaticUiLocks.push('read-only');
    }).observe(document.querySelector('#app')!, {
      attributes: true,
      subtree: true,
      attributeFilter: ['inert', 'class'],
    });
    if (editor.hasAttribute('inert')) state.automaticUiLocks.push('initial');
  });
  await page.clock.fastForward(20_000);
  await expect(panel.getByText(/Automatic commit created:/)).toBeVisible();
  await expect(panel.getByText('There are no pending local changes.')).toBeVisible();
  await expect(content).toBeFocused();
  expect(
    await page.evaluate(
      () => (window as unknown as Window & { automaticUiLocks: string[] }).automaticUiLocks,
    ),
  ).toEqual([]);
  const readHead = () =>
    page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const git = await root.getDirectoryHandle('.git');
      const refs = await (await git.getDirectoryHandle('refs')).getDirectoryHandle('heads');
      return (await (await refs.getFileHandle('main')).getFile()).text();
    });
  const firstHead = await readHead();

  await content.fill('Due while settings are open.');
  await panel.locator('header summary').click();
  await panel.getByRole('button', { name: 'Repository settings', exact: true }).click();
  await expect(repository).toBeVisible();
  await page.clock.fastForward(60_000);
  await expect(repository).toBeVisible();
  await repository.getByRole('button', { name: 'Cancel', exact: true }).click();
  // No additional minute elapses: the due operation resumes as soon as the dialog closes.
  await page.clock.runFor(100);
  await expect.poll(readHead).not.toBe(firstHead);
  await expect(panel.getByText('There are no pending local changes.')).toBeVisible();
  const saved = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    return (await (await root.getFileHandle('Timing.md')).getFile()).text();
  });
  expect(saved).toBe('Due while settings are open.\n');
});

test('automatic commits opt in to push, retry failed uploads and persist settings', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'laplace-auto-push-'));
  const remote = await createGitRemote(temporary, 'auto-user:auto-token');
  const remoteGit = (...args: string[]) => {
    try {
      return execFileSync('git', ['--git-dir', remote.bare, ...args], {
        encoding: 'utf8',
        windowsHide: true,
        stdio: 'pipe',
      }).trim();
    } catch {
      return '';
    }
  };
  try {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showDirectoryPicker', {
        configurable: true,
        value: async () => navigator.storage.getDirectory(),
      });
    });
    await page.goto('/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const file = await root.getFileHandle('Scheduled note.md', { create: true });
      const writer = await file.createWritable();
      await writer.write('Initial content.\n');
      await writer.close();
    });
    await page.locator('#chooseDirectoryBtn').click();
    await page.locator('#pageTree').getByText('Scheduled note', { exact: true }).click();
    await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
    const panel = page.locator('#gitPanel');
    await panel.getByRole('button', { name: 'Initialize repository', exact: true }).click();
    const repository = page.getByRole('dialog', { name: 'Repository settings' });
    await repository.getByLabel('Remote repository (HTTPS)').fill(remote.url);
    await repository.getByLabel('Author name').fill('Automatic user');
    await repository.getByLabel('Author email').fill('automatic@example.com');
    await repository.getByLabel('Remote username').fill('auto-user');
    await repository.getByLabel('Access token').fill('auto-token');
    await repository.getByRole('button', { name: 'Save settings' }).click();
    await expect(repository).toBeHidden();
    const workspaceId = await page.locator('#workspaceSelect').inputValue();
    await page.evaluate((workspaceId) => {
      localStorage.setItem(
        `laplace:git:auto-commit:${encodeURIComponent(workspaceId)}`,
        JSON.stringify({
          enabled: false,
          autoPush: false,
          intervalMinutes: 9,
          messageFormat: 'Legacy {workspace}',
        }),
      );
    }, workspaceId);
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
    await expect(panel).toHaveAttribute('aria-busy', 'false');
    await page.clock.install();
    const automation = page.getByRole('dialog', { name: 'Automatic commits', exact: true });
    const openAutomation = async () => {
      await panel.locator('header summary').click();
      await panel.getByRole('button', { name: 'Automatic commit settings', exact: true }).click();
      await expect(automation).toBeVisible();
    };
    await openAutomation();
    await expect(automation.getByLabel('Interval (minutes)')).toHaveValue('9');
    await expect(automation.getByLabel('Commit message format')).toHaveValue('Legacy {workspace}');
    await expect(automation.getByLabel('Auto push', { exact: true })).not.toBeChecked();
    await automation.getByLabel('Enable automatic commits').check();
    await automation.getByLabel('Interval (minutes)').fill('1');
    await automation.getByLabel('Commit message format').fill('Scheduled {branch}: {workspace}');
    await automation.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(automation).toBeHidden();
    await page.clock.fastForward(60_000);
    await expect(panel.getByText(/Automatic commit created:/)).toBeVisible();
    expect(remoteGit('rev-parse', '--verify', 'main')).toBe('');

    // Enabling push uploads previous commits and commits the updated shared automation settings.
    await openAutomation();
    await automation.getByLabel('Auto push', { exact: true }).check();
    await automation.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(automation).toBeHidden();
    let releasePush!: () => void;
    let pushStarted = false;
    const pushGate = new Promise<void>((resolve) => {
      releasePush = resolve;
    });
    let pushContinued!: () => void;
    const continued = new Promise<void>((resolve) => {
      pushContinued = resolve;
    });
    await page.route(`${remote.url}/git-receive-pack`, async (route) => {
      pushStarted = true;
      await pushGate;
      try {
        await route.continue();
      } finally {
        pushContinued();
      }
    });
    await page.clock.fastForward(60_000);
    await expect.poll(() => pushStarted).toBe(true);
    const content = page.locator('#blockEditor .block-content').first();
    try {
      await expect(page.locator('main')).not.toHaveAttribute('inert', '');
      await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
      await expect(
        panel.getByRole('button', { name: 'Refresh Git changes', exact: true }),
      ).toBeDisabled();
      await content.fill('Edited while push was running.');
      await expect(content).toBeFocused();
      await page.clock.runFor(1000);
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const root = await navigator.storage.getDirectory();
            return (await (await root.getFileHandle('Scheduled note.md')).getFile()).text();
          }),
        )
        .toBe('Edited while push was running.\n');
      await page.getByRole('button', { name: 'Files', exact: true }).click();
      await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
      await content.click();
    } finally {
      releasePush();
      await continued;
      await page.unroute(`${remote.url}/git-receive-pack`);
    }
    await expect.poll(() => remoteGit('show', 'main:Scheduled note.md')).toBe('Initial content.');
    await expect(panel.getByText('Automatic push completed.')).toBeVisible();
    await expect(content).toHaveText('Edited while push was running.');
    await expect(content).toBeFocused();
    const firstOid = remoteGit('rev-parse', 'main');
    expect(remoteGit('rev-list', '--count', 'main')).toBe('2');
    expect(remoteGit('log', '-1', '--format=%s')).toMatch(/^Scheduled main:/);

    await content.fill('Updated automatically.');
    await panel.getByRole('heading', { name: 'Source Control', exact: true }).click();
    await page.clock.runFor(1000);
    await expect(
      panel.getByRole('button', { name: 'Scheduled note.md Modified', exact: true }),
    ).toBeVisible();
    await page.route(`${remote.url}/git-receive-pack`, (route) => route.abort());
    await page.clock.fastForward(60_000);
    await expect(panel.getByRole('alert')).toBeVisible();
    await expect(panel.getByText('There are no pending local changes.')).toBeVisible();
    expect(remoteGit('rev-parse', 'main')).toBe(firstOid);
    await page.unroute(`${remote.url}/git-receive-pack`);
    await page.clock.fastForward(60_000);
    await expect
      .poll(() => remoteGit('show', 'main:Scheduled note.md'))
      .toBe('Updated automatically.');
    await expect(panel.getByRole('alert')).toHaveCount(0);
    expect(remoteGit('rev-list', '--count', 'main')).toBe('3');
    // Browser storage is no longer the source for automation settings.
    const config = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const settings = await root.getDirectoryHandle('.laplace');
      return (await (await settings.getFileHandle('git-automation.json')).getFile()).text();
    });
    expect(JSON.parse(config)).toMatchObject({ enabled: true, autoPush: true, intervalMinutes: 1 });
    expect(config).not.toContain('auto-token');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('#pageTitle')).toBeVisible();
    await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
    await openAutomation();
    await expect(automation.getByLabel('Enable automatic commits')).toBeChecked();
    await expect(automation.getByLabel('Auto push', { exact: true })).toBeChecked();
    await expect(automation.getByLabel('Interval (minutes)')).toHaveValue('1');
    await expect(automation.getByLabel('Commit message format')).toHaveValue(
      'Scheduled {branch}: {workspace}',
    );
    await automation.getByRole('button', { name: 'Cancel', exact: true }).click();
    await panel.locator('header summary').click();
    await panel.getByRole('button', { name: 'Repository settings', exact: true }).click();
    await expect(repository.getByLabel('Access token')).toHaveValue('auto-token');
  } finally {
    await remote.close();
    const resolved = path.resolve(temporary);
    expect(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)).toBe(true);
    await fs.rm(resolved, { recursive: true, force: true });
  }
});

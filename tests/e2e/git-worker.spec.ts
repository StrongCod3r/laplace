import { prepareGitRepository } from '../fixtures/git-workspace';
import { expect, test } from '@playwright/test';

test('Git shows progress and keeps panel navigation responsive during worker reads', async ({
  page,
}) => {
  const workers: string[] = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => navigator.storage.getDirectory(),
    });
    const original = Worker.prototype.postMessage;
    let hold = true;
    const queued: (() => void)[] = [];
    Worker.prototype.postMessage = function (message, options) {
      const send = () => original.call(this, message, options as StructuredSerializeOptions);
      if (hold && message?.method === 'status') queued.push(send);
      else send();
    };
    Object.assign(window, {
      holdGitReads() {
        hold = true;
      },
      releaseGitReads() {
        hold = false;
        queued.splice(0).forEach((send) => send());
      },
    });
  });
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await prepareGitRepository(page);
  await page.locator('#chooseDirectoryBtn').click();
  await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
  const panel = page.locator('#gitPanel');
  await expect(panel).toHaveAttribute('aria-busy', 'true');
  await expect(panel.getByRole('progressbar')).toBeVisible();
  await expect(panel.getByRole('progressbar')).toHaveText('');
  await expect.poll(() => workers.some((url) => url.includes('git.worker'))).toBe(true);
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await expect(page.locator('#pageTree')).toBeVisible();
  await expect(panel).toBeHidden();
  await page.evaluate(() => (window as unknown as { releaseGitReads(): void }).releaseGitReads());
  await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await expect(panel.getByRole('progressbar')).toHaveCount(0);
  await expect(panel.getByLabel('Commit message')).toBeVisible();
  await page.evaluate(() => (window as unknown as { holdGitReads(): void }).holdGitReads());
  await panel.getByRole('button', { name: 'Refresh Git changes' }).click();
  const progress = panel.getByRole('progressbar');
  await expect(progress).toBeVisible();
  const commitBounds = (await panel
    .getByRole('button', { name: 'Commit local changes' })
    .boundingBox())!;
  const progressBounds = (await progress.boundingBox())!;
  expect(progressBounds.y).toBeGreaterThanOrEqual(commitBounds.y + commitBounds.height);
  expect(progressBounds.height).toBe(3);
  await expect(progress).toHaveText('');
  await page.evaluate(() => document.body.classList.add('dark'));
  await panel.screenshot({ path: 'test-results/git-progress-dark.png' });
  await page.evaluate(() => document.body.classList.remove('dark'));
  await panel.screenshot({ path: 'test-results/git-progress-light.png' });
  await page.evaluate(() => (window as unknown as { releaseGitReads(): void }).releaseGitReads());
  await expect(progress).toHaveCount(0);
  const initializedWorkers = workers.length;
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  expect(workers.length).toBe(initializedWorkers);
});

test('Git worker serializes operations and prepares file differences away from the UI', async ({
  page,
}) => {
  const workers: string[] = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  await page.goto('/laplace/');
  const result = await page.evaluate(async () => {
    const modulePath = '/laplace/src/features/git/services/git-worker-client.ts';
    const { createGitClient } = await import(modulePath);
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle('worker-test', { create: true });
    const write = async (content: string) => {
      const stream = await (
        await directory.getFileHandle('Note.md', { create: true })
      ).createWritable();
      await stream.write(content);
      await stream.close();
    };
    const client = await createGitClient(directory);
    try {
      let failure = '';
      try {
        await client.configure({ url: '', corsProxy: '', name: '', email: '' });
      } catch (error) {
        failure = (error as Error).message;
      }
      await write('Original\n');
      // These deliberately overlap; configure must wait until initialization is complete.
      await Promise.all([
        client.initialize(),
        client.configure({
          url: '',
          corsProxy: '',
          name: 'Worker test',
          email: 'worker@example.com',
        }),
      ]);
      await client.commit('Initial content');
      await write('Updated\n');
      let ticks = 0;
      const timer = setInterval(() => ticks++, 0);
      try {
        const preview = await client.preview('Note.md', 'unstaged');
        const pendingStatus = client.status();
        client.dispose();
        const snapshot = await pendingStatus;
        return { ticks, failure, preview, changes: snapshot.unstagedChanges };
      } finally {
        clearInterval(timer);
      }
    } finally {
      client.dispose();
    }
  });
  expect(workers.some((url) => url.includes('git.worker'))).toBe(true);
  expect(result.ticks).toBeGreaterThan(0);
  expect(result.failure).toContain('Open a branch in a Git repository');
  expect(result.changes).toContainEqual({ path: 'Note.md', kind: 'modified' });
  expect(result.preview.lines).toEqual([
    { kind: 'removed', text: 'Original\n', beforeLine: 1 },
    { kind: 'added', text: 'Updated\n', afterLine: 1 },
  ]);
});

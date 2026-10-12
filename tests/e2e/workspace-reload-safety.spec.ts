import { expect, test } from '@playwright/test';

test('restarting the editor during a delayed folder scan preserves every local note', async ({
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
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    for (let index = 0; index < 8; index++) {
      const file = await root.getFileHandle(`Saved ${index}.md`, { create: true });
      const writer = await file.createWritable();
      await writer.write(`Content saved before restarting ${index}\n`);
      await writer.close();
    }
  });
  await page.locator('#chooseDirectoryBtn').click();
  await expect(page.locator('#pageTree .page-tree-row')).toHaveCount(8);
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  await page.evaluate(async () => {
    const modulePath = new URL('src/store/workspace.store.ts', location.href).pathname;
    const { useWorkspaceStore } = await import(/* @vite-ignore */ modulePath);
    await useWorkspaceStore.getState().controller.flush();
    const root = await navigator.storage.getDirectory();
    const sample = await root.getFileHandle('Saved 0.md');
    const prototype = Object.getPrototypeOf(sample);
    const getFile = prototype.getFile;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    (window as any).reloadSafety = { paused: false, release, prototype, getFile };
    prototype.getFile = async function () {
      if (this.name.endsWith('.md')) {
        (window as any).reloadSafety.paused = true;
        await gate;
      }
      return getFile.call(this);
    };
    const remountPath = new URL('tests/fixtures/remount.tsx', location.href).pathname;
    const { remountWorkspace } = await import(/* @vite-ignore */ remountPath);
    await remountWorkspace({ flush: false });
  });
  await page.waitForFunction(() => (window as any).reloadSafety.paused);
  await expect(page.locator('body')).toHaveClass(/workspace-read-only/);
  await page.evaluate(async () => {
    const remountPath = new URL('tests/fixtures/remount.tsx', location.href).pathname;
    const { remountWorkspace } = await import(/* @vite-ignore */ remountPath);
    await remountWorkspace({ flush: false });
    const probe = (window as any).reloadSafety;
    probe.prototype.getFile = probe.getFile;
    probe.release();
  });
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  await expect(page.locator('#pageTree .page-tree-row')).toHaveCount(8);
  const saved = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const notes: string[] = [];
    for (let index = 0; index < 8; index++) {
      notes.push(await (await (await root.getFileHandle(`Saved ${index}.md`)).getFile()).text());
    }
    return notes;
  });
  expect(saved).toEqual(
    Array.from({ length: 8 }, (_, index) => `Content saved before restarting ${index}\n`),
  );
  await page.reload();
  await expect(page.locator('#pageTree .page-tree-row')).toHaveCount(8);
  const note = page.locator('#pageTree .page-tree-row').filter({ hasText: 'Saved 0' });
  await note.click({ button: 'right' });
  await page.locator('[data-tree-context-action="delete-page"]').click();
  await expect(page.locator('#deleteConfirmDialog')).toBeVisible();
  await page.locator('#deleteConfirmCancel').click();
  await expect(page.locator('#pageTree .page-tree-row')).toHaveCount(8);
  await note.click({ button: 'right' });
  await page.locator('[data-tree-context-action="delete-page"]').click();
  await expect(page.locator('#deleteConfirmDialog')).toBeVisible();
  await page.locator('#deleteConfirmAccept').click();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        const files: string[] = [];
        for await (const [name] of (root as any).entries())
          if (name.endsWith('.md')) files.push(name);
        return files.sort();
      }),
    )
    .toEqual(Array.from({ length: 7 }, (_, index) => `Saved ${index + 1}.md`));
});

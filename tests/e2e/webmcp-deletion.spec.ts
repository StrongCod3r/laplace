import { expect, test } from '@playwright/test';

test('WebMCP deletions require confirmation, persist only notes and support Undo', async ({
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
    const folder = await root.getDirectoryHandle('Keep', { create: true });
    const attachments = await root.getDirectoryHandle('.attachments', { create: true });
    for (const [directory, name] of [
      [folder, 'unmanaged.txt'],
      [attachments, 'keep.txt'],
    ] as const) {
      const writer = await (await directory.getFileHandle(name, { create: true })).createWritable();
      await writer.write('Keep this file');
      await writer.close();
    }
  });
  await page.locator('#chooseDirectoryBtn').click();
  const tool = (name: string, args: Record<string, unknown> = {}) =>
    page.evaluate(
      async ({ name, args }) => {
        const { useWorkspaceStore } = await import(
          /* @vite-ignore */ new URL('src/store/workspace.store.ts', location.href).href
        );
        const store = useWorkspaceStore.getState();
        const result = await store.controller.invokeWebMcpTool(store.ui.activeVaultId, name, args);
        return JSON.parse((result as { content: { text: string }[] }).content[0].text);
      },
      { name, args },
    );
  await expect
    .poll(async () => {
      try {
        return (await tool('laplace_workspace')).noteCount;
      } catch {
        return -1;
      }
    })
    .toBe(0);
  const parent = await tool('laplace_create_note', {
    title: 'Parent',
    markdown: 'Parent body',
    folderPath: '',
  });
  await tool('laplace_create_note', {
    title: 'Child',
    markdown: 'Child body',
    parentPageId: parent.pageId,
  });
  const other = await tool('laplace_create_note', {
    title: 'Other',
    markdown: 'Other body',
    folderPath: '',
  });
  await tool('laplace_save_workspace');
  const disk = () =>
    page.evaluate(async () => {
      const paths: string[] = [];
      const walk = async (directory: FileSystemDirectoryHandle, prefix = '') => {
        const entries = (
          directory as FileSystemDirectoryHandle & {
            entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
          }
        ).entries();
        for await (const [name, handle] of entries) {
          if (name === '.laplace') continue;
          if (handle.kind === 'directory')
            await walk(handle as FileSystemDirectoryHandle, `${prefix}${name}/`);
          else paths.push(`${prefix}${name}`);
        }
      };
      await walk(await navigator.storage.getDirectory());
      return paths.sort();
    });
  const original = await disk();
  expect(original.filter((path) => path.endsWith('.md'))).toHaveLength(3);
  const cancelled = await tool('laplace_delete_all_notes', { expectedNoteCount: 3 });
  expect(cancelled.status).toBe('pending_confirmation');
  await expect(page.locator('#deleteConfirmDialog')).toBeVisible();
  expect(await disk()).toEqual(original);
  await page.locator('#deleteConfirmCancel').click();
  await expect
    .poll(
      async () =>
        (await tool('laplace_deletion_status', { requestId: cancelled.requestId })).status,
    )
    .toBe('cancelled');
  expect(await disk()).toEqual(original);
  const stale = await tool('laplace_delete_all_notes', { expectedNoteCount: 3 });
  await tool('laplace_append_note', {
    pageId: other.pageId,
    expectedMarkdown: other.markdown,
    markdown: 'New edit',
  });
  await page.locator('#deleteConfirmAccept').click();
  await expect
    .poll(
      async () => (await tool('laplace_deletion_status', { requestId: stale.requestId })).status,
    )
    .toBe('failed');
  expect((await tool('laplace_workspace')).noteCount).toBe(3);
  const deleted = await tool('laplace_delete_note', {
    pageId: parent.pageId,
    expectedMarkdown: parent.markdown,
  });
  expect(deleted.noteCount).toBe(2);
  await page.locator('#deleteConfirmAccept').click();
  await expect
    .poll(
      async () => (await tool('laplace_deletion_status', { requestId: deleted.requestId })).status,
    )
    .toBe('deleted');
  expect((await tool('laplace_workspace')).noteCount).toBe(1);
  expect(await disk()).toEqual(['.attachments/keep.txt', 'Keep/unmanaged.txt', 'Other.md']);
  const all = await tool('laplace_delete_all_notes', { expectedNoteCount: 1 });
  await page.locator('#deleteConfirmAccept').click();
  await expect
    .poll(async () => (await tool('laplace_deletion_status', { requestId: all.requestId })).saved)
    .toBe(true);
  expect((await tool('laplace_workspace')).noteCount).toBe(0);
  expect(await disk()).toEqual(['.attachments/keep.txt', 'Keep/unmanaged.txt']);
  const undo = () =>
    page.evaluate(async () => {
      const { useWorkspaceStore } = await import(
        /* @vite-ignore */ new URL('src/store/workspace.store.ts', location.href).href
      );
      await useWorkspaceStore.getState().controller.invoke('undoWorkspace');
    });
  await undo();
  expect((await tool('laplace_workspace')).noteCount).toBe(1);
  await undo();
  expect((await tool('laplace_workspace')).noteCount).toBe(3);
  await tool('laplace_save_workspace');
  expect(await disk()).toEqual(original);
  await page.reload();
  await expect
    .poll(async () => {
      try {
        return (await tool('laplace_workspace')).noteCount;
      } catch {
        return -1;
      }
    })
    .toBe(3);
});

import { expect, test } from '@playwright/test';

test('Untitled.md and an existing Untitled directory persist independently in a local workspace', async ({
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
    const directory = await root.getDirectoryHandle('Untitled', { create: true });
    const child = await directory.getFileHandle('Child.md', { create: true });
    const writer = await child.createWritable();
    await writer.write('Existing child content.\n');
    await writer.close();
  });
  await page.locator('#chooseDirectoryBtn').click();
  await expect(page.locator('[data-folder-path="Untitled"]')).toBeVisible();
  await page.locator('#newPageBtn').click();
  await expect(page.locator('#pageTitle')).toHaveText('Untitled');
  const note = page.locator('#pageTree .page-tree-row').filter({ hasText: /^Untitled$/ });
  await expect(note).toHaveCount(1);
  await expect(note.locator('.tree-expand')).toHaveCount(0);
  await page.evaluate(async () => {
    const modulePath = '/src/store/workspace.store.ts';
    const { useWorkspaceStore } = await import(modulePath);
    await useWorkspaceStore.getState().controller.flush();
    const root = await navigator.storage.getDirectory();
    await root.getFileHandle('Untitled.md');
  });
  await page.reload();
  await expect(page.locator('#pageTitle')).toHaveText('Untitled');
  await expect(note.locator('.tree-expand')).toHaveCount(0);
  await expect(page.locator('[data-folder-path="Untitled"]')).toBeVisible();
  const child = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle('Untitled');
    return (await (await directory.getFileHandle('Child.md')).getFile()).text();
  });
  expect(child).toContain('Existing child content.');
  await page.locator('#newPageBtn').click();
  await expect(page.locator('#pageTitle')).toHaveText('Untitled 1');
});

for (const explicit of [true, false]) {
  for (const parent of ['', 'Notes']) {
    test(`New note stays separate from a same-name ${explicit ? 'explicit' : 'implicit'} folder in ${parent || 'root'}`, async ({
      page,
    }) => {
      await page.goto('/');
      await expect(page.locator('#pageTitle')).toBeVisible();
      await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
      await page.evaluate(
        async ({ explicit, parent }) => {
          const modulePath = '/src/store/workspace.store.ts';
          const { useWorkspaceStore } = await import(modulePath);
          await useWorkspaceStore.getState().controller.flush();
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('laplace-local-workspace', 3);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction('vaults', 'readwrite');
            const store = transaction.objectStore('vaults');
            const request = store.getAll();
            request.onsuccess = () => {
              const record = request.result.find((record) => record.workspace);
              const workspace = record.workspace;
              workspace.pages.forEach((note: { title: string }) => {
                note.title = 'Existing note';
              });
              const path = [parent, 'Untitled'].filter(Boolean).join('/');
              const folder = (path: string, explicit: boolean) => ({
                id: `test-folder-${path}`,
                path,
                name: path.split('/').at(-1),
                explicit,
                expanded: true,
              });
              workspace.folders = [
                ...(parent ? [folder(parent, true)] : []),
                folder(path, explicit),
                folder(`${path}/Existing folder`, true),
              ];
              workspace.activeFolderPath = parent;
              store.put(record);
            };
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
          });
          db.close();
        },
        { explicit, parent },
      );
      await page.reload();
      await expect(page.locator('#newPageBtn')).toBeVisible();
      await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
      const folderPath = [parent, 'Untitled'].filter(Boolean).join('/');
      await expect(page.locator(`[data-folder-path="${folderPath}"]`)).toHaveCount(1);
      await page.locator('#newPageBtn').click();
      await expect(page.locator('#pageTitle')).toHaveText('Untitled');
      const assertSeparate = async () => {
        const result = await page.evaluate(async () => {
          const modulePath = '/src/store/workspace.store.ts';
          const { useWorkspaceStore } = await import(modulePath);
          const { controller, ui } = useWorkspaceStore.getState();
          const document = controller.getDocument();
          const note = document.pages.find((note: { title: string }) => note.title === 'Untitled');
          const find = (items: any[]): any => {
            for (const item of items) {
              if (item.kind === 'note' && item.id === note.id) return item;
              const match = find(item.children);
              if (match) return match;
            }
          };
          return {
            title: note.title,
            folderNote: note.folderNote,
            children: find(ui.tree).children,
          };
        });
        expect(result.title).toBe('Untitled');
        expect(result.folderNote).toBe(false);
        expect(result.children).toEqual([]);
        await expect(page.locator(`[data-folder-path="${folderPath}"]`)).toHaveCount(1);
        await expect(
          page.locator(`[data-folder-path="${folderPath}/Existing folder"]`),
        ).toHaveCount(1);
      };
      await assertSeparate();
      await page.evaluate(async () => {
        const modulePath = '/src/store/workspace.store.ts';
        const { useWorkspaceStore } = await import(modulePath);
        await useWorkspaceStore.getState().controller.flush();
      });
      await page.reload();
      await expect(page.locator('#pageTitle')).toHaveText('Untitled');
      await assertSeparate();
    });
  }
}

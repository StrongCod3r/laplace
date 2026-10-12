import { expect, test } from '@playwright/test';

for (const parent of ['', 'Notes/']) {
  test(`converting a RAG note preserves the existing RAG folders in ${parent || 'root'}`, async ({
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
    await page.evaluate(async (parent) => {
      let root = await navigator.storage.getDirectory();
      if (parent) root = await root.getDirectoryHandle('Notes', { create: true });
      const write = async (directory: FileSystemDirectoryHandle, name: string, content: string) => {
        const writer = await (
          await directory.getFileHandle(name, { create: true })
        ).createWritable();
        await writer.write(content);
        await writer.close();
      };
      await write(root, 'RAG.md', 'Independent page content\n');
      const rag = await root.getDirectoryHandle('RAG', { create: true });
      await write(rag, 'RAG.md', 'Existing folder note content\n');
      await write(rag, 'Child.md', 'Existing child content\n');
      const counted = await root.getDirectoryHandle('RAG 1', { create: true });
      await write(counted, 'RAG 1.md', 'Existing counted folder content\n');
    }, parent);
    await page.locator('#chooseDirectoryBtn').click();
    const note = page.locator('#pageTree .page-tree-row').filter({ hasText: /^RAG$/ });
    await expect(note).toHaveCount(1);
    await note.click();
    await expect(page.locator('#blockEditor')).toContainText('Independent page content');
    const requestConversion = async () => {
      await note.click({ button: 'right' });
      await page.locator('[data-tree-context-action="convert-page-to-folder"]').click();
    };
    await requestConversion();
    const dialog = page.getByRole('alertdialog', { name: 'Convert note to folder?' });
    await expect(dialog).toContainText('RAG 2');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(note).toHaveCount(1);
    await expect(page.locator(`[data-folder-path="${parent}RAG 2"]`)).toHaveCount(0);
    await requestConversion();
    await dialog.getByRole('button', { name: 'Convert to Folder', exact: true }).click();
    await expect(page.locator('#pageTitle')).toHaveText('RAG 2');
    await expect(page.locator('#blockEditor')).toContainText('Independent page content');
    for (const name of ['RAG', 'RAG 1', 'RAG 2'])
      await expect(page.locator(`[data-folder-path="${parent}${name}"]`)).toBeVisible();
    await page.evaluate(async () => {
      const modulePath = new URL('src/store/workspace.store.ts', location.href).pathname;
      const { useWorkspaceStore } = await import(/* @vite-ignore */ modulePath);
      await useWorkspaceStore.getState().controller.flush();
    });
    await page.reload();
    await expect(page.locator('#pageTitle')).toHaveText('RAG 2');
    await expect(page.locator('#blockEditor')).toContainText('Independent page content');
    const contents = await page.evaluate(async (parent) => {
      let root = await navigator.storage.getDirectory();
      if (parent) root = await root.getDirectoryHandle('Notes');
      const read = async (folder: string, file: string) => {
        const directory = await root.getDirectoryHandle(folder);
        return (await (await directory.getFileHandle(file)).getFile()).text();
      };
      return [
        await read('RAG', 'RAG.md'),
        await read('RAG', 'Child.md'),
        await read('RAG 1', 'RAG 1.md'),
        await read('RAG 2', 'RAG 2.md'),
      ];
    }, parent);
    expect(contents).toEqual([
      'Existing folder note content\n',
      'Existing child content\n',
      'Existing counted folder content\n',
      'Independent page content\n',
    ]);
  });
}

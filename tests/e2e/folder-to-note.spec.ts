import { expect, test, type Page } from '@playwright/test';

async function openFixture(page: Page, parent: string, empty = false) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => navigator.storage.getDirectory(),
    });
  });
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.evaluate(
    async ({ parent, empty }) => {
      const root = await navigator.storage.getDirectory();
      const directory = parent ? await root.getDirectoryHandle(parent, { create: true }) : root;
      const folder = await directory.getDirectoryHandle('Docs', { create: true });
      if (empty) return;
      const write = async (directory: FileSystemDirectoryHandle, name: string, text: string) => {
        const writer = await (
          await directory.getFileHandle(name, { create: true })
        ).createWritable();
        await writer.write(text);
        await writer.close();
      };
      await write(directory, 'Docs.md', 'Existing sibling note.\n');
      await write(directory, 'Child.md', 'Existing sibling child.\n');
      await write(directory, 'extra.txt', 'Existing sibling file.');
      await directory.getDirectoryHandle('Nested', { create: true });
      await write(folder, 'Docs.md', 'Folder note content.\n');
      await write(folder, 'Child.md', 'Promoted child content.\n');
      await write(folder, 'extra.txt', 'Promoted unmanaged file.');
      const nested = await folder.getDirectoryHandle('Nested', { create: true });
      await write(nested, 'Leaf.md', 'Nested note content.\n');
      await write(nested, 'Nested.md', 'Nested folder note.\n');
      await write(nested, 'Nested 1.md', 'Existing nested sibling.\n');
      await write(nested, 'asset.bin', 'Nested unmanaged asset.');
    },
    { parent, empty },
  );
  await page.locator('#chooseDirectoryBtn').click();
  await expect(
    page.locator(
      `.folder-tree-row[data-folder-path="${[parent, 'Docs'].filter(Boolean).join('/')}"]`,
    ),
  ).toBeVisible();
}

async function convert(page: Page, path: string) {
  await page.locator(`.folder-tree-row[data-folder-path="${path}"]`).click({ button: 'right' });
  await page.locator('[data-tree-context-action="convert-folder-to-note"]').click();
  const confirmation = page.getByRole('alertdialog', { name: 'Convert folder to note?' });
  await expect(confirmation).toContainText('parent directory');
  await confirmation.getByRole('button', { name: 'Convert to Note', exact: true }).click();
}

test('both conversions wait for confirmation and cancellation preserves the note and folder', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible({ timeout: 30000 });
  await page.locator('#newPageBtn').click();
  await page.locator('#pageTitle').fill('Confirmation note');
  await page.locator('#blockEditor .block-content').first().fill('Keep this content.');
  const folder = page.locator('.folder-tree-row[data-folder-path="Confirmation note"]');
  const requestFolder = async () => {
    await page
      .locator('#pageTree .page-tree-row')
      .filter({ hasText: 'Confirmation note' })
      .click({ button: 'right' });
    await page.locator('[data-tree-context-action="convert-page-to-folder"]').click();
  };
  await requestFolder();
  const toFolder = page.getByRole('alertdialog', { name: 'Convert note to folder?' });
  await expect(toFolder).toContainText('note content will be preserved');
  await expect(folder).toHaveCount(0);
  await toFolder.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(folder).toHaveCount(0);
  await expect(page.locator('#blockEditor')).toContainText('Keep this content.');
  await requestFolder();
  await toFolder.getByRole('button', { name: 'Convert to Folder', exact: true }).click();
  await expect(folder).toBeVisible();
  await folder.click({ button: 'right' });
  await page.locator('[data-tree-context-action="convert-folder-to-note"]').click();
  const toNote = page.getByRole('alertdialog', { name: 'Convert folder to note?' });
  await expect(toNote).toContainText('alongside the new note');
  await expect(folder).toBeVisible();
  await toNote.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(folder).toBeVisible();
  await convert(page, 'Confirmation note');
  await expect(folder).toHaveCount(0);
  await expect(page.locator('#blockEditor')).toContainText('Keep this content.');
});

for (const parent of ['', 'Parent']) {
  test(`Convert to Note promotes children without overwriting siblings in ${parent || 'root'}`, async ({
    page,
  }) => {
    await openFixture(page, parent);
    const path = [parent, 'Docs'].filter(Boolean).join('/');
    const before = await page.evaluate(async () => {
      const modulePath = new URL('src/store/workspace.store.ts', location.href).pathname;
      const { useWorkspaceStore } = await import(modulePath);
      return useWorkspaceStore.getState().controller.getDocument().pages;
    });
    const rootNote = before.find((note: any) => note.filePath === `${path}/Docs.md`)!;
    await convert(page, path);
    await expect(page.locator('#pageTitle')).toHaveText('Docs 1');
    await expect(page.locator(`.folder-tree-row[data-folder-path="${path}"]`)).toHaveCount(0);
    const snapshot = await page.evaluate(async () => {
      const modulePath = new URL('src/store/workspace.store.ts', location.href).pathname;
      const { useWorkspaceStore } = await import(modulePath);
      await useWorkspaceStore.getState().controller.flush();
      return useWorkspaceStore.getState().controller.getDocument();
    });
    const promoted = snapshot.pages.find((note: any) => note.id === rootNote.id)!;
    expect(promoted.title).toBe('Docs 1');
    expect(promoted.folderNote).toBe(false);
    expect(promoted.parentId).toBe(null);
    await page.reload();
    await expect(page.locator('#pageTitle')).toHaveText('Docs 1');
    await expect(page.locator('#blockEditor')).toContainText('Folder note content.');
    await expect(page.locator(`.folder-tree-row[data-folder-path="${path}"]`)).toHaveCount(0);
    const files = await page.evaluate(async (parent) => {
      const root = await navigator.storage.getDirectory();
      const directory = parent ? await root.getDirectoryHandle(parent) : root;
      const read = async (directory: FileSystemDirectoryHandle, name: string) =>
        (await (await directory.getFileHandle(name)).getFile()).text();
      const nested = await directory.getDirectoryHandle('Nested 2');
      return {
        sibling: await read(directory, 'Docs.md'),
        siblingChild: await read(directory, 'Child.md'),
        child: await read(directory, 'Child 1.md'),
        siblingFile: await read(directory, 'extra.txt'),
        extra: await read(directory, 'extra 1.txt'),
        leaf: await read(nested, 'Leaf.md'),
        nestedRoot: await read(nested, 'Nested 2.md'),
        nestedSibling: await read(nested, 'Nested 1.md'),
        asset: await read(nested, 'asset.bin'),
      };
    }, parent);
    expect(files.sibling).toContain('Existing sibling note.');
    expect(files.siblingChild).toContain('Existing sibling child.');
    expect(files.child).toContain('Promoted child content.');
    expect(files.siblingFile).toBe('Existing sibling file.');
    expect(files.extra).toBe('Promoted unmanaged file.');
    expect(files.leaf).toContain('Nested note content.');
    expect(files.nestedRoot).toContain('Nested folder note.');
    expect(files.nestedSibling).toContain('Existing nested sibling.');
    expect(files.asset).toBe('Nested unmanaged asset.');
  });
}

test('an empty folder converts to an ordinary editable note', async ({ page }) => {
  await openFixture(page, '', true);
  await convert(page, 'Docs');
  await expect(page.locator('#pageTitle')).toHaveText('Docs');
  await expect(page.locator('.folder-tree-row[data-folder-path="Docs"]')).toHaveCount(0);
  await page.locator('#blockEditor .block-content').first().fill('Converted empty folder.');
  await page.evaluate(async () => {
    const modulePath = new URL('src/store/workspace.store.ts', location.href).pathname;
    const { useWorkspaceStore } = await import(modulePath);
    await useWorkspaceStore.getState().controller.flush();
  });
  await page.reload();
  await expect(page.locator('#blockEditor')).toContainText('Converted empty folder.');
  await expect(page.locator('.folder-tree-row[data-folder-path="Docs"]')).toHaveCount(0);
});

test('Convert to Note preserves the folder note in a browser workspace', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  await page.locator('#newFolderBtn').click();
  await page.locator('#newFolderNameInput').fill('Browser folder');
  await page.locator('#newFolderConfirm').click();
  await expect(page.locator('#pageTitle')).toHaveText('Browser folder');
  await page.locator('#blockEditor .block-content').first().fill('Keep the folder note.');
  await convert(page, 'Browser folder');
  await expect(page.locator('.folder-tree-row[data-folder-path="Browser folder"]')).toHaveCount(0);
  await expect(page.locator('#blockEditor')).toContainText('Keep the folder note.');
  await page.evaluate(async () => {
    const modulePath = new URL('src/store/workspace.store.ts', location.href).pathname;
    const { useWorkspaceStore } = await import(modulePath);
    await useWorkspaceStore.getState().controller.flush();
  });
  await page.reload();
  await expect(page.locator('#blockEditor')).toContainText('Keep the folder note.');
  await expect(page.locator('.folder-tree-row[data-folder-path="Browser folder"]')).toHaveCount(0);
});

test('a failed folder removal restores original notes and unmanaged files', async ({ page }) => {
  await openFixture(page, '');
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const prototype = Object.getPrototypeOf(root);
    const remove = prototype.removeEntry;
    prototype.removeEntry = function (name: string, options: unknown) {
      if (this.name === root.name && name === 'Docs') {
        prototype.removeEntry = remove;
        return Promise.reject(new DOMException('Simulated failure', 'NotAllowedError'));
      }
      return remove.call(this, name, options);
    };
  });
  await convert(page, 'Docs');
  await expect(page.locator('#toast')).toContainText('Simulated failure');
  await expect(page.locator('.folder-tree-row[data-folder-path="Docs"]')).toBeVisible();
  const content = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const source = await root.getDirectoryHandle('Docs');
    const note = (await (await source.getFileHandle('Docs.md')).getFile()).text();
    const extra = (await (await source.getFileHandle('extra.txt')).getFile()).text();
    return { note: await note, extra: await extra };
  });
  expect(content.note).toContain('Folder note content.');
  expect(content.extra).toBe('Promoted unmanaged file.');
});

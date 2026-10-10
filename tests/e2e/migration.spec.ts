import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('#workspaceSelect')).toHaveValue('browser');
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  await expect(page.locator('#pageTree .page-tree-row')).not.toHaveCount(0);
}

async function storedTheme(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('laplace-local-workspace', 3);
      request.onsuccess = () => resolve(request.result);
    });
    const records = await new Promise<Array<{ workspace?: { theme?: string } }>>((resolve) => {
      const request = db.transaction('vaults').objectStore('vaults').getAll();
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return records[0]?.workspace?.theme;
  });
}

test('Preact bootstraps the existing workspace without runtime errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  await expect(page.locator('#root #app')).toBeVisible();
  await expect(page.locator('#workspaceAccessNotice')).toBeHidden();
  await expect(page.locator('#pageTitle')).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/migration.png', fullPage: true });
});

test('Markdown codecs retain headings, lists, tables, links, code and frontmatter', async ({
  page,
}) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const path = '/src/features/editor/services/create-controller.ts';
    const { createWorkspaceController } = await import(path);
    const controller = createWorkspaceController();
    const source =
      '# Heading\n\nPlain [[Linked note]] text\n\n- Item\n- [x] Done\n\n| A | B |\n| --- | --- |\n| One | Two |\n\n```typescript\nconst value = 1;\n```';
    const blocks = controller.invoke('parseMarkdownBlocks', source, { preserveInline: true });
    const document = controller.getDocument();
    document.folders = [];
    document.pages = [
      { id: 'codec', title: 'Codec', parentId: null, blocks, frontmatter: ['tag: retained'] },
    ];
    const files = controller.invoke('serializeMarkdownWorkspace', document);
    const restored = controller.invoke('workspaceFromMarkdown', document, files, []);
    controller.dispose();
    return { files, restored };
  });
  expect(result.files[0].path).toBe('Codec.md');
  expect(result.files[0].content).toContain('tag: retained');
  expect(result.files[0].content).toContain('[[Linked note]]');
  expect(result.restored.pages[0].blocks.map((block: { type: string }) => block.type)).toEqual(
    expect.arrayContaining(['h1', 'bullet', 'todo', 'table', 'code']),
  );
});

test('rich editor commands, undo and docked tabs remain functional', async ({ page }) => {
  await ready(page);
  await page.locator('#newPageBtn').click();
  const content = page.locator('#blockEditor .block-content').first();
  await content.fill('Undo keeps this text');
  await content.press('Tab');
  await page.waitForTimeout(700);
  await content.fill('Changed text');
  await content.press('Tab');
  await page.waitForTimeout(700);
  await page.keyboard.press('Control+z');
  await expect(page.locator('#blockEditor')).toContainText('Undo keeps this text');
  await page.locator('#newPageBtn').click();
  await page.keyboard.press('Control+Alt+ArrowRight');
  await expect(page.locator('#editorDock .dock-pane')).toHaveCount(2);
  await expect(page.locator('#editorDock [data-dock-blocks]')).toHaveCount(2);
});

test('local folder keeps Markdown, .laplace metadata and permission enforcement', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => navigator.storage.getDirectory(),
    });
  });
  await ready(page);
  await page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory();
    const handle = await directory.getFileHandle('Existing note.md', { create: true });
    const writable = await handle.createWritable();
    await writable.write('---\ntag: existing\n---\n\n# Original heading\n\nOriginal content.\n');
    await writable.close();
  });
  await page.locator('#chooseDirectoryBtn').click();
  await expect(page.locator('#pageTree')).toContainText('Existing note');
  await page
    .locator('#pageTree [data-action="open-page"]')
    .filter({ hasText: 'Existing note' })
    .click();
  await expect(page.locator('#blockEditor')).toContainText('Original content.');
  await page.locator('[data-ribbon-action="settings"]').click();
  await page.locator('#themeToggle').click();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const directory = await navigator.storage.getDirectory();
        const app = await directory.getDirectoryHandle('.laplace');
        const appearance = JSON.parse(
          await (await (await app.getFileHandle('appearance.json')).getFile()).text(),
        );
        return appearance.theme;
      }),
    )
    .toBe('light');
  const note = await page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory();
    return (await (await directory.getFileHandle('Existing note.md')).getFile()).text();
  });
  expect(note).toContain('tag: existing');
  expect(note).toContain('Original content.');
  await page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory();
    Object.getPrototypeOf(directory).queryPermission = async ({ mode }: { mode: string }) =>
      mode === 'readwrite' ? 'denied' : 'granted';
  });
  await page.locator('#settingsModal [data-close-modal]').click();
  await expect(page.locator('body')).toHaveClass(/workspace-read-only/, { timeout: 8000 });
  await expect(page.locator('#workspaceWritePermissionBtn')).toBeVisible();
  await expect(page.locator('#pageTitle')).toHaveAttribute('contenteditable', 'false');
});

test('create, edit and reload a note through the unchanged IndexedDB schema', async ({ page }) => {
  await ready(page);
  await page.locator('#newPageBtn').click();
  const title = page.locator('#pageTitle');
  await title.fill('Preact persistence check');
  await title.press('Tab');
  const content = page.locator('#blockEditor .block-content').first();
  await content.fill('Keep this Markdown workspace locally.');
  await content.press('Tab');
  await expect(page.locator('#pageTree')).toContainText('Preact persistence check');
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('laplace-local-workspace', 3);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const records = await new Promise<
          Array<{ workspace?: { pages?: Array<{ title: string }> } }>
        >((resolve) => {
          const request = db.transaction('vaults').objectStore('vaults').getAll();
          request.onsuccess = () => resolve(request.result);
        });
        db.close();
        return records.some((record) =>
          record.workspace?.pages?.some((note) => note.title === 'Preact persistence check'),
        );
      }),
    )
    .toBe(true);
  await page.reload();
  await expect(title).toHaveText('Preact persistence check');
  await expect(page.locator('#blockEditor')).toContainText('Keep this Markdown workspace locally.');
});

test('native Preact graph, tabs, attachments and settings keep their actions', async ({ page }) => {
  await ready(page);
  await page.locator('[data-ribbon-action="graph"]').click();
  await expect(page.locator('#graphView')).toBeVisible();
  await expect(page.locator('#graphView [data-graph-page]')).not.toHaveCount(0);
  await expect(page.locator('#tabsScroll [data-tab-kind="graph"]')).toHaveCount(1);
  await page.locator('[data-graph-search]').fill('not-a-note');
  await expect(page.locator('#graphView .graph-node.dim')).not.toHaveCount(0);
  await page.locator('#graphView [data-graph-page]').first().click();
  await expect(page.locator('#editorView')).toBeVisible();
  await page.locator('[data-ribbon-action="attachments"]').click();
  await expect(page.locator('#attachmentsView')).toBeVisible();
  await page.locator('[data-ribbon-action="settings"]').click();
  await expect(page.locator('#settingsModal')).toBeVisible();
  await page.locator('#themeToggle').click();
  await expect(page.locator('#themeToggle')).toContainText('Light');
  await expect.poll(() => storedTheme(page)).toBe('light');
  await page.locator('#settingsModal [data-close-modal]').click();
  await page.reload();
  await page.locator('[data-ribbon-action="settings"]').click();
  await expect(page.locator('#themeToggle')).toContainText('Light');
});

test('Preact remounts release the controller without duplicating actions', async ({ page }) => {
  await ready(page);
  const before = await page.locator('#pageTree .page-tree-row').count();
  await page.locator('#newPageBtn').click();
  await expect(page.locator('#pageTree .page-tree-row')).toHaveCount(before + 1);
  await page.evaluate(async () => {
    const path = '/tests/fixtures/remount.tsx';
    const { remountWorkspace } = await import(path);
    await remountWorkspace();
  });
  await expect(page.locator('#newPageBtn')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  await page.locator('#newPageBtn').click();
  await expect(page.locator('#pageTree .page-tree-row')).toHaveCount(before + 2);
});

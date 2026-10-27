import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

test('undo restores deleted duplicate contents before undoing page duplication', async () => {
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { activeElement: null },
  });
  try {
    const { registerHistory } = await server.ssrLoadModule(
      '/src/features/history/services/register.ts',
    );
    const { registerNotes } = await server.ssrLoadModule(
      '/src/features/notes/services/register.ts',
    );
    const source = {
      id: 'source',
      title: 'Source',
      blocks: [{ id: 'source-block', type: 'text', text: 'Original content' }],
    };
    let sequence = 0;
    const runtime = {
      state: {
        pages: [source],
        folders: [],
        currentPageId: source.id,
        mainView: 'page',
        activeEditorGroupId: 'main',
        openTabs: [{ id: 'tab', kind: 'page', pageId: source.id, groupId: 'main' }],
        activeTabId: 'tab',
        editorLayout: { type: 'group', id: 'main', activeTabId: 'tab' },
      },
      activeVaultId: 'vault',
      workspaceAccess: 'writable',
      historyByVault: new Map(),
      historyKeyForVault: (id) => id,
      clone: structuredClone,
      normalizeWorkspace: structuredClone,
      uid: (prefix) => `${prefix}-${++sequence}`,
      uniqueNoteTitle: () => 'Source copy',
      cloneBlockWithNewIds: (block) => ({ ...structuredClone(block), id: `copy-${block.id}` }),
      lifecycle: { clearTimeout() {}, timeout() {}, frame() {} },
      renderAll() {},
      toast() {},
      publish() {},
      persistStateNow: async () => true,
      HISTORY_LIMIT: 100,
      HISTORY_MERGE_DELAY: 650,
    };
    registerHistory(runtime);
    registerNotes(runtime);
    runtime.applyTheme = () => {};
    runtime.pageById = (id) => runtime.state.pages.find((page) => page.id === id);
    runtime.resetFilesTreeSelection = () => {};
    runtime.fileTreeKeyForPage = (page) => page.id;
    runtime.replaceActiveTab = (id) => {
      runtime.state.currentPageId = id;
      runtime.state.openTabs[0].pageId = id;
    };
    runtime.initializeHistoryForVault();

    source.blocks[0].text = 'Edited source content';
    runtime.recordHistory('merge');
    runtime.duplicatePage(source.id);
    const copyId = runtime.state.currentPageId;
    const copiedBlocks = structuredClone(runtime.pageById(copyId).blocks);
    assert.notEqual(copyId, source.id);
    assert.notEqual(copiedBlocks[0].id, source.blocks[0].id);

    runtime.flushHistoryPending();
    runtime.pageById(copyId).blocks = [{ id: 'empty', type: 'text', text: '' }];
    runtime.scheduleSave();
    await runtime.undoWorkspace();
    assert.equal(runtime.state.pages.length, 2, 'undoing deletion retains the duplicated page');
    assert.equal(runtime.state.currentPageId, copyId);
    assert.deepEqual(runtime.pageById(copyId).blocks, copiedBlocks);
    assert.equal(runtime.pageById(source.id).blocks[0].text, 'Edited source content');

    await runtime.redoWorkspace();
    assert.equal(runtime.state.pages.length, 2);
    assert.equal(runtime.state.currentPageId, copyId);
    assert.equal(runtime.pageById(copyId).blocks[0].text, '');
    await runtime.undoWorkspace();
    await runtime.undoWorkspace();
    assert.equal(runtime.state.pages.length, 1, 'a separate undo reverses duplication');
    assert.equal(runtime.state.currentPageId, source.id);
    assert.equal(runtime.pageById(source.id).blocks[0].text, 'Edited source content');
    await runtime.undoWorkspace();
    assert.equal(runtime.pageById(source.id).blocks[0].text, 'Original content');
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else delete globalThis.document;
    await server.close();
  }
});

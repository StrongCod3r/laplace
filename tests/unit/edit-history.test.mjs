import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

test('history keeps navigation and records edits while an undo save is pending', async () => {
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
    const { preserveHistoryNavigation } = await server.ssrLoadModule(
      '/src/features/history/services/editor-context.ts',
    );
    const state = {
      theme: 'light',
      pages: ['a', 'b'].map((id) => ({
        id,
        title: id,
        blocks: [{ id: `block-${id}`, type: 'text', text: '' }],
      })),
      folders: [],
      currentPageId: 'a',
      activeTabId: 'tab-a',
      activeEditorGroupId: 'main',
      openTabs: ['a', 'b'].map((id) => ({
        id: `tab-${id}`,
        kind: 'page',
        pageId: id,
        groupId: 'main',
      })),
      editorLayout: { type: 'group', id: 'main', activeTabId: 'tab-a' },
      mainView: 'page',
      editorScrollPositions: {},
    };
    let finishSave;
    const runtime = {
      state: structuredClone(state),
      activeVaultId: 'vault',
      historyByVault: new Map(),
      historyKeyForVault: (id) => id,
      clone: structuredClone,
      normalizeWorkspace: structuredClone,
      lifecycle: { clearTimeout() {}, timeout() {}, frame() {} },
      applyTheme() {},
      renderAll() {},
      toast() {},
      persistStateNow: () =>
        new Promise((resolve) => {
          finishSave = resolve;
        }),
      HISTORY_LIMIT: 100,
      HISTORY_MERGE_DELAY: 650,
    };
    registerHistory(runtime);
    runtime.initializeHistoryForVault();
    runtime.state.currentPageId = 'b';
    runtime.state.activeTabId = 'tab-b';
    runtime.state.editorLayout.activeTabId = 'tab-b';
    runtime.state.editorScrollPositions['tab-b'] = { top: 300 };
    runtime.recordHistory();
    assert.equal(runtime.historyForVault().undo.length, 0, 'navigation does not add an undo step');
    runtime.state.pages[1].blocks[0].text = 'edited';
    runtime.recordHistory('merge');
    const undo = runtime.undoWorkspace();
    assert.equal(runtime.state.currentPageId, 'b');
    assert.equal(runtime.state.activeTabId, 'tab-b');
    assert.equal(runtime.state.editorLayout.activeTabId, 'tab-b');
    assert.deepEqual(runtime.state.editorScrollPositions, { 'tab-b': { top: 300 } });
    assert.equal(runtime.state.pages[1].blocks[0].text, '');
    assert.equal(runtime.historySuspended, false, 'a pending save must not suppress further edits');
    runtime.state.pages[1].blocks[0].text = 'new edit while saving';
    runtime.recordHistory('merge');
    assert.equal(
      runtime.historyForVault().pending.after.pages[1].blocks[0].text,
      'new edit while saving',
    );
    finishSave(true);
    await undo;
    runtime.flushHistoryPending();
    assert.equal(runtime.historyForVault().redo.length, 0, 'a new edit replaces the redo branch');

    const beforeCreation = structuredClone(state);
    beforeCreation.pages.pop();
    beforeCreation.openTabs.pop();
    const restored = preserveHistoryNavigation(beforeCreation, runtime.state);
    assert.equal(restored.currentPageId, 'a', 'undoing creation chooses an available note');
    assert.equal(restored.activeTabId, 'tab-a');
    assert.equal(restored.pages.length, 1);
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else delete globalThis.document;
    await server.close();
  }
});

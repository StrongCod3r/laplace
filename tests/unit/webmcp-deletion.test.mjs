import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

test('WebMCP deletion confirms, validates scope, cancels and restores failed saves', async () => {
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { requestDeletion, deletionStatus, cancelWebMcpDeletions } = await server.ssrLoadModule(
      '/src/features/webmcp/services/deletion.ts',
    );
    const tick = () => new Promise((resolve) => setImmediate(resolve));
    const fixture = () => {
      const state = {
        pages: [
          { id: 'parent', title: 'Parent', blocks: [] },
          { id: 'child', title: 'Child', parentId: 'parent', blocks: [] },
          { id: 'other', title: 'Other', blocks: [] },
        ],
        folders: [{ id: 'folder', path: 'Keep' }],
        openTabs: [],
        currentPageId: '__home__',
        mainView: 'page',
      };
      const history = { undo: [], redo: [], present: structuredClone(state), pending: null };
      return {
        state,
        activeVaultId: 'vault',
        workspaceAccess: 'writable',
        lastSyncedWorkspace: {},
        storageWriteChain: Promise.resolve(),
        confirmedPageDeletions: new Set(),
        deleteConfirmResolver: null,
        saves: 0,
        timer: null,
        lifecycle: {
          disposed: false,
          timeout(fn) {
            this.expire = fn;
            return 1;
          },
          clearTimeout() {},
        },
        workspaceLocationKey: () => 'local',
        serializeMarkdownWorkspace: (doc) =>
          doc.pages.map((p) => ({ path: `${p.title}.md`, content: '' })),
        askDeleteConfirmation() {
          return new Promise((resolve) => {
            this.deleteConfirmResolver = resolve;
          });
        },
        settleDeleteConfirmation(value) {
          const resolve = this.deleteConfirmResolver;
          this.deleteConfirmResolver = null;
          resolve?.(value);
        },
        flushHistoryPending() {},
        historyForVault: () => history,
        removePagesFromWorkspace(ids) {
          ids.forEach((id) => this.confirmedPageDeletions.add(id));
          this.state.pages = this.state.pages.filter((p) => !ids.has(p.id));
        },
        resetFilesTreeSelection() {},
        recordHistory() {
          history.undo.push(history.present);
          history.present = structuredClone(this.state);
          history.redo = [];
        },
        async persistStateNow() {
          this.saves++;
          return true;
        },
        renderAll() {},
        publish() {},
      };
    };
    const status = (runtime, request) => deletionStatus(runtime, 'vault', request.requestId);
    let runtime = fixture();
    let request = requestDeletion(runtime, 'vault', 'parent');
    assert.equal(request.status, 'pending_confirmation');
    assert.equal(request.noteCount, 2);
    assert.equal(runtime.state.pages.length, 3);
    runtime.settleDeleteConfirmation(true);
    await tick();
    assert.equal(status(runtime, request).status, 'deleted');
    assert.equal(status(runtime, request).saved, true);
    assert.deepEqual(
      runtime.state.pages.map((p) => p.id),
      ['other'],
    );
    assert.equal(runtime.state.folders.length, 1);
    assert.equal(runtime.historyForVault().undo.length, 1);
    assert.deepEqual([...runtime.confirmedPageDeletions], ['parent', 'child']);
    assert.throws(() => deletionStatus(runtime, 'other-vault', request.requestId), /not found/);

    for (const change of [
      (r) => r.state.pages.push({ id: 'new', title: 'New', blocks: [] }),
      (r) => (r.state.pages[0].title = 'Changed'),
      (r) => (r.activeVaultId = 'other'),
      (r) => (r.workspaceAccess = 'readonly'),
      (r) => (r.gitOperationActive = true),
      (r) => (r.lifecycle.disposed = true),
      (r) => (r.state = structuredClone(r.state)),
    ]) {
      runtime = fixture();
      request = requestDeletion(runtime, 'vault', null, 3);
      change(runtime);
      runtime.settleDeleteConfirmation(true);
      await tick();
      assert.equal(status(runtime, request).status, 'failed');
      assert.equal(runtime.saves, 0);
      assert.ok(runtime.state.pages.some((p) => p.id === 'parent'));
    }
    for (const cancel of [
      (r, q) => r.settleDeleteConfirmation(false),
      (r, q) => deletionStatus(r, 'vault', q.requestId, true),
      (r) => cancelWebMcpDeletions(r),
      (r) => r.lifecycle.expire(),
    ]) {
      runtime = fixture();
      request = requestDeletion(runtime, 'vault', null, 3);
      cancel(runtime, request);
      await tick();
      assert.equal(status(runtime, request).status, 'cancelled');
      assert.equal(runtime.deleteConfirmResolver, null);
      assert.equal(runtime.state.pages.length, 3);
      assert.equal(runtime.saves, 0);
    }
    runtime = fixture();
    const connection = new AbortController();
    request = requestDeletion(runtime, 'vault', null, 3, connection.signal);
    connection.abort();
    await tick();
    assert.equal(status(runtime, request).status, 'cancelled');
    assert.equal(runtime.deleteConfirmResolver, null);

    runtime = fixture();
    let release;
    runtime.storageWriteChain = new Promise((resolve) => {
      release = resolve;
    });
    request = requestDeletion(runtime, 'vault', null, 3);
    runtime.settleDeleteConfirmation(true);
    await tick();
    assert.equal(status(runtime, request).status, 'saving');
    runtime.state.pages[0].title = 'Edited while queued';
    release();
    await tick();
    assert.equal(status(runtime, request).status, 'failed');
    assert.equal(runtime.saves, 0);

    for (const fault of [
      'save-false',
      'save-throw',
      'render-throw',
      'remove-throw',
      'concurrent-edit',
    ]) {
      runtime = fixture();
      runtime.persistStateNow = async function () {
        this.saves++;
        if (this.saves > 1) return true;
        if (fault === 'concurrent-edit') this.state.pages[0].title = 'Preserved edit';
        if (fault === 'save-throw' || fault === 'concurrent-edit') throw new Error('Disk failed');
        return false;
      };
      if (fault === 'render-throw') {
        let once = true;
        runtime.renderAll = () => {
          if (once) {
            once = false;
            throw new Error('Render failed');
          }
        };
      }
      if (fault === 'remove-throw') {
        const remove = runtime.removePagesFromWorkspace;
        runtime.removePagesFromWorkspace = function (ids) {
          remove.call(this, ids);
          throw new Error('Remove failed');
        };
      }
      request = requestDeletion(runtime, 'vault', 'parent');
      runtime.settleDeleteConfirmation(true);
      await tick();
      assert.equal(status(runtime, request).status, 'failed', fault);
      assert.equal(status(runtime, request).restored, true, fault);
      assert.equal(runtime.state.pages.length, 3, fault);
      assert.equal(runtime.confirmedPageDeletions.size, 0, fault);
      assert.equal(runtime.historyForVault().undo.length, 0, fault);
      if (fault === 'concurrent-edit')
        assert.equal(runtime.state.pages.find((p) => p.id === 'other').title, 'Preserved edit');
    }
    runtime = fixture();
    assert.throws(() => requestDeletion(runtime, 'vault', null, 2), /count changed/);
    assert.throws(() => requestDeletion(runtime, 'vault', 'missing'), /not found/);
    runtime.state.pages = [];
    assert.equal(requestDeletion(runtime, 'vault', null, 0).status, 'deleted');
    assert.equal(runtime.deleteConfirmResolver, null);
    assert.equal(runtime.saves, 0);
  } finally {
    await server.close();
  }
});

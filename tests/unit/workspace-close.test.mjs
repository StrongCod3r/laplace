import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

test('closing a disconnected active workspace activates Browser storage even with a stale selector', async () => {
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { registerWorkspace } = await server.ssrLoadModule(
      '/src/features/workspace/services/register.ts',
    );
    const noop = () => {};
    const browserDocument = { pages: [{ id: 'browser-note', text: 'Keep browser notes' }] };
    function harness({ writable = false, saved = true, active = true } = {}) {
      let selected = active ? 'local' : 'browser';
      const calls = [];
      const locations = () => [
        { id: 'browser', kind: 'browser', active: selected === 'browser' },
        { id: 'local', kind: 'directory', active: selected === 'local' },
      ];
      const runtime = {
        workspaceAccess: writable ? 'writable' : 'blocked',
        workspaceLocations: [{ id: 'local', name: 'Missing folder', kind: 'directory', active }],
        pendingWorkspaceCloseId: 'local',
        activeVaultId: null,
        storageWriteChain: Promise.resolve(),
        workspacePermissionCheck: null,
        els: {},
        lifecycle: { clearTimeout: noop },
        clone: structuredClone,
        localStorageGateway: {
          activateWorkspaceLocation: async (id) => {
            calls.push('activate:' + id);
            selected = id;
          },
          listWorkspaceLocations: async () => locations(),
          removeWorkspaceLocation: async (id) => {
            assert.notEqual(selected, id);
            calls.push('remove:' + id);
          },
        },
      };
      registerWorkspace(runtime);
      Object.assign(runtime, {
        syncWorkspaceLocationActions: noop,
        renderWorkspaceSelector: noop,
        refreshWorkspaceSelector: async () => {
          runtime.workspaceLocations = locations();
        },
        cancelPageOperations: noop,
        flushHistoryPending: noop,
        persistStateNow: async () => {
          calls.push('save');
          return saved;
        },
        saveVaultRegistry: async () => calls.push('save-registry'),
        invalidateAttachmentList: noop,
        clearAttachmentObjectUrls: noop,
        loadVaultRegistry: async () => ({ activeVaultId: 'browser-vault' }),
        loadState: async () => structuredClone(browserDocument),
        initializeHistoryForVault: noop,
        setWorkspaceAccess: (mode) => {
          runtime.workspaceAccess = mode;
        },
        applyTheme: noop,
        renderAll: noop,
        toast: (message) => calls.push('toast:' + message),
      });
      return { runtime, calls };
    }
    const disconnected = harness();
    await disconnected.runtime.confirmCloseSelectedWorkspace();
    assert.deepEqual(
      disconnected.calls.filter((call) => !call.startsWith('toast:')),
      ['activate:browser', 'remove:local'],
    );
    assert.deepEqual(disconnected.runtime.state, browserDocument);
    assert.equal(disconnected.runtime.workspaceAccess, 'writable');
    assert.equal(disconnected.runtime.workspaceLocationClosing, false);

    const writable = harness({ writable: true });
    await writable.runtime.confirmCloseSelectedWorkspace();
    assert.deepEqual(
      writable.calls.filter((call) => !call.startsWith('toast:')),
      ['save', 'save-registry', 'activate:browser', 'remove:local'],
    );

    const failedSave = harness({ writable: true, saved: false });
    const previousError = console.error;
    console.error = noop;
    try {
      await failedSave.runtime.confirmCloseSelectedWorkspace();
    } finally {
      console.error = previousError;
    }
    assert.deepEqual(
      failedSave.calls.filter((call) => !call.startsWith('toast:')),
      ['save'],
    );
    assert.equal(failedSave.runtime.workspaceLocationClosing, false);

    const inactive = harness({ active: false });
    await inactive.runtime.confirmCloseSelectedWorkspace();
    assert.deepEqual(
      inactive.calls.filter((call) => !call.startsWith('toast:')),
      ['remove:local'],
    );
  } finally {
    await server.close();
  }
});

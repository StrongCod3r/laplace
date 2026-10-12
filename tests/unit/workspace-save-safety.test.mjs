import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

test('incomplete Markdown saves cannot delete or rewrite local notes implicitly', async () => {
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { STORAGE_CONFIG } = await server.ssrLoadModule('/src/config.ts');
    const { createStorageGateway } = await server.ssrLoadModule('/src/storage.ts');
    const files = new Map(
      Array.from({ length: 8 }, (_, index) => [`Note ${index}.md`, `Content ${index}`]),
    );
    const original = new Map(files);
    const gateway = createStorageGateway(STORAGE_CONFIG);
    gateway.directoryHandle = {
      queryPermission: async () => 'granted',
      async *entries() {
        for (const name of files.keys())
          yield [
            name,
            { kind: 'file', getFile: async () => ({ text: async () => files.get(name) }) },
          ];
      },
      getFileHandle: async (name) => ({
        getFile: async () => ({ text: async () => files.get(name) }),
        createWritable: async () => ({
          write: async (text) => files.set(name, text),
          close: async () => {},
        }),
      }),
      removeEntry: async (name) => files.delete(name),
    };
    await assert.rejects(gateway.writeMarkdownFiles([]), /without an explicit edit/);
    assert.deepEqual(files, original);
    await assert.rejects(
      gateway.writeMarkdownFiles([{ path: 'Note 0.md', content: 'Overwritten' }]),
      /without an explicit edit/,
    );
    assert.deepEqual(
      files,
      original,
      'the whole save is rejected before rewriting the surviving note',
    );
    await gateway.writeMarkdownFiles([{ path: 'Note 0.md', content: 'Content 0' }], {
      allowDeletes: true,
    });
    assert.deepEqual([...files], [['Note 0.md', 'Content 0']]);
  } finally {
    await server.close();
  }
});

test('saves require hydration, reject unexpected missing pages and discard stale queued documents', async (context) => {
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  context.mock.method(console, 'error', () => {});
  try {
    const { registerWorkspace } = await server.ssrLoadModule(
      '/src/features/workspace/services/register.ts',
    );
    const notes = [
      { id: 'one', filePath: 'One.md' },
      { id: 'two', filePath: 'Two.md' },
    ];
    const writes = [];
    const runtime = {
      activeVaultId: 'vault',
      workspaceAccess: 'checking',
      state: { pages: [] },
      lastSyncedWorkspace: null,
      confirmedPageDeletions: new Set(),
      workspaceLocations: [{ id: 'local', active: true }],
      lifecycle: { disposed: false, clearTimeout() {} },
      clone: structuredClone,
      storageWriteChain: Promise.resolve(),
      localStorageGateway: {
        hasDirectory: () => true,
        getDirectoryPermission: async () => 'readwrite',
        writeMarkdownFiles: async (files, options) => writes.push({ files, options }),
      },
      storageGateway: { saveWorkspace: async () => writes.push('metadata') },
      externalizeEmbeddedImages: async () => false,
      serializeMarkdownWorkspace: (workspace) =>
        workspace.pages.map((page) => ({ path: page.filePath, content: page.id })),
      pageById: (id) => runtime.state.pages.find((page) => page.id === id),
      toast() {},
    };
    registerWorkspace(runtime);
    runtime.externalizeEmbeddedImages = async () => false;
    // HMR disposal used to save the blank initial document before the disk read finished.
    runtime.workspaceAccess = 'writable';
    assert.equal(await runtime.persistStateNow(), false);
    runtime.lastSyncedWorkspace = { pages: structuredClone(notes) };
    runtime.workspaceAccess = 'checking';
    assert.equal(await runtime.persistStateNow(), false);
    runtime.workspaceAccess = 'writable';
    assert.equal(await runtime.persistStateNow(), false, 'a missing page is not a delete command');
    assert.deepEqual(writes, []);
    runtime.state = { pages: structuredClone(notes) };
    let release;
    runtime.storageWriteChain = new Promise((resolve) => {
      release = resolve;
    });
    const stale = runtime.persistStateNow();
    runtime.state = { pages: structuredClone(notes) };
    release();
    assert.equal(await stale, false);
    assert.deepEqual(writes, []);
    runtime.state.pages.pop();
    runtime.confirmedPageDeletions.add('two');
    assert.equal(await runtime.persistStateNow(), true);
    assert.equal(writes[0].options.allowDeletes, true);
    assert.equal(runtime.confirmedPageDeletions.size, 0);
    let finishScan;
    let scanStarted;
    const scanning = new Promise((resolve) => {
      scanStarted = resolve;
    });
    const disk = new Promise((resolve) => {
      finishScan = resolve;
    });
    const loadingRuntime = {
      activeVaultId: 'vault',
      lifecycle: { disposed: false },
      storageGateway: {
        loadWorkspace: async () => ({ pages: structuredClone(notes) }),
        saveWorkspace: async () => assert.fail('A disposed loader must not save metadata'),
      },
      localStorageGateway: {
        hasDirectory: () => true,
        getDirectoryPermission: async () => 'readwrite',
        readMarkdownFiles: async () => {
          scanStarted();
          return disk;
        },
        writeMarkdownFiles: async () => assert.fail('A disposed loader must not rewrite notes'),
      },
    };
    registerWorkspace(loadingRuntime);
    const loading = loadingRuntime.loadState();
    await scanning;
    loadingRuntime.lifecycle.disposed = true;
    finishScan({
      files: notes.map((page) => ({ path: page.filePath, content: page.id })),
      directories: [],
    });
    await assert.rejects(loading, { name: 'AbortError' });
  } finally {
    await server.close();
  }
});

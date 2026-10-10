import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

test('folder configuration uses fixed files and retains the browser database', async () => {
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { STORAGE_CONFIG } = await server.ssrLoadModule('/src/config.ts');
    assert.deepEqual(STORAGE_CONFIG, {
      provider: 'indexeddb',
      indexeddb: {
        name: 'laplace-local-workspace',
        version: 3,
        metaStore: 'meta',
        vaultStore: 'vaults',
        attachmentStore: 'attachments',
        registryKey: 'registry',
        appDirectory: '.laplace',
        appConfigFile: 'app.json',
        workspaceFile: 'workspace.json',
        appearanceFile: 'appearance.json',
        hotkeysFile: 'hotkeys.json',
        attachmentsDirectory: '.attachments',
      },
    });
    const { createStorageGateway } = await server.ssrLoadModule('/src/storage.ts');
    const gateway = createStorageGateway(STORAGE_CONFIG);
    assert.equal(gateway.provider, 'indexeddb');
    assert.equal(gateway.hasDirectory(), false);
  } finally {
    await server.close();
  }
});

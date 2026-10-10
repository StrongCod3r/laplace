import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

function directory(name = 'Notes', files = new Map(), prefix = '', writable = true) {
  return {
    name,
    queryPermission: async ({ mode }) => (mode === 'readwrite' && !writable ? 'denied' : 'granted'),
    async getDirectoryHandle(name, { create = false } = {}) {
      const path = prefix + name + '/';
      if (!create && ![...files.keys()].some((key) => key.startsWith(path)))
        throw new DOMException('Missing directory', 'NotFoundError');
      return directory(name, files, path, writable);
    },
    async getFileHandle(name, { create = false } = {}) {
      const path = prefix + name;
      if (!create && !files.has(path)) throw new DOMException('Missing file', 'NotFoundError');
      return {
        getFile: async () => ({ text: async () => files.get(path) }),
        createWritable: async () => ({
          write: async (value) => files.set(path, value),
          close: async () => {},
        }),
      };
    },
    async removeEntry(name) {
      if (!files.delete(prefix + name)) throw new DOMException('Missing file', 'NotFoundError');
    },
  };
}

test('folder configuration round trips through fixed files, independent of IDs', async () => {
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { STORAGE_CONFIG } = await server.ssrLoadModule('/src/config.ts');
    const { createStorageGateway } = await server.ssrLoadModule('/src/storage.ts');
    const files = new Map();
    const gateway = createStorageGateway(STORAGE_CONFIG);
    gateway.directoryHandle = directory('Notes', files);
    const registry = {
      workspaceId: 'workspace_old',
      activeVaultId: 'vault_random',
      vaults: [{ id: 'vault_random', name: 'Notes' }],
    };
    const workspace = {
      name: 'Notes',
      theme: 'dark',
      pageFont: 'serif',
      treeIconSize: 18,
      spellcheckEnabled: false,
      folderNotesEnabled: true,
      showCustomPageIcons: false,
      showFilesAndTabIcons: true,
      showBreadcrumbIcons: true,
      shortcuts: { search: 'Mod+P' },
      openTabs: [{ id: 'tab_1', pageId: 'page_1' }],
      markdownFilesInitialized: true,
      pages: [{ id: 'page_1', title: 'Note', blocks: [{ text: 'Markdown content' }] }],
      folders: [{ path: 'Projects', icon: 'lucide:folder' }],
      futureMetadata: { preserved: true },
    };
    await gateway.saveRegistry(registry);
    await gateway.saveWorkspace('vault_random', workspace);
    assert.deepEqual([...files.keys()].sort(), [
      '.laplace/app.json',
      '.laplace/appearance.json',
      '.laplace/hotkeys.json',
      '.laplace/workspace.json',
    ]);
    const app = JSON.parse(files.get('.laplace/app.json'));
    assert.equal(app.spellcheckEnabled, false);
    assert.equal(app.theme, undefined);
    const metadata = JSON.parse(files.get('.laplace/workspace.json'));
    assert.equal(metadata.theme, undefined);
    assert.equal(metadata.shortcuts, undefined);
    assert.equal(metadata.pages[0].blocks, undefined);
    assert.equal(metadata.folders[0].icon, undefined);
    await gateway.saveRegistry({ ...registry, workspaceId: 'workspace_new' });
    const restored = createStorageGateway(STORAGE_CONFIG);
    restored.directoryHandle = directory('Notes', files, '', false);
    assert.equal((await restored.loadRegistry()).workspaceId, 'workspace_new');
    assert.deepEqual(await restored.loadWorkspace('a_different_internal_id'), {
      ...workspace,
      pages: [{ id: 'page_1', title: 'Note' }],
      folders: [{ path: 'Projects' }],
    });
    const before = [...files.entries()];
    await assert.rejects(restored.saveWorkspace('vault_random', workspace), /Write access/);
    assert.deepEqual([...files.entries()], before);
    files.set('.laplace/appearance.json', '{invalid');
    await assert.rejects(restored.loadWorkspace('vault_random'), SyntaxError);
    files.set('.laplace/appearance.json', '[]');
    await assert.rejects(restored.loadWorkspace('vault_random'), /expected an object/);
    await assert.rejects(
      gateway.saveRegistry({ ...registry, vaults: [{ id: 'a' }, { id: 'b' }] }),
      /one workspace/,
    );
    await gateway.deleteWorkspace('vault_random');
    assert.deepEqual([...files.keys()], ['.laplace/app.json']);
    assert.equal(await restored.loadWorkspace('vault_random'), null);
    const other = createStorageGateway(STORAGE_CONFIG);
    other.directoryHandle = directory('Other folder');
    assert.equal(await other.loadWorkspace('vault_random'), null);
  } finally {
    await server.close();
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

test('cleanup protects encoded links, icons, nested blocks and transitive asset references', async () => {
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { attachmentReferenceSources, findUnusedAttachments } = await server.ssrLoadModule(
      '/src/features/attachments/services/unused-attachments.ts',
    );
    const names = [
      'used.svg',
      'manual español.pdf',
      'page-icon.png',
      'style.css',
      'dependent.svg',
      'nested.png',
      'orphan.svg',
      'photo.png',
      'photo.png.backup',
      'duplicate.svg',
    ];
    const assets = names.map((name) => ({ path: `.attachments/${name}`, name }));
    assets.push({ path: '.attachments/sub/duplicate.svg', name: 'duplicate.svg' });
    const sources = attachmentReferenceSources({
      pages: [
        {
          icon: '.attachments/page-icon.png',
          blocks: [{ type: 'columns', columns: [{ blocks: [{ src: '.attachments/used.svg' }] }] }],
        },
      ],
    });
    sources.push(
      '[Manual](../.attachments/manual%20espa%C3%B1ol.pdf)',
      '<link href=".attachments/style.css">',
      '![[duplicate.svg|Alias]]',
      '![[photo.png.backup]]',
    );
    const contents = {
      'style.css': 'url(dependent.svg)',
      'dependent.svg': '<image href="nested.png"/>',
      'orphan.svg': '<image href="photo.png"/>',
    };
    const unused = await findUnusedAttachments(
      assets,
      sources,
      async (asset) => contents[asset.name] || null,
    );
    assert.deepEqual(
      unused.map((asset) => asset.name),
      ['orphan.svg', 'photo.png'],
    );
    await assert.rejects(
      findUnusedAttachments(assets, sources, async () => {
        throw new Error('Read failed');
      }),
      /Read failed/,
    );
    assert.deepEqual(await findUnusedAttachments(assets, [], async () => null), assets);
    const { registerAttachments } = await server.ssrLoadModule(
      '/src/features/attachments/services/register.ts',
    );
    const deleted = [];
    const runtime = {
      state: { pages: [] },
      activeVaultId: 'test',
      workspaceAccess: 'writable',
      storageWriteChain: Promise.resolve(),
      localStorageGateway: {
        listAttachments: async () => [
          {
            path: '.attachments/newly-used.svg',
            name: 'newly-used.svg',
            size: 12,
            type: 'image/svg+xml',
          },
        ],
        hasDirectory: () => false,
        readAttachment: async () => new Blob(['<svg/>'], { type: 'image/svg+xml' }),
        deleteAttachment: async (path) => deleted.push(path),
        getDirectoryPermission: async () => 'none',
      },
      askDeleteConfirmation: async () => {
        runtime.state.pages.push({
          blocks: [{ type: 'image', src: '.attachments/newly-used.svg' }],
        });
        return true;
      },
      toast() {},
      syncWorkspaceLocationActions() {},
      clearAttachmentObjectUrls() {},
      setWorkspaceAccess: (value) => {
        runtime.workspaceAccess = value;
      },
      accessModeForPermission: () => 'writable',
    };
    registerAttachments(runtime);
    runtime.clearAttachmentObjectUrls = () => {};
    runtime.closeAttachmentPreview = () => {};
    runtime.refreshAttachmentList = async () => {};
    await runtime.cleanupUnusedAttachments();
    assert.deepEqual(
      deleted,
      [],
      'a reference added while confirmation was open must prevent deletion',
    );
    assert.equal(runtime.workspaceAccess, 'writable');
    assert.equal(runtime.workspaceLocationSwitching, false);
  } finally {
    await server.close();
  }
});

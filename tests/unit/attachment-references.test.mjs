import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

test('attachment references resolve nested images, links, HTML and note icons to their pages', async () => {
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { attachmentReferences } = await server.ssrLoadModule(
      '/src/features/attachments/services/attachment-references.ts',
    );
    const names = ['photo.svg', 'manual español.pdf', 'movie.mp4', 'icon.png', 'orphan.png'];
    const assets = names.map((name) => ({ path: `.attachments/${name}` }));
    const pages = [
      {
        id: 'one',
        title: 'First',
        filePath: 'notes/First.md',
        icon: '.attachments/icon.png',
        blocks: [
          {
            type: 'columns',
            columns: [{ blocks: [{ type: 'image', src: '.attachments/photo.svg' }] }],
          },
          { type: 'toggle', children: [{ type: 'image', src: 'attachments/photo.svg' }] },
          { text: '[Manual](../.attachments/manual%20espa%C3%B1ol.pdf#page=2)' },
          { text: '<video src=".attachments/movie.mp4"></video>' },
          { text: 'https://example.com/.attachments/orphan.png' },
          { inlineLinks: [{ url: 'https://.attachments/manual%20espa%C3%B1ol.pdf' }] },
        ],
      },
      { id: 'two', title: 'Second', blocks: [{ text: '![[photo.svg|Diagram]]' }] },
    ];
    const normalize = (value) =>
      value.replace(/^\.\//, '').replace(/^attachments\//, '.attachments/');
    const references = attachmentReferences(pages, assets, normalize);
    assert.equal(references.get('.attachments/photo.svg').get('one').count, 2);
    assert.equal(references.get('.attachments/photo.svg').get('two').count, 1);
    for (const name of names.slice(1, -1))
      assert.equal(
        references.get(`.attachments/${name}`).get('one').count,
        name.startsWith('manual') ? 2 : 1,
      );
    assert.equal(references.has('.attachments/orphan.png'), false);
    const updated = attachmentReferences(
      [{ ...pages[0], blocks: [], icon: '' }],
      assets,
      normalize,
    );
    assert.equal(updated.size, 0);
  } finally {
    await server.close();
  }
});

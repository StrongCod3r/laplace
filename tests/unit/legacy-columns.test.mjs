import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

test('legacy columns become ordinary blocks without losing nested content or formatting', async () => {
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { registerEditor } = await server.ssrLoadModule(
      '/src/features/editor/services/register.ts',
    );
    let nextId = 0;
    const runtime = { uid: () => 'block-' + ++nextId, INLINE_FORMAT_TYPES: new Set(['bold']) };
    registerEditor(runtime);
    const text = {
      id: 'text',
      type: 'text',
      text: 'Important',
      inlineFormats: [{ start: 0, end: 9, type: 'bold' }],
    };
    const image = { id: 'image', type: 'image', src: '.attachments/photo.png', caption: 'Photo' };
    const nested = { id: 'nested', type: 'text', text: 'Nested content' };
    const toggle = {
      id: 'toggle',
      type: 'toggle',
      text: 'Details',
      open: true,
      children: [{ type: 'columns', columns: [{ blocks: [nested] }] }],
    };
    const source = [
      { id: 'before', type: 'text', text: 'Before' },
      {
        type: 'columns',
        columns: [
          { blocks: [text, { type: 'columns', columns: [{ blocks: [image] }] }] },
          { blocks: [toggle] },
        ],
      },
      { id: 'after', type: 'text', text: 'After' },
    ];
    const normalized = runtime.normalizeBlockTree(source);
    assert.deepEqual(
      normalized.map((block) => block.id),
      ['before', 'text', 'image', 'toggle', 'after'],
    );
    assert.deepEqual(normalized[1], text);
    assert.deepEqual(normalized[1].inlineFormats, [{ start: 0, end: 9, type: 'bold' }]);
    assert.deepEqual(normalized[2], image);
    assert.deepEqual(normalized[3].children, [nested]);
    assert.equal(normalized[3].open, true);
    assert.ok(runtime.flattenBlocks(normalized).every((block) => block.type !== 'columns'));
    assert.deepEqual(runtime.normalizeBlockTree(normalized), normalized);
    assert.deepEqual(
      runtime
        .normalizeBlockTree([{ type: 'columns', columns: ['Old text'] }])
        .map((block) => block.text),
      ['Old text'],
    );
    assert.deepEqual(runtime.normalizeBlockTree([{ type: 'columns', columns: null }]), []);
  } finally {
    await server.close();
  }
});

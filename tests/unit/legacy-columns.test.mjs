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
      ['before', 'text', 'image', 'toggle', 'nested', 'after'],
    );
    assert.deepEqual(normalized[1], text);
    assert.deepEqual(normalized[1].inlineFormats, [{ start: 0, end: 9, type: 'bold' }]);
    assert.deepEqual(normalized[2], image);
    assert.equal(normalized[3].type, 'text');
    assert.equal(normalized[3].text, 'Details');
    assert.equal(normalized[3].children, undefined);
    assert.equal(normalized[3].open, undefined);
    assert.deepEqual(normalized[4], nested);
    assert.ok(runtime.flattenBlocks(normalized).every((block) => block.type !== 'columns'));
    assert.deepEqual(runtime.normalizeBlockTree(normalized), normalized);
    assert.deepEqual(
      runtime
        .normalizeBlockTree([{ type: 'columns', columns: ['Old text'] }])
        .map((block) => block.text),
      ['Old text'],
    );
    assert.deepEqual(runtime.normalizeBlockTree([{ type: 'columns', columns: null }]), []);
    const closed = {
      id: 'closed',
      type: 'toggle',
      text: 'Important',
      open: false,
      inlineFormats: [{ start: 0, end: 9, type: 'bold' }],
      children: [{ id: 'inner', type: 'toggle', text: 'Inner', open: false, children: [image] }],
    };
    const original = structuredClone(closed);
    const expanded = runtime.normalizeBlockTree([closed]);
    assert.deepEqual(
      expanded.map((block) => block.id),
      ['closed', 'inner', 'image'],
    );
    assert.deepEqual(
      expanded.map((block) => block.type),
      ['text', 'text', 'image'],
    );
    assert.deepEqual(expanded[0].inlineFormats, closed.inlineFormats);
    assert.deepEqual(expanded[2], image);
    assert.deepEqual(closed, original);
    assert.deepEqual(runtime.normalizeBlockTree(expanded), expanded);
  } finally {
    await server.close();
  }
});

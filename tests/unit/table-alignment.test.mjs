import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

test('table alignment survives Markdown reloads and follows columns when edited', async () => {
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { registerTables } = await server.ssrLoadModule(
      '/src/features/tables/services/register.ts',
    );
    const { registerMarkdown } = await server.ssrLoadModule(
      '/src/features/markdown/services/register.ts',
    );
    const { registerEditor } = await server.ssrLoadModule(
      '/src/features/editor/services/register.ts',
    );
    let nextId = 0;
    const runtime = {
      uid: () => `block-${++nextId}`,
      normalizeFolderPath: (path) => path,
    };
    registerTables(runtime);
    registerEditor(runtime);
    registerMarkdown(runtime);
    runtime.clearTableCellSelection = () => {};

    let block = {
      id: 'table',
      type: 'table',
      tableRows: [
        ['Label', 'Amount', 'Status'],
        ['First\n\nLast', '123', 'Ready'],
      ],
    };
    runtime.mutateSimpleTableAxis(block, 'col', 'align-center', 1);
    runtime.mutateSimpleTableAxis(block, 'col', 'align-right', 2);
    const expectedRows = structuredClone(block.tableRows);
    for (let reload = 0; reload < 2; reload++) {
      const markdown = runtime.simpleTableMarkdown(block);
      assert.match(markdown, /\| --- \| :---: \| ---: \|/);
      block = runtime.parseMarkdownFile({ path: 'Table.md', content: `${markdown}\n` }).blocks[0];
      assert.deepEqual(block.tableRows, expectedRows);
      assert.deepEqual(block.tableColumnAlignments, ['left', 'center', 'right']);
    }

    runtime.reorderSimpleTableAxis(block, 'col', 2, 0, false);
    assert.deepEqual(block.tableRows[0], ['Status', 'Label', 'Amount']);
    assert.deepEqual(block.tableColumnAlignments, ['right', 'left', 'center']);
    runtime.mutateSimpleTableAxis(block, 'col', 'duplicate', 0);
    assert.deepEqual(block.tableColumnAlignments, ['right', 'right', 'left', 'center']);
    runtime.mutateSimpleTableAxis(block, 'col', 'insert-before', 2);
    runtime.mutateSimpleTableAxis(block, 'col', 'delete', 0);
    assert.deepEqual(block.tableRows[0], ['Status', '', 'Label', 'Amount']);
    assert.deepEqual(block.tableColumnAlignments, ['right', 'left', 'left', 'center']);
    runtime.mutateSimpleTableAxis(block, 'row', 'duplicate', 0);
    assert.deepEqual(block.tableColumnAlignments, ['right', 'left', 'left', 'center']);
    runtime.mutateSimpleTableAxis(block, 'col', 'align-left', 3);
    assert.equal(block.tableColumnAlignments[3], 'left');
    while (block.tableRows[0].length > 1) runtime.mutateSimpleTableAxis(block, 'col', 'delete', 1);
    const singleColumn = runtime.parseMarkdownBlocks(runtime.simpleTableMarkdown(block))[0];
    assert.deepEqual(singleColumn.tableColumnAlignments, ['right']);
    assert.deepEqual(singleColumn.tableRows, block.tableRows);
  } finally {
    await server.close();
  }
});

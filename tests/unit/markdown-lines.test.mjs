import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { readFileSync } from 'node:fs';

test('consecutive note lines survive repeated Markdown saves without spaces or extra blank lines', async () => {
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { registerTables } = await server.ssrLoadModule(
      '/src/features/tables/services/register.ts',
    );
    const { registerEditor } = await server.ssrLoadModule(
      '/src/features/editor/services/register.ts',
    );
    const { registerMarkdown } = await server.ssrLoadModule(
      '/src/features/markdown/services/register.ts',
    );
    const { registerInteractions } = await server.ssrLoadModule(
      '/src/features/interactions/services/register.ts',
    );
    let nextId = 0;
    const runtime = {
      uid: () => `block-${++nextId}`,
      normalizeFolderPath: (path) => path,
      validateFilesystemName: () => '',
      INLINE_FORMAT_TYPES: new Set(['bold']),
      CODE_LANGUAGES: [['plain', 'Plain text']],
    };
    registerTables(runtime);
    registerEditor(runtime);
    registerMarkdown(runtime);
    registerInteractions(runtime);
    const workspace = { pages: [] };
    const linkedList = readFileSync(new URL('../fixtures/list-links.md', import.meta.url), 'utf8');
    const urls = [...linkedList.matchAll(/\]\(([^)]+)\)/g)].map((match) => `${match[1]}/`);
    for (const kind of ['number', 'bullet']) {
      let markdown = kind === 'number' ? linkedList : linkedList.replace(/^\d+\. /gm, '- ');
      for (let reload = 0; reload < 3; reload++) {
        const { blocks } = runtime.parseMarkdownFile({ path: 'Links.md', content: markdown });
        assert.equal(blocks.length, 8);
        assert.deepEqual(
          blocks.map((block) => block.type),
          Array(8).fill(kind),
        );
        assert.deepEqual(
          blocks.map((block) => block.inlineLinks[0].url),
          urls,
        );
        for (const block of blocks) {
          assert.ok(!block.text.includes('&#x20;'));
          const [link] = block.inlineLinks;
          assert.equal(block.text.slice(link.start, link.end), link.url.slice(0, -1));
        }
        markdown = runtime.markdownForBlocks(blocks, workspace, new Map());
      }
    }
    const inline = runtime.parseMarkdownInlinePayload('&#32;[Link](http://jiro.build)&#x20;after');
    assert.equal(inline.text, ' Link after');
    assert.deepEqual(inline.links, [{ start: 1, end: 5, url: 'http://jiro.build/' }]);
    for (const source of [
      'Lorenz\nIgniz\nLaplace\nNotidian\nBase\nsoft',
      '**Lorenz**\nIgniz<br>continued<br><br>last\nLaplace\n# Heading\n- Item\nEnd',
      '> Quote<br>continued\nLorenz\nIgniz\nLaplace\nBase\nsoft',
    ]) {
      let saved = source;
      for (let reload = 0; reload < 3; reload++) {
        const { blocks } = runtime.parseMarkdownFile({ path: 'Lines.md', content: `${saved}\n` });
        assert.equal(blocks.length, 6);
        saved = runtime.markdownForBlocks(blocks, workspace, new Map());
        assert.equal(saved, source);
      }
    }
    const tableSources = [
      '| Source | Other |\n| --- | --- |\n| First<br>Second<br><br>Fourth | Keep |',
      '| Pasted | Other |\n| --- | --- |\n| One<br>Two | Next |',
    ];
    for (const source of [
      'A\n\nB\n\nC',
      'A\n\n\nB\nC',
      '\n\nA\nB\nC\n\n',
      'A\n \t\nB',
      '# Heading\n\n- Item\n\nEnd',
      '```plain\nA\n\nB\n```\n\nC',
      tableSources.join('\n\n'),
    ]) {
      const expected = source.replace(/^[ \t]+$/gm, '');
      let content = `${source}\n`;
      for (let reload = 0; reload < 3; reload++) {
        const { blocks } = runtime.parseMarkdownFile({ path: 'Blank lines.md', content });
        assert.equal(runtime.markdownForBlocks(blocks, workspace, new Map()), expected);
        if (source === 'A\n\nB\n\nC')
          assert.deepEqual(
            blocks.map((block) => block.text),
            ['A', '', 'B', '', 'C'],
          );
        const page = { id: 'blank-lines', title: 'Blank lines', blocks };
        const files = runtime.serializeMarkdownWorkspace({ pages: [page] });
        content = files[0].content;
        assert.equal(content, `${expected}\n`);
      }
    }
    for (const src of [
      '.attachments/photo.png',
      'https://example.com/photo.png',
      'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E',
    ]) {
      const caption = 'Caption "quoted" & literal &quot; **text** [label] \\path\nSecond line';
      let images = [{ id: 'image-caption', type: 'image', src, alt: 'Alternative text', caption }];
      for (let reload = 0; reload < 3; reload++) {
        const saved = runtime.markdownForBlocks(images, workspace, new Map());
        images = runtime.parseMarkdownFile({ path: 'Image.md', content: `${saved}\n` }).blocks;
        assert.equal(images.length, 1);
        assert.equal(images[0].type, 'image');
        assert.equal(images[0].src, src);
        assert.equal(images[0].alt, 'Alternative text');
        assert.equal(images[0].caption, caption);
      }
    }
    let tables = tableSources.flatMap((source) => runtime.parseMarkdownBlocks(source));
    const expectedRows = tables.map((table) => structuredClone(table.tableRows));
    for (let reload = 0; reload < 3; reload++) {
      const saved = runtime.markdownForBlocks(tables, workspace, new Map());
      assert.equal(saved, tableSources.join('\n\n'));
      tables = runtime.parseMarkdownBlocks(saved);
      assert.deepEqual(
        tables.map((table) => table.type),
        ['table', 'table'],
      );
      assert.deepEqual(
        tables.map((table) => table.tableRows),
        expectedRows,
      );
    }
  } finally {
    await server.close();
  }
});

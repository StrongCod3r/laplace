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
      STORAGE_CONFIG: { indexeddb: { attachmentsDirectory: '.attachments' } },
    };
    registerTables(runtime);
    registerEditor(runtime);
    registerMarkdown(runtime);
    registerInteractions(runtime);
    const { attachListContinuation, detachListContinuation } = await server.ssrLoadModule(
      '/src/features/interactions/services/list-continuation.ts',
    );
    const workspace = { pages: [] };
    for (const kind of ['number', 'bullet']) {
      const marker = kind === 'number' ? '1. ' : '- ';
      const padding = ' '.repeat(marker.length);
      let content =
        marker +
        'First\n\tIntermediate **bold** [link](https://example.com)\n' +
        marker +
        'Second\n' +
        marker +
        'Third\n';
      for (let reload = 0; reload < 3; reload++) {
        const { blocks } = runtime.parseMarkdownFile({ path: 'Continuation.md', content });
        assert.deepEqual(
          blocks.map((block) => block.type),
          [kind, kind, kind],
        );
        assert.equal(blocks[0].text, 'First\nIntermediate bold link');
        assert.equal(blocks[1].text, 'Second');
        assert.equal(blocks[2].text, 'Third');
        assert.equal(blocks[0].inlineLinks[0].url, 'https://example.com/');
        assert.equal(
          blocks[0].text.slice(blocks[0].inlineLinks[0].start, blocks[0].inlineLinks[0].end),
          'link',
        );
        if (kind === 'number')
          assert.deepEqual(
            blocks.map((block) => runtime.numberForBlock(block.id, blocks)),
            [1, 2, 3],
          );
        content = runtime.markdownForBlocks(blocks, workspace, new Map()) + '\n';
        if (kind === 'number')
          assert.deepEqual(
            [...content.matchAll(/^(\d+)\. /gm)].map((match) => Number(match[1])),
            [1, 2, 3],
          );
        assert.ok(
          content.includes('\n' + padding + 'Intermediate **bold** [link](https://example.com/)'),
        );
      }
    }
    for (const marker of ['- ', '1. ']) {
      const blocks = runtime.parseMarkdownFile({
        path: 'Detached.md',
        content: `${marker}First\n\tIntermediate **bold** [link](https://example.com) [[Target|wiki]]\n${marker}Next\n`,
      }).blocks;
      const original = structuredClone(blocks[0]);
      const split = detachListContinuation(blocks[0], 'First\n'.length, 'detached');
      assert.ok(split);
      assert.deepEqual(blocks[0], original, 'splitting must not mutate its source');
      assert.equal(split[0].id, original.id);
      assert.equal(split[1].type, 'text');
      assert.equal(split[1].text, 'Intermediate bold link wiki');
      const joined = attachListContinuation(split[0], split[1]);
      assert.deepEqual(
        joined,
        original,
        'Tab must reverse outdenting without losing inline metadata',
      );
      assert.equal(
        attachListContinuation(split[1], split[0]),
        null,
        'only ordinary text after a list item can be attached',
      );
      for (const [key, label] of [
        ['inlineLinks', 'link'],
        ['inlineFormats', 'bold'],
        ['wikiLinks', 'wiki'],
      ]) {
        const range = split[1][key][0];
        assert.equal(split[1].text.slice(range.start, range.end), label);
      }
      let saved = runtime.markdownForBlocks([...split, blocks[1]], workspace, new Map());
      for (let reload = 0; reload < 3; reload++) {
        const restored = runtime.parseMarkdownFile({
          path: 'Detached.md',
          content: saved + '\n',
        }).blocks;
        assert.deepEqual(
          restored.map((block) => [block.type, block.text]),
          [
            [original.type, 'First'],
            ['text', 'Intermediate bold link wiki'],
            [original.type, 'Next'],
          ],
        );
        saved = runtime.markdownForBlocks(restored, workspace, new Map());
        assert.ok(
          saved.includes('\nIntermediate **bold** [link](https://example.com/) [[Target|wiki]]\n'),
        );
      }
    }
    const nestedContinuation = runtime.parseMarkdownBlocks(
      '1. Parent\n   parent text\n  1. Child\n     child text\n1. Next',
      { preserveInline: true },
    );
    assert.deepEqual(
      nestedContinuation.map((block) => [block.type, block.text, runtime.listIndentLevel(block)]),
      [
        ['number', 'Parent\nparent text', 0],
        ['number', 'Child\nchild text', 1],
        ['number', 'Next', 0],
      ],
    );
    assert.equal(
      runtime.markdownForBlocks(nestedContinuation, workspace, new Map()),
      '1. Parent\n   parent text\n  1. Child\n     child text\n2. Next',
    );
    const longList = Array.from({ length: 12 }, (_, index) => ({
      id: `number-${index}`,
      type: 'number',
      text: `Item ${index + 1}${index === 9 ? '\nContinuation 10' : ''}`,
    }));
    const longMarkdown = runtime.markdownForBlocks(longList, workspace, new Map());
    assert.deepEqual(
      [...longMarkdown.matchAll(/^(\d+)\. /gm)].map((match) => Number(match[1])),
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    assert.ok(longMarkdown.includes('10. Item 10\n    Continuation 10\n11. Item 11'));
    const mixedList = runtime.parseMarkdownBlocks(
      '1. One\n  1. Child one\n  1. Child two\n1. Two\n- Bullet\n1. New one\nText\n1. Another one',
    );
    const mixedNumbers = [
      ...runtime.markdownForBlocks(mixedList, workspace, new Map()).matchAll(/^\s*(\d+)\. /gm),
    ].map((match) => Number(match[1]));
    assert.deepEqual(mixedNumbers, [1, 1, 2, 2, 1, 1]);
    assert.deepEqual(
      mixedNumbers,
      mixedList
        .filter((block) => block.type === 'number')
        .map((block) => runtime.numberForBlock(block.id, mixedList)),
    );
    const multiline = [
      { id: 'first', type: 'number', text: 'First\n\nlast\n' },
      { id: 'second', type: 'number', text: 'Next' },
    ];
    const savedMultiline = runtime.markdownForBlocks(multiline, workspace, new Map());
    const restoredMultiline = runtime.parseMarkdownFile({
      path: 'Empty continuation.md',
      content: savedMultiline + '\n',
    }).blocks;
    assert.deepEqual(
      restoredMultiline.map((block) => [block.type, block.text]),
      multiline.map((block) => [block.type, block.text]),
    );
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
      let images = [
        {
          id: 'image-caption',
          type: 'image',
          src,
          alt: 'Alternative text',
          caption,
          imageWidth: 313,
        },
      ];
      for (let reload = 0; reload < 3; reload++) {
        const saved = runtime.markdownForBlocks(images, workspace, new Map());
        assert.ok(saved.includes('|313]'));
        images = runtime.parseMarkdownFile({ path: 'Image.md', content: `${saved}\n` }).blocks;
        assert.equal(images.length, 1);
        assert.equal(images[0].type, 'image');
        assert.equal(images[0].src, src);
        assert.equal(images[0].alt, 'Alternative text');
        assert.equal(images[0].caption, caption);
        assert.equal(images[0].imageWidth, 313);
      }
    }
    let resized = '![[Pasted image 20261015204831.png|313]]';
    for (let reload = 0; reload < 3; reload++) {
      const images = runtime.parseMarkdownFile({ path: 'Image.md', content: resized }).blocks;
      assert.equal(images[0].imageWidth, 313);
      assert.equal(images[0].alt, '');
      assert.equal(images[0].src, '.attachments/Pasted image 20261015204831.png');
      resized = runtime.markdownForBlocks(images, workspace, new Map());
      assert.ok(resized.endsWith('|313]]'));
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

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

test('math syntax and Markdown preserve LaTeX without interpreting its inline punctuation', async () => {
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { inlineMathRanges } = await server.ssrLoadModule('/src/features/math/syntax.ts');
    const { slashTokenAtCaret } = await server.ssrLoadModule(
      '/src/features/commands/services/slash-token.ts',
    );
    assert.deepEqual(slashTokenAtCaret('Before /eq after', 10), { start: 7, end: 10, query: 'eq' });
    assert.deepEqual(slashTokenAtCaret('line\n/eq', 8), { start: 5, end: 8, query: 'eq' });
    assert.equal(slashTokenAtCaret('/', 0), null);
    assert.equal(slashTokenAtCaret('https://example.com/eq', 22), null);
    assert.equal(slashTokenAtCaret('folder/eq', 9), null);
    const { registerMarkdown } = await server.ssrLoadModule(
      '/src/features/markdown/services/register.ts',
    );
    const { registerEditor } = await server.ssrLoadModule(
      '/src/features/editor/services/register.ts',
    );
    const { registerTables } = await server.ssrLoadModule(
      '/src/features/tables/services/register.ts',
    );
    const { renderMathHTML } = await server.ssrLoadModule('/src/features/math/render.ts');
    let nextId = 0;
    const runtime = {
      uid: () => `math-${++nextId}`,
      CODE_LANGUAGES: [
        ['plain', 'Plain'],
        ['latex', 'LaTeX'],
      ],
      INLINE_FORMAT_TYPES: new Set(['bold', 'italic', 'code']),
      wikiLinksInText: () => [],
      htmlWithStyles: (html) => html,
      escapeHtml: (text) => text,
      isListBlock: () => false,
    };
    registerEditor(runtime);
    registerTables(runtime);
    registerMarkdown(runtime);
    assert.equal(inlineMathRanges(String.raw`Price \$5 and $10, code ` + '`$x$`').length, 0);
    assert.equal(inlineMathRanges('$$x$$ and $ unfinished').length, 0);
    assert.equal(inlineMathRanges('$x$ and \\(y\\)').length, 2);
    assert.equal(inlineMathRanges('$ x $ and $5 and $10').length, 0);
    assert.equal(inlineMathRanges(String.raw`$a+\$b$`)[0].source, String.raw`a+\$b`);

    const original = String.raw`Before **bold** $\frac{x_1}{\sqrt{y^2}} + \text{a_b} < 4$ after \(\sum_{n=1}^{N} n\).`;
    const display = String.raw`\begin{aligned}
f(x) &= x^2 \\
g(x) &= \frac{1}{x}
\end{aligned}`;
    let markdown = original + '\n```math\n' + display + '\n```\n$$\n' + display + '\n$$\n';
    for (let reload = 0; reload < 3; reload++) {
      const blocks = runtime.parseMarkdownBlocks(markdown, { preserveInline: true });
      assert.equal(blocks[0].text, original.replace('**bold**', 'bold'));
      assert.deepEqual(blocks[0].inlineFormats, [{ start: 7, end: 11, type: 'bold' }]);
      assert.equal(blocks[1].language, 'latex');
      assert.equal(blocks[1].text, display);
      assert.equal(blocks[2].mathFence, 'dollars');
      assert.equal(blocks[2].text, display);
      markdown = runtime.markdownForBlocks(blocks, { pages: [] }, new Map()) + '\n';
      assert.equal(
        markdown,
        original + '\n```latex\n' + display + '\n```\n$$\n' + display + '\n$$\n',
      );
    }
    const escaped = String.raw`Literal \$x\$ and code ` + '`$x_y$`';
    const parsed = runtime.parseMarkdownInlinePayload(escaped);
    assert.equal(inlineMathRanges(parsed.text).length, 1);
    assert.equal(
      runtime
        .inlineTextHTML({ text: '$x_y$', inlineFormats: [{ start: 0, end: 5, type: 'code' }] })
        .includes('data-inline-math'),
      false,
    );
    assert.match(renderMathHTML(String.raw`\int_0^1 x^2\,dx`, true), /katex-display/);
    const aligned = String.raw`\begin{aligned}
(x + y)^2 &= (x + y)(x + y) \\
           &= x^2 + xy + yx + y^2 \\
           &= x^2 + 2xy + y^2
\end{aligned}`;
    const renderedAligned = renderMathHTML(aligned, true);
    assert.doesNotMatch(renderedAligned, /math-error/);
    assert.equal(renderMathHTML('$$\n' + aligned + '\n$$', true), renderedAligned);
    assert.equal(renderMathHTML('\\[\n' + aligned + '\n\\]', true), renderedAligned);
    assert.match(renderMathHTML('$$\n' + aligned, true), /math-error/);
    assert.match(renderMathHTML(String.raw`\frac{`), /math-error/);
    const styledFormula = {
      text: String.raw`$\frac{x}{2}$ tail`,
      inlineFormats: [{ start: 7, end: 8, type: 'bold' }],
    };
    const styledMarkdown = runtime.markdownInlineForBlock(styledFormula, { pages: [] }, new Map());
    const styledReload = runtime.parseMarkdownInlinePayload(styledMarkdown);
    assert.equal(styledReload.text, styledFormula.text);
    assert.deepEqual(styledReload.formats, styledFormula.inlineFormats);
    assert.doesNotMatch(
      renderMathHTML(String.raw`\href{javascript:alert(1)}{bad}`),
      /href="javascript:/,
    );
    assert.doesNotMatch(renderMathHTML('<img src=x onerror=alert(1)> \\bad'), /<img/);
    let tableMarkdown = '| Formula | Value |\n| --- | --- |\n| $x_1$ | $\\frac{1}{2}$ |';
    for (let reload = 0; reload < 3; reload++) {
      const [table] = runtime.parseMarkdownBlocks(tableMarkdown, { preserveInline: true });
      assert.equal(table.tableRows[1][1], '$\\frac{1}{2}$');
      tableMarkdown = runtime.simpleTableMarkdown(table, { pages: [] }, new Map());
      assert.equal(tableMarkdown, '| Formula | Value |\n| --- | --- |\n| $x_1$ | $\\frac{1}{2}$ |');
    }
  } finally {
    await server.close();
  }
});

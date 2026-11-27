import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

test('SQL highlighting distinguishes syntax without changing the source', async () => {
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { highlightSql } = await server.ssrLoadModule(
      '/src/features/code/services/sql-highlight.ts',
    );
    const escapeHtml = (text) =>
      text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const span = (kind, text) => `<span class="code-token ${kind}">${escapeHtml(text)}</span>`;
    const highlight = (source) => highlightSql(source, escapeHtml, (html) => html);

    const query = 'SELECT Count(*), coalesce(total, 0), USERS.name FROM USERS WHERE id >= :id';
    const html = highlight(query);
    for (const [kind, text] of [
      ['keyword', 'SELECT'],
      ['function', 'Count'],
      ['function', 'coalesce'],
      ['number', '0'],
      ['keyword', 'FROM'],
      ['keyword', 'WHERE'],
      ['operator', '>='],
      ['directive', ':id'],
    ])
      assert.ok(html.includes(span(kind, text)), `${kind}: ${text}`);
    assert.ok(!html.includes(span('type', 'USERS')));
    assert.equal(html.replace(/<[^>]*>/g, ''), escapeHtml(query));
    assert.equal(
      highlight('select SeLeCt SELECT'),
      ['select', 'SeLeCt', 'SELECT'].map((word) => span('keyword', word)).join(' '),
    );

    for (const literal of [
      "'it''s SELECT -- text'",
      "N'Unicode FROM'",
      String.raw`E'it\'s SELECT'`,
      '$$SELECT <script>$$',
      "$body$FROM 'quoted' -- text$body$",
      "'unfinished SELECT",
      '$tag$unfinished SELECT',
    ])
      assert.equal(highlight(literal), span('string', literal));

    for (const identifier of ['"SELECT"', '"a""b"', '`FROM`', '[Order]]Details]'])
      assert.equal(highlight(identifier), span('attr', identifier));
    for (const comment of ['-- SELECT COUNT(*)', "/* FROM 'text' */", '/* unfinished SELECT'])
      assert.equal(highlight(comment), span('comment', comment));
    assert.equal(
      highlight('-- comment\rSELECT'),
      `${span('comment', '-- comment')}\r${span('keyword', 'SELECT')}`,
    );

    for (const parameter of ['@user', '@@ROWCOUNT', ':name', '$1', '?'])
      assert.equal(highlight(parameter), span('directive', parameter));
    for (const number of ['42', '3.14', '.5', '1e-3', '0xFF'])
      assert.equal(highlight(number), span('number', number));
    assert.equal(
      highlight('value::JSONB'),
      `value${span('operator', '::')}${span('type', 'JSONB')}`,
    );
    for (const type of ['VARCHAR', 'int', 'TIMESTAMP', 'boolean'])
      assert.equal(highlight(type), span('type', type));
    assert.ok(highlight('WITH x AS (SELECT 1) SELECT * FROM x').includes(span('keyword', 'WITH')));
    assert.equal(highlight('<script>'), `${span('operator', '<')}script${span('operator', '>')}`);
  } finally {
    await server.close();
  }
});

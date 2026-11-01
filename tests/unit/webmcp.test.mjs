import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

test('WebMCP validates local tokens and scopes tools to a hydrated vault', async () => {
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { parseWebMcpToken } = await server.ssrLoadModule(
      '/src/features/webmcp/services/connection.ts',
    );
    const { createWebMcpTools } = await server.ssrLoadModule(
      '/src/features/webmcp/services/tools.ts',
    );
    const token = (server) => btoa(JSON.stringify({ server, token: 'secret' }));
    assert.equal(parseWebMcpToken(token('ws://127.0.0.1:3001')).server, 'ws://127.0.0.1:3001');
    for (const url of [
      'ws://example.com',
      'https://localhost',
      'ws://localhost.evil.com',
      'ws://localhost/path',
      'ws://user:password@localhost',
    ])
      assert.throws(() => parseWebMcpToken(token(url)));
    assert.throws(() => parseWebMcpToken('invalid'));
    let creates = 0;
    const runtime = {
      activeVaultId: 'vault',
      workspaceAccess: 'writable',
      lastSyncedWorkspace: {},
      state: {
        pages: [{ id: 'one', title: 'One', blocks: [] }],
        folders: [],
        currentPageId: 'one',
      },
      lifecycle: { disposed: false },
      serializeMarkdownWorkspace(document) {
        document.pages[0].filePath = 'One.md';
        return document.pages.map((page) => ({
          path: `${page.title}.md`,
          content: page.id === 'one' ? '---\naliases: [First]\n---\n\nHello\n' : '',
        }));
      },
      createPage() {
        creates++;
        const page = { id: 'new', title: 'New', blocks: [] };
        this.state.pages.push(page);
        return page;
      },
      flushHistoryPending() {},
      persistStateNow: async () => true,
      publish() {},
    };
    const execute = createWebMcpTools(runtime, 'vault');
    const read = JSON.parse(execute('laplace_read_note', { pageId: 'one' }).content[0].text);
    assert.match(read.markdown, /aliases: \[First\]/);
    assert.equal(
      runtime.state.pages[0].filePath,
      undefined,
      'reading must not mutate the document',
    );
    assert.equal(
      JSON.parse(execute('laplace_search_notes', { query: 'Hello' }).content[0].text).total,
      1,
    );
    assert.throws(() => execute('laplace_read_note', { pageId: 'missing' }), /not found/);
    assert.throws(() => execute('laplace_create_note', { title: '../bad' }), /valid note title/);
    assert.throws(
      () => execute('laplace_create_note', { title: 'New', extra: true }),
      /Invalid argument/,
    );
    assert.throws(
      () => execute('laplace_create_note', JSON.parse('{"title":"New","__proto__":"bad"}')),
      /Invalid argument/,
    );
    execute('laplace_create_note', { title: 'New' });
    assert.equal(creates, 1);
    assert.equal(
      JSON.parse(execute('laplace_search_notes', { limit: 1 }).content[0].text).nextOffset,
      1,
    );
    assert.equal(
      JSON.parse(execute('laplace_search_notes', { offset: 1, limit: 1 }).content[0].text).notes[0]
        .pageId,
      'new',
    );
    for (const args of [
      { limit: 0 },
      { limit: 101 },
      { offset: -1 },
      { limit: 1.5 },
      { limit: '1' },
    ])
      assert.throws(() => execute('laplace_search_notes', args), /Invalid argument/);
    assert.throws(
      () =>
        execute('laplace_replace_note', {
          pageId: 'one',
          markdown: 'Replacement',
          expectedMarkdown: 'stale',
        }),
      /has changed/,
    );
    assert.throws(
      () =>
        execute('laplace_append_note', {
          pageId: 'one',
          markdown: 'Append',
          expectedMarkdown: 'stale',
        }),
      /has changed/,
    );
    assert.throws(
      () => execute('laplace_replace_note', { pageId: 'one', markdown: '' }),
      /Missing argument/,
    );
    assert.throws(
      () => execute('laplace_create_note', { title: 'Huge', markdown: 'x'.repeat(1_000_001) }),
      /length/,
    );
    assert.throws(
      () => execute('laplace_set_favorite', { pageId: 'one', favorite: 'true' }),
      /Invalid argument/,
    );
    assert.equal(
      JSON.parse((await execute('laplace_save_workspace', {})).content[0].text).saved,
      true,
    );
    runtime.persistStateNow = async () => false;
    await assert.rejects(execute('laplace_save_workspace', {}), /save failed/);
    let finishSave;
    runtime.persistStateNow = () =>
      new Promise((resolve) => {
        finishSave = resolve;
      });
    const save = execute('laplace_save_workspace', {});
    runtime.activeVaultId = 'other';
    finishSave(true);
    await assert.rejects(save, /unavailable/);
    runtime.activeVaultId = 'vault';
    runtime.workspaceAccess = 'readonly';
    assert.throws(() => execute('laplace_create_note', { title: 'New' }), /read-only/);
    for (const [name, args] of [
      [
        'laplace_replace_note',
        { pageId: 'one', markdown: 'Replacement', expectedMarkdown: read.markdown },
      ],
      [
        'laplace_append_note',
        { pageId: 'one', markdown: 'Append', expectedMarkdown: read.markdown },
      ],
      ['laplace_set_favorite', { pageId: 'one', favorite: true }],
      ['laplace_save_workspace', {}],
    ])
      assert.throws(() => execute(name, args), /read-only/);
    execute('laplace_read_note', { pageId: 'one' });
    runtime.state.openTabs = [
      { id: 'note-tab', kind: 'page', pageId: 'one', groupId: 'main' },
      { id: 'graph-tab', kind: 'graph', groupId: 'main' },
    ];
    runtime.state.editorLayout = { type: 'group', id: 'main', activeTabId: 'note-tab' };
    runtime.state.activeTabId = 'note-tab';
    runtime.state.activeEditorGroupId = 'main';
    runtime.state.mainView = 'page';
    runtime.editorGroups = () => [runtime.state.editorLayout];
    let closes = 0;
    runtime.closeTab = () => {
      closes++;
    };
    runtime.reopenClosedTab = () => false;
    const beforeListing = structuredClone(runtime.state);
    const tabs = JSON.parse(execute('laplace_list_tabs', {}).content[0].text);
    assert.equal(tabs.tabs[0].title, 'One');
    assert.equal(tabs.tabs[1].title, 'Graph');
    assert.equal(tabs.tabs[0].selected, true);
    assert.equal(tabs.tabs[1].active, false);
    assert.deepEqual(runtime.state, beforeListing, 'listing must not mutate editor state');
    for (const [name, args] of [
      ['laplace_close_tab', { tabId: 'missing' }],
      ['laplace_activate_tab', { tabId: 'missing' }],
      ['laplace_open_note', { pageId: 'one', groupId: 'missing' }],
      ['laplace_split_editor', { tabId: 'graph-tab' }],
      ['laplace_split_editor', { edge: 'diagonal' }],
      ['laplace_open_view', { view: 'settings' }],
      ['laplace_move_tab', { tabId: 'note-tab', groupId: 'missing' }],
    ])
      assert.throws(() => execute(name, args));
    assert.equal(closes, 0, 'invalid editor operations must not reach navigation services');
    assert.deepEqual(runtime.state, beforeListing);
    execute('laplace_close_tab', { tabId: 'graph-tab' });
    assert.equal(closes, 1, 'read-only workspaces still permit tab closure');
    assert.equal(
      JSON.parse(execute('laplace_reopen_closed_tab', {}).content[0].text).reopened,
      false,
    );
    for (const [key, value] of [
      ['workspaceAccess', 'checking'],
      ['activeVaultId', 'other'],
      ['lastSyncedWorkspace', null],
      ['gitOperationActive', true],
      ['workspaceLocationSwitching', true],
      ['workspaceLocationClosing', true],
    ]) {
      const original = runtime[key];
      runtime[key] = value;
      assert.throws(() => execute('laplace_workspace', {}), /unavailable/);
      runtime[key] = original;
    }
    runtime.lifecycle.disposed = true;
    assert.throws(() => execute('laplace_workspace', {}), /unavailable/);
  } finally {
    await server.close();
  }
});

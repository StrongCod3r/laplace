import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

test('File Markdown round trips and uploads protect the original document across async work', async () => {
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { fileBlockMarkdown, parseFileMarkdown } = await server.ssrLoadModule(
      '/src/features/attachments/services/file-markdown.ts',
    );
    const { createFileBlocks } = await server.ssrLoadModule(
      '/src/features/attachments/services/file-blocks.ts',
    );
    const { registerMarkdown } = await server.ssrLoadModule(
      '/src/features/markdown/services/register.ts',
    );
    const { registerEditor } = await server.ssrLoadModule(
      '/src/features/editor/services/register.ts',
    );
    const { registerInteractions } = await server.ssrLoadModule(
      '/src/features/interactions/services/register.ts',
    );
    const runtime = {
      uid: () => 'parsed',
      INLINE_FORMAT_TYPES: new Set(),
      CODE_LANGUAGES: [],
      STORAGE_CONFIG: { indexeddb: { attachmentsDirectory: '.attachments' } },
    };
    registerMarkdown(runtime);
    registerEditor(runtime);
    registerInteractions(runtime);
    for (const original of [
      { type: 'file', src: '', fileName: '', fileLabel: '' },
      {
        type: 'file',
        src: '.attachments/asset-manual (1) [draft] 100%.pdf',
        fileName: 'manual (1) [draft] 100%.pdf',
        fileLabel: 'Project report',
      },
      { type: 'file', src: '.attachments/a.zip', fileName: 'a.zip', fileLabel: 'a.zip' },
      {
        type: 'file',
        src: '.attachments/bracket.zip',
        fileName: 'report [draft] & notes.zip',
        fileLabel: 'report [draft] & notes.zip',
      },
      {
        type: 'file',
        src: '.attachments/asset.zip',
        fileName: 'literal -->.zip',
        fileLabel: 'Download',
      },
    ]) {
      let markdown = fileBlockMarkdown(original);
      for (let round = 0; round < 3; round++) {
        const blocks = runtime.parseMarkdownBlocks(markdown, { preserveInline: true });
        assert.equal(blocks.length, 1);
        assert.equal(blocks[0].type, 'file');
        assert.equal(blocks[0].src, original.src);
        if (original.src) assert.equal(blocks[0].fileName, original.fileName);
        assert.equal(runtime.markdownForBlocks(blocks, { pages: [] }), markdown);
        markdown = runtime.markdownForBlocks(blocks, { pages: [] });
      }
    }
    for (const marker of [
      '{"version":2}',
      '{"version":1,"future":true}',
      '{"version":1,"name":123}',
      'broken',
    ]) {
      const source = `[Manual](.attachments/manual.pdf)\n<!-- laplace:file: ${marker} -->`;
      assert.equal(
        runtime
          .parseMarkdownBlocks(source, { preserveInline: true })
          .some((b) => b.type === 'file'),
        false,
      );
    }
    for (const url of [
      'https://example.com/file.pdf',
      'javascript:alert',
      '../secret',
      '.attachments/../secret',
    ]) {
      assert.equal(
        parseFileMarkdown(
          `[File](${url})`,
          '<!-- laplace:file: {"version":1} -->',
          runtime.normalizeAttachmentPath,
        ),
        null,
      );
    }
    assert.equal(
      parseFileMarkdown('[File](.attachments/f.pdf)', '', runtime.normalizeAttachmentPath),
      null,
    );

    const setup = () => {
      let next = 0;
      const block = { id: 'file', type: 'file', src: '', fileName: '', fileLabel: '' };
      const page = {
        id: 'note',
        blocks: [block, { id: 'sibling', type: 'text', text: 'Keep me' }],
      };
      const writes = [];
      const messages = [];
      let saves = 0;
      const host = {
        state: { activeEditorGroupId: 'main', pages: [page] },
        lifecycle: { disposed: false },
        activeVaultId: 'vault',
        workspaceAccess: 'writable',
        lastSyncedWorkspace: {},
        gitOperationActive: false,
        pageOperationEpoch: 0,
        workspaceLocationKey: () => 'browser',
        currentPage: () => page,
        findBlock: (id) => page.blocks.find((b) => b.id === id),
        findBlockLocation: (id) => {
          const index = page.blocks.findIndex((b) => b.id === id);
          return index < 0 ? null : { block: page.blocks[index], blocks: page.blocks, index };
        },
        queueStorageWrite: (write) => write(),
        uid: (prefix) => `${prefix}-${++next}`,
        safeFileSegment: (name) => name,
        renderBlocks: () => {},
        scheduleSave: () => saves++,
        toast: (message) => messages.push(message),
        localStorageGateway: {
          writeAttachment: async (path, blob) => {
            writes.push({ path, blob });
            return path;
          },
        },
      };
      return {
        host,
        block,
        page,
        writes,
        messages,
        saves: () => saves,
        service: createFileBlocks(host),
      };
    };
    const files = [new File(['first'], 'report.pdf'), new File(['second'], 'report.pdf')];
    const successful = setup();
    await successful.service.upload(files, 'file');
    assert.equal(successful.page.blocks.length, 3);
    assert.equal(successful.block.id, 'file');
    assert.equal(successful.page.blocks[2].text, 'Keep me');
    assert.equal(successful.writes.length, 2);
    assert.notEqual(successful.writes[0].path, successful.writes[1].path);
    assert.equal(successful.saves(), 1);

    for (const mutate of [
      (h) => (h.workspaceAccess = 'readonly'),
      (h) => (h.gitOperationActive = true),
      (h) => (h.state = { ...h.state }),
      (h) => (h.activeVaultId = 'other'),
      (h) => (h.state.activeEditorGroupId = 'other'),
      (h) => h.pageOperationEpoch++,
      (h) => (h.lifecycle.disposed = true),
      (h) => (h.findBlock('file').fileLabel = 'Changed during upload'),
    ]) {
      const pending = setup();
      let complete;
      pending.host.localStorageGateway.writeAttachment = () =>
        new Promise((resolve) => (complete = resolve));
      const upload = pending.service.upload(files, 'file');
      mutate(pending.host);
      complete('.attachments/new.pdf');
      await upload;
      assert.equal(pending.block.src, '');
      assert.equal(pending.page.blocks.length, 2);
      assert.equal(pending.saves(), 0);
    }
    const failure = setup();
    failure.host.localStorageGateway.writeAttachment = async () => {
      throw new Error('Disk full');
    };
    await failure.service.upload(files, 'file');
    assert.equal(failure.block.src, '');
    assert.equal(failure.saves(), 0);
    assert.deepEqual(failure.messages, ['Disk full']);
    const readonly = setup();
    readonly.host.workspaceAccess = 'readonly';
    await readonly.service.upload(files, 'file');
    assert.equal(readonly.writes.length, 0);
  } finally {
    await server.close();
  }
});

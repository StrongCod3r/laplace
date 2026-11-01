import { expect, test, type WebSocketRoute } from '@playwright/test';
import { webMcpTools } from '../../src/features/webmcp/services/tools';

test.use({
  launchOptions: { args: ['--enable-features=WebMCP', '--enable-blink-features=WebMCP'] },
});

interface BrowserModelContext {
  getTools(): Promise<{ name: string }[]>;
  executeTool(tool: unknown, args: unknown): Promise<string>;
  registerTool(tool: unknown): Promise<void>;
}

test.describe('native browser WebMCP', () => {
  test('real native tools and the local bridge share content, persistence, and lifecycle guards', async ({
    page,
  }) => {
    let bridge: WebSocketRoute | undefined;
    const replies: Record<string, unknown>[] = [];
    await page.routeWebSocket('ws://127.0.0.1:32998/**', (socket) => {
      if (socket.url().endsWith('/register'))
        socket.onMessage(() =>
          socket.send(JSON.stringify({ type: 'registerSuccess', token: 'native-coexistence' })),
        );
      else {
        bridge = socket;
        socket.onMessage((raw) => replies.push(JSON.parse(String(raw))));
      }
    });
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showDirectoryPicker', {
        configurable: true,
        value: async () => navigator.storage.getDirectory(),
      });
    });
    await page.goto('/');
    test.skip(
      !(await page.evaluate(
        () => !!(document as Document & { modelContext?: BrowserModelContext }).modelContext,
      )),
      'Browser does not implement document.modelContext',
    );
    const nativeTools = () =>
      page.evaluate(async () => {
        const context = (document as Document & { modelContext: BrowserModelContext }).modelContext;
        return (await context.getTools()).map((tool) => tool.name);
      });
    const nativeCall = (name: string, args: Record<string, unknown> = {}) =>
      page.evaluate(
        async ({ name, args }) => {
          const context = (document as Document & { modelContext: BrowserModelContext })
            .modelContext;
          const tool = (await context.getTools()).find((tool) => tool.name === name);
          if (!tool) throw new Error('Native tool not found');
          const result = JSON.parse(await context.executeTool(tool, args));
          return JSON.parse(result.content[0].text);
        },
        { name, args },
      );
    await expect
      .poll(async () => (await nativeTools()).filter((name) => name.startsWith('laplace_')).length)
      .toBe(webMcpTools.length);
    await page.getByRole('button', { name: 'WebMCP', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Browser WebMCP' })).toContainText(
      `Ready · ${webMcpTools.length} tools`,
    );
    const initialVault = (await nativeCall('laplace_workspace')).vaultId;
    const note = await nativeCall('laplace_create_note', {
      title: 'Native WebMCP note',
      markdown: '# Native content\n\nCreated through the browser API.\n',
    });
    expect(note.markdown).toContain('Created through the browser API.');
    await expect(page.locator('#pageTitle')).toHaveText('Native WebMCP note');
    await page
      .getByLabel('Connection token', { exact: true })
      .fill(
        Buffer.from(
          JSON.stringify({ server: 'ws://127.0.0.1:32998', token: 'coexistence-token' }),
        ).toString('base64'),
      );
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Connected');
    await expect
      .poll(() => replies.filter((message) => message.type === 'registerTool').length)
      .toBe(webMcpTools.length);
    bridge!.send(
      JSON.stringify({
        type: 'callTool',
        id: 'coexistence-append',
        tool: 'laplace_append_note',
        arguments: {
          pageId: note.pageId,
          expectedMarkdown: note.markdown,
          markdown: '## Bridge content\n\nAppended through the local bridge.\n',
        },
      }),
    );
    await expect
      .poll(() => replies.some((message) => message.id === 'coexistence-append'))
      .toBe(true);
    const read = await nativeCall('laplace_read_note', { pageId: note.pageId });
    expect(read.markdown).toContain('Appended through the local bridge.');
    await expect(
      nativeCall('laplace_replace_note', {
        pageId: note.pageId,
        expectedMarkdown: note.markdown,
        markdown: 'Stale update',
      }),
    ).rejects.toThrow();
    expect((await nativeCall('laplace_save_workspace')).saved).toBe(true);
    await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
    expect((await nativeTools()).filter((name) => name.startsWith('laplace_'))).toHaveLength(
      webMcpTools.length,
    );
    await page.getByRole('button', { name: 'WebMCP', exact: true }).click();
    await page.locator('#chooseDirectoryBtn').click();
    await expect
      .poll(async () => {
        try {
          return (await nativeCall('laplace_workspace')).vaultId;
        } catch {
          return initialVault;
        }
      })
      .not.toBe(initialVault);
    expect((await nativeCall('laplace_workspace')).noteCount).toBe(0);
    await expect(nativeCall('laplace_read_note', { pageId: note.pageId })).rejects.toThrow();
    await page.evaluate(async () => {
      const context = (document as Document & { modelContext: BrowserModelContext }).modelContext;
      await context.registerTool({
        name: 'foreign_test_tool',
        description: 'Unrelated registration retained across app remounts',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => ({ ok: true }),
      });
      const { remountWorkspace } = await import(
        /* @vite-ignore */ new URL('tests/fixtures/remount.tsx', location.href).href
      );
      await remountWorkspace();
    });
    await expect
      .poll(async () => (await nativeTools()).filter((name) => name.startsWith('laplace_')).length)
      .toBe(webMcpTools.length);
    expect(await nativeTools()).toContain('foreign_test_tool');
    expect((await nativeCall('laplace_workspace')).noteCount).toBe(0);
  });
});

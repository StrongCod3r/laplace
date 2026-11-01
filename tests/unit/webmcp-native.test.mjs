import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

test('native WebMCP binds callbacks to one vault and releases registrations on cancellation and failure', async () => {
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { webMcpTools } = await server.ssrLoadModule('/src/features/webmcp/services/tools.ts');
    const { nativeModelContext, registerNativeWebMcp } = await server.ssrLoadModule(
      '/src/features/webmcp/services/native.ts',
    );
    assert.equal(nativeModelContext({}), null);
    assert.equal(nativeModelContext({ modelContext: {} }), null);
    const tools = new Map();
    const signals = [];
    const context = {
      registerTool: async (tool, { signal }) => {
        tools.set(tool.name, tool);
        signals.push(signal);
        signal.addEventListener('abort', () => tools.delete(tool.name), { once: true });
      },
    };
    assert.equal(nativeModelContext({ modelContext: context }), context);
    const invocations = [];
    const controller = {
      invokeWebMcpTool: (...args) => {
        invocations.push(args);
        return { content: [{ type: 'text', text: '{"ok":true}' }] };
      },
    };
    const statuses = [];
    const session = registerNativeWebMcp(context, controller, 'vault-a', (status) =>
      statuses.push(status),
    );
    await session.ready;
    assert.equal(tools.size, webMcpTools.length);
    assert.deepEqual(statuses, ['ready']);
    assert.equal(tools.get('laplace_read_note').annotations.readOnlyHint, true);
    assert.equal(tools.get('laplace_list_tabs').annotations.readOnlyHint, true);
    assert.equal(tools.get('laplace_close_tab').annotations.readOnlyHint, false);
    assert.equal(tools.get('laplace_create_note').annotations.readOnlyHint, false);
    assert.equal(tools.get('laplace_read_note').annotations.untrustedContentHint, true);
    const callback = tools.get('laplace_create_note').execute;
    const args = { title: 'Native note', markdown: '# Body' };
    await callback(args);
    assert.deepEqual(invocations, [['vault-a', 'laplace_create_note', args]]);
    const cancelled = new AbortController();
    cancelled.abort();
    await assert.rejects(callback(args, { signal: cancelled.signal }), { name: 'AbortError' });
    assert.equal(invocations.length, 1);
    session.dispose();
    session.dispose();
    assert.equal(tools.size, 0);
    assert.ok(signals.every((signal) => signal.aborted));
    await assert.rejects(callback(args), { name: 'AbortError' });
    assert.equal(invocations.length, 1);
    const next = registerNativeWebMcp(context, controller, 'vault-b', () => {});
    await next.ready;
    await tools.get('laplace_workspace').execute({});
    assert.equal(invocations.at(-1)[0], 'vault-b');
    next.dispose();

    const failedStatuses = [];
    const failed = registerNativeWebMcp(
      {
        registerTool: async (tool, options) => {
          await context.registerTool(tool, options);
          if (tool.name === 'laplace_read_note') throw new Error('Registration denied');
        },
      },
      controller,
      'vault-a',
      (status) => failedStatuses.push(status),
    );
    await failed.ready;
    assert.deepEqual(failedStatuses, ['error']);
    assert.equal(tools.size, 0);

    const releases = [];
    const lateStatuses = [];
    const late = registerNativeWebMcp(
      { registerTool: () => new Promise((resolve) => releases.push(resolve)) },
      controller,
      'vault-a',
      (status) => lateStatuses.push(status),
    );
    late.dispose();
    releases.forEach((resolve) => resolve());
    await late.ready;
    assert.deepEqual(lateStatuses, [], 'retired registrations must not publish ready');
  } finally {
    await server.close();
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

test('bridge sessions survive reloads only for the same vault and host; invalid sessions are discarded', async () => {
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const previousWindow = globalThis.window,
    previousSocket = globalThis.WebSocket;
  const connections = [];
  try {
    const { webMcpTools } = await server.ssrLoadModule('/src/features/webmcp/services/tools.ts');
    const { loadBridgeSession, saveBridgeSession, BRIDGE_SESSION_KEY } = await server.ssrLoadModule(
      '/src/features/webmcp/services/bridge-session.ts',
    );
    const { WebMcpConnection, BRIDGE_IDLE_MS } = await server.ssrLoadModule(
      '/src/features/webmcp/services/connection.ts',
    );
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
    const credentials = {
      server: 'ws://localhost:4797',
      host: 'localhost_3000',
      token: 'issued-session',
      expiresAt: Date.now() + BRIDGE_IDLE_MS,
    };
    saveBridgeSession('vault', credentials, storage);
    assert.deepEqual(loadBridgeSession('vault', 'localhost_3000', storage), credentials);
    assert.equal(loadBridgeSession('different-vault', 'localhost_3000', storage), null);
    assert.equal(values.has(BRIDGE_SESSION_KEY), false);
    saveBridgeSession('vault', credentials, storage);
    assert.equal(loadBridgeSession('vault', 'different-host', storage), null);
    for (const invalid of [
      { ...credentials, expiresAt: Date.now() - 1 },
      { ...credentials, server: 'ws://example.com' },
      { ...credentials, token: 12 },
      { ...credentials, expiresAt: 'tomorrow' },
    ]) {
      saveBridgeSession('vault', invalid, storage);
      assert.equal(loadBridgeSession('vault', 'localhost_3000', storage), null);
      assert.equal(values.has(BRIDGE_SESSION_KEY), false);
    }
    values.set(BRIDGE_SESSION_KEY, 'malformed');
    assert.equal(loadBridgeSession('vault', 'localhost_3000', storage), null);
    const denied = {
      getItem() {
        throw new Error('Denied');
      },
      setItem() {
        throw new Error('Denied');
      },
      removeItem() {
        throw new Error('Denied');
      },
    };
    assert.doesNotThrow(() => saveBridgeSession('vault', credentials, denied));
    assert.equal(loadBridgeSession('vault', 'localhost_3000', denied), null);

    const sockets = [];
    class Socket {
      static OPEN = 1;
      readyState = 0;
      messages = [];
      constructor(url) {
        this.url = url;
        sockets.push(this);
      }
      send(value) {
        this.messages.push(value);
      }
      close() {
        this.readyState = 3;
      }
      open() {
        this.readyState = 1;
        this.onopen?.();
      }
    }
    globalThis.WebSocket = Socket;
    globalThis.window = { location: { host: 'localhost:3000' } };
    const remembered = [];
    const callbacks = [];
    const first = new WebMcpConnection(
      (...args) => callbacks.push(args),
      () => {},
      (value) => remembered.push(value),
    );
    connections.push(first);
    first.connect(
      btoa(JSON.stringify({ server: credentials.server, token: 'single-use-registration' })),
    );
    assert.equal(sockets[0].url, 'ws://localhost:4797/register');
    sockets[0].open();
    assert.equal(JSON.parse(atob(sockets[0].messages[0])).token, 'single-use-registration');
    sockets[0].onmessage({
      data: JSON.stringify({ type: 'registerSuccess', token: 'issued-session' }),
    });
    assert.equal(remembered.length, 0, 'only an open authorized channel may be remembered');
    sockets[1].open();
    assert.equal(remembered.at(-1).token, 'issued-session');
    assert.equal(sockets[1].messages.length, webMcpTools.length);
    first.disconnect('Disconnected', { preserveSession: true });
    assert.notEqual(remembered.at(-1), null);
    const resumed = new WebMcpConnection(
      (...args) => callbacks.push(args),
      () => {},
      (value) => remembered.push(value),
    );
    connections.push(resumed);
    resumed.resume(remembered.at(-1));
    assert.equal(sockets.length, 3);
    assert.equal(sockets[2].url, 'ws://localhost:4797/localhost_3000?token=issued-session');
    sockets[2].open();
    const lateMessage = sockets[2].onmessage;
    resumed.disconnect();
    assert.equal(remembered.at(-1), null);
    await lateMessage({
      data: JSON.stringify({
        type: 'callTool',
        id: 'late',
        tool: 'laplace_create_note',
        arguments: { title: 'Must not run' },
      }),
    });
    assert.equal(callbacks.length, 0);
    const expired = new WebMcpConnection(
      () => {},
      () => {},
    );
    connections.push(expired);
    assert.throws(() => expired.resume({ ...credentials, expiresAt: Date.now() - 1 }), /expired/);
    assert.equal(sockets.length, 3);
  } finally {
    for (const connection of connections) connection.disconnect();
    globalThis.WebSocket = previousSocket;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    await server.close();
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

test('GitHub popup accepts only the original window, service origin, and state, and cleans up', async () => {
  const server = await createServer({
    appType: 'custom',
    define: {
      'import.meta.env.VITE_GITHUB_SERVICE_URL': JSON.stringify('https://github-service.example'),
    },
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const previous = globalThis.window;
  try {
    const { authorizeGitHub } = await server.ssrLoadModule(
      '/src/features/git/services/github-auth.ts',
    );
    const fake = new EventTarget();
    let opened;
    let closed = false;
    const popup = {
      closed: false,
      close() {
        closed = true;
      },
    };
    fake.open = (url) => {
      opened = url;
      return popup;
    };
    globalThis.window = fake;
    const abort = new AbortController();
    const result = authorizeGitHub(abort.signal);
    const state = opened.searchParams.get('state');
    const send = (origin, source, nonce, token) =>
      fake.dispatchEvent(
        Object.assign(new Event('message'), {
          origin,
          source,
          data: { type: 'laplace-github-auth', state: nonce, token },
        }),
      );
    send('https://evil.example', popup, state, 'wrong-origin');
    send('https://github-service.example', {}, state, 'wrong-popup');
    send('https://github-service.example', popup, 'wrong-state', 'wrong-state');
    assert.equal(closed, false);
    send('https://github-service.example', popup, state, 'authorized');
    assert.deepEqual(await result, { username: 'x-access-token', token: 'authorized' });
    assert.equal(closed, true);
    closed = false;
    const pending = authorizeGitHub(abort.signal);
    abort.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(closed, true);
    fake.open = () => null;
    assert.throws(() => authorizeGitHub(new AbortController().signal), /Allow popups/);
  } finally {
    globalThis.window = previous;
    await server.close();
  }
});

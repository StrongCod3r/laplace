import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

test('controller disposal releases listeners, timers and frames exactly once', async () => {
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { ControllerLifecycle } = await server.ssrLoadModule(
      '/src/shared/lib/controller-lifecycle.ts',
    );
    const originalWindow = globalThis.window;
    const timers = new Map();
    let sequence = 0;
    const cancelled = [];
    globalThis.window = {
      setTimeout: (fn) => {
        const id = ++sequence;
        timers.set(id, fn);
        return id;
      },
      setInterval: (fn) => {
        const id = ++sequence;
        timers.set(id, fn);
        return id;
      },
      requestAnimationFrame: (fn) => {
        const id = ++sequence;
        timers.set(id, fn);
        return id;
      },
      clearTimeout: (id) => {
        cancelled.push(id);
        timers.delete(id);
      },
      clearInterval: (id) => {
        cancelled.push(id);
        timers.delete(id);
      },
      cancelAnimationFrame: (id) => {
        cancelled.push(id);
        timers.delete(id);
      },
    };
    try {
      const lifecycle = new ControllerLifecycle();
      const target = new EventTarget();
      let calls = 0;
      lifecycle.listen(target, 'change', () => calls++);
      target.dispatchEvent(new Event('change'));
      assert.equal(calls, 1);
      lifecycle.timeout(() => calls++, 10);
      lifecycle.interval(() => calls++, 10);
      lifecycle.frame(() => calls++);
      lifecycle.dispose();
      lifecycle.dispose();
      target.dispatchEvent(new Event('change'));
      assert.equal(calls, 1);
      assert.equal(timers.size, 0);
      assert.equal(cancelled.length, 3);
      lifecycle.listen(target, 'change', () => calls++);
      assert.equal(
        lifecycle.timeout(() => calls++),
        0,
      );
      target.dispatchEvent(new Event('change'));
      assert.equal(calls, 1);
    } finally {
      globalThis.window = originalWindow;
    }
  } finally {
    await server.close();
  }
});

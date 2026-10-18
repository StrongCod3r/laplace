import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

for (const development of [true, false]) {
  test(`GitHub uses ${development ? 'the local Vite proxy during development' : 'the configured service in production'} even when a service URL is present`, async () => {
    const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
    const server = await createServer({
      appType: 'custom',
      define: {
        'import.meta.env.DEV': JSON.stringify(development),
        'import.meta.env.VITE_GITHUB_SERVICE_URL': JSON.stringify('https://github-service.example'),
      },
      server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    try {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: { origin: 'http://localhost:3000' },
      });
      const { connectionProxy } = await server.ssrLoadModule(
        '/src/features/git/services/git-connection.ts',
      );
      const repository = 'https://github.com/owner/notes.git';
      assert.equal(
        connectionProxy(repository, ''),
        development
          ? 'http://localhost:3000/api/git-proxy'
          : 'https://github-service.example/git-proxy',
      );
      assert.equal(
        connectionProxy(repository, 'https://custom.example/'),
        'https://custom.example',
      );
    } finally {
      if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation);
      else delete globalThis.location;
      await server.close();
    }
  });
}

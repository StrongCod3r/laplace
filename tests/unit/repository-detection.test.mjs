import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

test('repository detection distinguishes missing Git, existing repositories and access failures', async () => {
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { hasGitRepository, emptyGitStatus } = await server.ssrLoadModule(
      '/src/features/git/services/repository-detection.ts',
    );
    const directory = (name) => ({
      getDirectoryHandle: async (path) => {
        assert.equal(path, '.git');
        if (name) throw Object.assign(new Error(name), { name });
        return {};
      },
    });
    assert.equal(await hasGitRepository(directory('NotFoundError')), false);
    assert.equal(await hasGitRepository(directory()), true);
    await assert.rejects(hasGitRepository(directory('NotAllowedError')), {
      name: 'NotAllowedError',
    });
    await assert.rejects(hasGitRepository(directory('TypeMismatchError')), /desktop Git/);
    assert.equal(emptyGitStatus().initialized, false);
  } finally {
    await server.close();
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

test('scoped UI classes preserve engine hooks, attributes and repeated markup', async () => {
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { withModuleClasses, withHtmlModuleClasses } = await server.ssrLoadModule(
      '/src/shared/lib/css-classes.ts',
    );
    const styles = { item: 'nv_item' };
    assert.equal(withModuleClasses(styles, 'item active item'), 'item active nv_item');
    assert.equal(
      withModuleClasses(styles, 'constructor __proto__ toString'),
      'constructor __proto__ toString',
    );
    const html =
      '<button data-class="item" class="item active" title="a &quot;b&quot;">Item</button>';
    const scoped =
      '<button data-class="item" class="item active nv_item" title="a &quot;b&quot;">Item</button>';
    assert.equal(withHtmlModuleClasses(styles, html), scoped);
    assert.equal(withHtmlModuleClasses(styles, scoped), scoped);
    assert.equal(
      withHtmlModuleClasses(styles, "<span class='item'>Text</span>"),
      "<span class='item nv_item'>Text</span>",
    );
  } finally {
    await server.close();
  }
});

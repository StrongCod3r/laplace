import { expect, test } from '@playwright/test';

test('Getting Started contains working examples of every block and preserves edits on reload', async ({
  page,
}) => {
  await page.route('https://cdn.jsdelivr.net/npm/mermaid@12/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `export default { initialize() {}, async render(id) { return { svg: '<svg id="'+id+'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100"><text x="10" y="50">Idea → Draft → Review → Publish</text></svg>' }; } };`,
    }),
  );
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toHaveText('Getting Started');
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  const editor = page.locator('#blockEditor');
  for (const type of [
    'text',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'bullet',
    'number',
    'todo',
    'quote',
    'callout',
    'divider',
    'code',
    'table',
    'image',
    'page',
    'page-link',
  ]) {
    await expect(editor.locator(`.block-row[data-type="${type}"]`).first()).toBeVisible();
  }
  await expect(editor.locator('[data-inline-math] .katex')).toBeVisible();
  await expect(editor.locator('[data-mermaid-render] svg')).toBeVisible();
  await expect(editor.locator('[data-math-preview] .katex')).toBeVisible();
  await expect(editor.locator('[data-math-preview] .math-error')).toHaveCount(0);
  await expect(editor.locator('.image-preview img')).toHaveJSProperty('naturalWidth', 640);
  await expect(editor.locator('.page-block.missing')).toHaveCount(0);
  await expect(editor.locator('[data-type="toggle"]')).toHaveCount(0);
  await expect(page.locator('[data-format-block-type="toggle"]')).toHaveCount(0);
  await editor.locator('[data-page-block-open="page_getting_started_example"]').click();
  await expect(page.locator('#pageTitle')).toHaveText('Example page');
  await expect(editor).toContainText('A paragraph inside a child page.');
  await page.locator('#breadcrumbs [data-navigation-history="-1"]').click();
  await expect(page.locator('#pageTitle')).toHaveText('Getting Started');
  await editor.locator('[data-page-link-open="page_getting_started_example"]').click();
  await expect(page.locator('#pageTitle')).toHaveText('Example page');
  await page.locator('#breadcrumbs [data-navigation-history="-1"]').click();
  await editor.locator('[data-block-id="getting_started_text"] .block-content').fill('/');
  await expect(page.locator('#slashMenu')).toBeVisible();
  await expect(page.locator('[data-slash-type="toggle"]')).toHaveCount(0);
  await editor
    .locator('[data-block-id="getting_started_text"] .block-content')
    .fill('My own example.');
  await page.evaluate(async () => {
    const { useWorkspaceStore } = await import(
      new URL('src/store/workspace.store.ts', location.href).href
    );
    await useWorkspaceStore.getState().controller.flush();
  });
  await page.reload();
  await expect(page.locator('#pageTitle')).toHaveText('Getting Started');
  await expect(editor.locator('[data-block-id="getting_started_text"] .block-content')).toHaveText(
    'My own example.',
  );
  await expect(editor.locator('[data-math-preview] .katex')).toBeVisible();
  await expect(editor.locator('.image-preview img')).toHaveJSProperty('naturalWidth', 640);
});

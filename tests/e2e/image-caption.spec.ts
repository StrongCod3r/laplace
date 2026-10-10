import { expect, test } from '@playwright/test';

test('editing an image caption persists it in Markdown and restores it after reload', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => navigator.storage.getDirectory(),
    });
  });
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="red"/></svg>';
    const writer = await (
      await root.getFileHandle('Caption.md', { create: true })
    ).createWritable();
    await writer.write(`![](data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)})\n`);
    await writer.close();
  });
  await page.locator('#chooseDirectoryBtn').click();
  await page
    .locator('#pageTree [data-action="open-page"]')
    .filter({ hasText: /^Caption$/ })
    .click();
  await page.locator('.image-preview img').hover();
  await page.locator('[data-image-caption-toggle]').click();
  const caption = 'Descripción "con comillas" & símbolos **literales**';
  await page.locator('[data-image-caption]').fill(caption);
  await page.evaluate(async () => {
    const modulePath = '/src/store/workspace.store.ts';
    const { useWorkspaceStore } = await import(modulePath);
    await useWorkspaceStore.getState().controller.flush();
  });
  const saved = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    return (await (await root.getFileHandle('Caption.md')).getFile()).text();
  });
  expect(saved).toContain('Descripción &quot;con comillas&quot; &amp; símbolos **literales**');
  await page.reload();
  await expect(page.locator('[data-image-caption]')).toHaveText(caption);
  await page.locator('.image-preview img').hover();
  await page.locator('[data-image-align]').click();
  await page.locator('[data-image-align-choice="right"]').click();
  await expect(page.locator('[data-image-caption]')).toHaveText(caption);
});

import { expect, test } from '@playwright/test';

test('middle-click opens a folder note in a new tab without starting browser autoscroll', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => navigator.storage.getDirectory(),
    });
  });
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const folder = await root.getDirectoryHandle('Docs', { create: true });
    for (const [directory, name, text] of [
      [root, 'Other.md', 'Keep the original page open.'],
      [folder, 'Docs.md', 'Folder note content.'],
    ] as const) {
      const writer = await (await directory.getFileHandle(name, { create: true })).createWritable();
      await writer.write(text);
      await writer.close();
    }
  });
  await page.locator('#chooseDirectoryBtn').click();
  await page
    .locator('.page-tree-row')
    .filter({ hasText: 'Other' })
    .locator('[data-action="open-page"]')
    .click();
  const tabs = page.locator('.editor-tab[data-tab-id]');
  const originalCount = await tabs.count();
  await page.evaluate(() => {
    window.addEventListener('mousedown', (event) => {
      if (event.button === 1)
        document.body.dataset.middleClickPrevented = String(event.defaultPrevented);
    });
  });
  await page
    .locator('.folder-tree-row[data-folder-path="Docs"] [data-action="select-folder"]')
    .click({ button: 'middle' });
  await expect(page.locator('body')).toHaveAttribute('data-middle-click-prevented', 'true');
  await expect(tabs).toHaveCount(originalCount + 1);
  await expect(page.locator('#pageTitle')).toHaveText('Docs');
  await expect(page.locator('#blockEditor')).toContainText('Folder note content.');
  await tabs.filter({ hasText: 'Other' }).click();
  await expect(page.locator('#pageTitle')).toHaveText('Other');
  await expect(page.locator('#blockEditor')).toContainText('Keep the original page open.');
});

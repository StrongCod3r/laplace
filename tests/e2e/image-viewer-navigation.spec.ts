import { expect, test } from '@playwright/test';

for (const docked of [false, true]) {
  test(`fullscreen arrows navigate the source note in the ${docked ? 'split' : 'main'} editor`, async ({
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
      const image = (name: string, color: string) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="${color}"/></svg>`;
        return `![${name}](data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)})`;
      };
      for (const [name, markdown] of [
        [
          'Images.md',
          `${image('First', 'red')}\n\nParagraph\n\n${image('Second', 'green')}\n\n${image('Third', 'blue')}\n`,
        ],
        ['Other.md', `${image('Other note', 'black')}\n`],
      ]) {
        const writer = await (await root.getFileHandle(name, { create: true })).createWritable();
        await writer.write(markdown);
        await writer.close();
      }
    });
    await page.locator('#chooseDirectoryBtn').click();
    await page
      .locator('#pageTree [data-action="open-page"]')
      .filter({ hasText: /^Images$/ })
      .click();
    if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
    const root = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
    await root.locator('.image-preview img').nth(1).dblclick();
    const viewer = page.locator('#attachmentPreview');
    const image = viewer.locator('img');
    await expect(viewer).toBeVisible();
    await expect(image).toHaveAttribute('alt', 'Second');
    await expect(image).toHaveJSProperty('naturalWidth', 120);
    await image.hover();
    await page.mouse.wheel(0, -100);
    await expect(viewer.locator('[data-image-viewer-zoom-value]')).toHaveText('125%');
    await viewer.locator('[data-image-viewer-fit]').click();
    await viewer.locator('[data-image-viewer-zoom="in"]').click();
    await expect(viewer.locator('[data-image-viewer-zoom-value]')).toHaveText('125%');
    await page.keyboard.press('ArrowRight');
    await expect(image).toHaveAttribute('alt', 'Third');
    await expect(viewer.locator('[data-image-viewer-zoom-value]')).toHaveText('100%');
    await page.keyboard.press('ArrowDown');
    await expect(image).toHaveAttribute('alt', 'Third');
    await page.keyboard.press('ArrowLeft');
    await expect(image).toHaveAttribute('alt', 'Second');
    await page.keyboard.press('ArrowUp');
    await expect(image).toHaveAttribute('alt', 'First');
    await page.keyboard.press('ArrowLeft');
    await expect(image).toHaveAttribute('alt', 'First');
    await page.keyboard.press('ArrowDown');
    await expect(image).toHaveAttribute('alt', 'Second');
    await page.keyboard.press('Escape');
    await expect(viewer).toBeHidden();
    await page
      .locator('#pageTree [data-action="open-page"]')
      .filter({ hasText: /^Other$/ })
      .click();
    await root.locator('.image-preview img').dblclick();
    await page.keyboard.press('ArrowRight');
    await expect(image).toHaveAttribute('alt', 'Other note');
    await page.keyboard.press('ArrowLeft');
    await expect(image).toHaveAttribute('alt', 'Other note');
  });
}

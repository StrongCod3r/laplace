import { expect, test } from '@playwright/test';

test('image preview blocks wheel scrolling of the gallery and releases it on close', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 600 });
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
    const folder = await root.getDirectoryHandle('.attachments', { create: true });
    for (let index = 0; index < 24; index++) {
      const writer = await (
        await folder.getFileHandle(`image-${index}.svg`, { create: true })
      ).createWritable();
      await writer.write(
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="red"/></svg>',
      );
      await writer.close();
    }
  });
  await page.locator('#chooseDirectoryBtn').click();
  await page.getByRole('button', { name: 'Attachments', exact: true }).click();
  const content = page.locator('#attachmentsView .attachments-gallery-content');
  const thumbnails = content.locator('[data-attachment-preview]');
  await expect(thumbnails).toHaveCount(24);
  await thumbnails.first().click();
  const preview = page.locator('#attachmentPreview');
  await expect(preview).toBeVisible();
  await expect(preview.locator('img')).toHaveJSProperty('naturalWidth', 120);
  const before = await content.evaluate((el) => el.scrollTop);
  for (const target of [preview.locator('img'), preview.locator('header'), preview]) {
    await target.hover({ position: { x: 5, y: 5 } });
    await page.mouse.wheel(0, 600);
    // Allow compositor scrolling to settle before checking the background position.
    await page.waitForTimeout(150);
    expect(await content.evaluate((el) => el.scrollTop)).toBe(before);
  }
  expect(
    await preview.evaluate((el) => {
      const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 });
      el.dispatchEvent(wheel);
      return wheel.defaultPrevented;
    }),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(preview).toBeHidden();
  await thumbnails.first().hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => content.evaluate((el) => el.scrollTop)).toBeGreaterThan(before);
});

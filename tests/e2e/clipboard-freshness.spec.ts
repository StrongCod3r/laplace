import { expect, test, type Page } from '@playwright/test';

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="red"/></svg>';

async function copyImage(page: Page) {
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  await page.locator('#newPageBtn').click();
  await page.locator('#pageTitle').fill('Clipboard source');
  await page
    .locator('#blockEditor .block-content')
    .first()
    .evaluate((content, source) => {
      const data = new DataTransfer();
      data.setData('text/plain', source);
      content.dispatchEvent(
        new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: data,
        }),
      );
    }, svg);
  const image = page.locator('#blockEditor .image-preview img');
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBe(120);
  await page
    .locator('#blockEditor [data-image-caption-toggle]')
    .evaluate((button: HTMLButtonElement) => button.click());
  await page.locator('#blockEditor [data-image-caption]').fill('Copied caption');
  await image.click();
  await expect(page.locator('.image-block-selected')).toBeFocused();
  await page.keyboard.press('Control+c');
}

test('the latest copied text wins over an older image across pages and undo/redo', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await copyImage(page);
  await page.locator('#newPageBtn').click();
  await page.locator('#pageTitle').fill('Text source');
  const text = page.locator('#blockEditor .block-content').first();
  await text.fill('Latest copied text');
  await text.press('Control+a');
  await text.press('Control+c');
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('Latest copied text');
  await page.locator('#newPageBtn').click();
  await page.locator('#pageTitle').fill('Paste destination');
  const destination = page.locator('#blockEditor .block-content').first();
  await destination.click();
  await destination.press('Control+v');
  await expect(destination).toHaveText('Latest copied text');
  await expect(page.locator('#blockEditor .image-block')).toHaveCount(0);
  await destination.press('Control+z');
  await expect(destination).toHaveText('');
  await destination.press('Control+Shift+z');
  await expect(destination).toHaveText('Latest copied text');
  await page.evaluate(() => navigator.clipboard.writeText('Newest external text'));
  await destination.click();
  await destination.press('Control+a');
  await destination.press('Control+v');
  await expect(destination).toHaveText('Newest external text');
  await expect(page.locator('#blockEditor .image-block')).toHaveCount(0);
});

test('an image can still be pasted repeatedly across pages with its presentation metadata', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await copyImage(page);
  const source = await page.locator('#blockEditor .image-preview img').getAttribute('src');
  await page.locator('#newPageBtn').click();
  await page.locator('#pageTitle').fill('Image destination');
  const content = page.locator('#blockEditor .block-content').first();
  await content.click();
  await content.press('Control+v');
  await expect(page.locator('#blockEditor .image-block')).toHaveCount(1);
  await expect(page.locator('#blockEditor .image-preview img')).toHaveAttribute('src', source!);
  await expect(page.locator('#blockEditor [data-image-caption]')).toHaveText('Copied caption');
  await content.click();
  await content.press('Control+v');
  await expect(page.locator('#blockEditor .image-block')).toHaveCount(2);
});

test('a newly copied external image replaces the earlier internal image', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await copyImage(page);
  await page.locator('#newPageBtn').click();
  const replacement = svg.replace('width="120"', 'width="90"').replace('fill="red"', 'fill="blue"');
  await page.evaluate((source) => navigator.clipboard.writeText(source), replacement);
  const content = page.locator('#blockEditor .block-content').first();
  await content.click();
  await content.press('Control+v');
  const image = page.locator('#blockEditor .image-preview img');
  await expect(page.locator('#blockEditor .image-block')).toHaveCount(1);
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBe(90);
});

test('gallery image copying uses the current system clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await copyImage(page);
  await page.locator('[data-ribbon-action="attachments"]').click();
  await expect(page.locator('#attachmentsView')).toBeVisible();
  await page.locator('[data-attachment-copy]').first().click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/^!\[/);
  await page.locator('#newPageBtn').click();
  const content = page.locator('#blockEditor .block-content').first();
  await content.click();
  await content.press('Control+v');
  const image = page.locator('#blockEditor .image-preview img');
  await expect(page.locator('#blockEditor .image-block')).toHaveCount(1);
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBe(120);
  await page.evaluate(() => navigator.clipboard.writeText('Text after gallery copy'));
  await page.locator('#newPageBtn').click();
  await content.click();
  await content.press('Control+v');
  await expect(content).toHaveText('Text after gallery copy');
  await expect(page.locator('#blockEditor .image-block')).toHaveCount(0);
});

import { expect, test } from '@playwright/test';

for (const mode of ['native', 'drag'] as const) {
  test(`the formatting toolbar styles every selected block (${mode})`, async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
    await page.locator('#newPageBtn').click();
    const editor = page.locator('#blockEditor');
    await editor
      .locator('.block-content')
      .first()
      .evaluate((content) => {
        const data = new DataTransfer();
        data.setData('text/html', '<p>First line</p><p>Middle line</p><p>Last line</p>');
        content.dispatchEvent(
          new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
        );
      });
    const contents = editor.locator('.block-content');
    await expect(contents).toHaveCount(3);
    if (mode === 'native') {
      await editor.evaluate((editor) => {
        const contents = editor.querySelectorAll('.block-content');
        (contents[0] as HTMLElement).focus();
        const range = document.createRange();
        range.setStart(contents[0].firstChild!, 6);
        range.setEnd(contents[2].firstChild!, 4);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
      });
    } else {
      const first = await contents.nth(0).boundingBox();
      const last = await contents.nth(2).boundingBox();
      await page.mouse.move(first!.x + 1, first!.y + first!.height / 2);
      await page.mouse.down();
      await page.mouse.move(last!.x + 150, last!.y + last!.height / 2, { steps: 12 });
      await page.mouse.up();
    }
    const toolbar = page.locator('#textFormatToolbar');
    await expect(toolbar).toBeVisible();
    await toolbar.locator('[data-format-inline="bold"]').click();
    const expected =
      mode === 'native'
        ? ['line', 'Middle line', 'Last']
        : ['First line', 'Middle line', 'Last line'];
    for (let i = 0; i < 3; i++)
      await expect(contents.nth(i).locator('[data-inline-format="bold"]')).toHaveText(expected[i]);
    await expect(toolbar).toBeVisible();
    await toolbar.locator('[data-format-inline="italic"]').click();
    for (let i = 0; i < 3; i++)
      await expect(contents.nth(i).locator('[data-inline-format="italic"]')).toHaveText(
        expected[i],
      );
    await toolbar.locator('[data-format-inline="bold"]').click();
    await expect(editor.locator('[data-inline-format="bold"]')).toHaveCount(0);
    await toolbar.locator('[data-format-color-toggle]').click();
    await toolbar.locator('[data-format-color="red"]').click();
    for (let i = 0; i < 3; i++) {
      await expect(contents.nth(i).locator('[data-inline-format="color"]')).toHaveText(expected[i]);
      await expect(contents.nth(i).locator('[data-inline-format="color"]')).toHaveAttribute(
        'data-inline-value',
        'red',
      );
    }
    await toolbar.locator('[data-format-type-toggle]').click();
    await toolbar.locator('[data-format-block-type="h2"]').click();
    await expect(editor.locator('[data-type="h2"]')).toHaveCount(3);
    await expect(contents).toHaveText(['First line', 'Middle line', 'Last line']);
  });
}

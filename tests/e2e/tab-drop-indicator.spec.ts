import { expect, test } from '@playwright/test';

for (const docked of [false, true]) {
  test(`tab insertion highlights the drop edge ${docked ? 'across split panes' : 'in the main strip'}`, async ({
    page,
  }) => {
    await page.goto('/laplace/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    for (const name of ['A note', 'B note', 'C note']) {
      await page.locator('#newPageBtn').click();
      await page.locator('#pageTitle').fill(name);
      await page.locator('#blockEditor .block-content').first().click();
    }
    if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
    const tabs = page.locator(docked ? '.dock-tab' : '.editor-tab');
    const source = tabs.filter({ hasText: 'A note' });
    const target = tabs.filter({ hasText: 'C note' });
    await expect(target).toHaveClass(/active/);
    const transfer = await page.evaluateHandle(() => new DataTransfer());
    for (const after of [true, false]) {
      await source.dispatchEvent('dragstart', { dataTransfer: transfer });
      const rect = (await target.boundingBox())!;
      await target.dispatchEvent('dragover', {
        dataTransfer: transfer,
        clientX: rect.x + (after ? rect.width - 4 : 4),
        clientY: rect.y + rect.height / 2,
      });
      await expect(target).toHaveClass(after ? /tab-drop-after/ : /tab-drop-before/);
      const indicator = await target.evaluate((element) => {
        const style = getComputedStyle(element, '::after');
        return {
          width: parseFloat(style.width),
          height: parseFloat(style.height),
          left: style.left,
          right: style.right,
        };
      });
      expect(indicator.width).toBe(3);
      expect(indicator.height).toBeGreaterThan(20);
      expect(after ? indicator.right : indicator.left).toBe('0px');
      await expect(page.locator('.dock-drop-center')).toHaveCount(0);
      if (after) {
        await source.dispatchEvent('dragend');
        await expect(page.locator('.tab-drop-after,.tab-drop-before')).toHaveCount(0);
      } else {
        await target.dispatchEvent('drop', {
          dataTransfer: transfer,
          clientX: rect.x + 4,
          clientY: rect.y + rect.height / 2,
        });
      }
    }
    await expect(page.locator('.tab-drop-after,.tab-drop-before')).toHaveCount(0);
    const order = await target
      .locator('..')
      .locator(docked ? '.dock-tab' : '.editor-tab')
      .allTextContents();
    expect(order.findIndex((text) => text.includes('A note'))).toBe(
      order.findIndex((text) => text.includes('C note')) - 1,
    );
  });
}

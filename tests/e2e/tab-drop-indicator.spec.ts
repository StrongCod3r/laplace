import { expect, test } from '@playwright/test';

for (const docked of [false, true]) {
  test(`split preview fills the available half after scrolling ${docked ? 'in a nested pane' : 'in the main editor'}`, async ({
    page,
  }) => {
    await page.goto('/laplace/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    for (const name of ['Source note', 'Target note']) {
      await page.locator('#newPageBtn').click();
      await page.locator('#pageTitle').fill(name);
      await page.locator('#blockEditor .block-content').first().click();
    }
    if (docked) {
      await page.keyboard.press('Control+Alt+ArrowRight');
      await page.keyboard.press('Control+Alt+ArrowDown');
      await expect(page.locator('.dock-pane')).toHaveCount(3);
    }
    const pane = docked ? page.locator('.dock-pane').last() : page.locator('#editorView');
    const scroller = docked ? pane.locator('.dock-scroll') : pane;
    await scroller.evaluate((element) => {
      (element.querySelector('.page') as HTMLElement).style.minHeight = '2400px';
      element.scrollTop = 400;
    });
    expect(await scroller.evaluate((element) => element.scrollTop)).toBe(400);
    const source = page
      .locator(docked ? '.dock-tab' : '.editor-tab')
      .filter({ hasText: 'Source note' });
    const transfer = await page.evaluateHandle(() => new DataTransfer());
    const bounds = (await pane.boundingBox())!;
    for (const edge of ['left', 'right', 'top', 'bottom']) {
      await source.dispatchEvent('dragstart', { dataTransfer: transfer });
      await scroller.dispatchEvent('dragover', {
        dataTransfer: transfer,
        clientX:
          bounds.x + (edge === 'left' ? 4 : edge === 'right' ? bounds.width - 4 : bounds.width / 2),
        clientY:
          bounds.y +
          (edge === 'top' ? 4 : edge === 'bottom' ? bounds.height - 4 : bounds.height / 2),
      });
      await expect(pane).toHaveClass(new RegExp(`dock-drop-${edge}`));
      const preview = await pane.evaluate((element) => {
        const style = getComputedStyle(element, '::after');
        const rect = element.getBoundingClientRect();
        const fixed = style.position === 'fixed';
        return {
          x: parseFloat(style.left) + (fixed ? 0 : rect.left - element.scrollLeft),
          y: parseFloat(style.top) + (fixed ? 0 : rect.top - element.scrollTop),
          width: parseFloat(style.width),
          height: parseFloat(style.height),
          availableWidth: element.clientWidth,
          availableHeight: element.clientHeight,
        };
      });
      const horizontal = edge === 'left' || edge === 'right';
      expect(preview.x).toBeCloseTo(
        bounds.x + (edge === 'right' ? preview.availableWidth / 2 + 3 : 0),
        0,
      );
      expect(preview.y).toBeCloseTo(
        bounds.y + (edge === 'bottom' ? preview.availableHeight / 2 + 3 : 0),
        0,
      );
      expect(preview.width).toBeCloseTo(
        horizontal ? preview.availableWidth / 2 - 3 : preview.availableWidth,
        0,
      );
      expect(preview.height).toBeCloseTo(
        horizontal ? preview.availableHeight : preview.availableHeight / 2 - 3,
        0,
      );
      await source.dispatchEvent('dragend');
      await expect(
        page.locator('.dock-drop-left,.dock-drop-right,.dock-drop-top,.dock-drop-bottom'),
      ).toHaveCount(0);
    }
  });
}

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

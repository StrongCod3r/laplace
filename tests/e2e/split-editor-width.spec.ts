import { expect, test } from '@playwright/test';

for (const dark of [false, true]) {
  test(`narrow panes wrap notes, scroll tables and retain gutters (${dark ? 'dark' : 'light'})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await page.locator('#newPageBtn').click();
    await page.evaluate((dark) => {
      document.body.classList.toggle('dark', dark);
      const markdown = [
        'A paragraph with enough words to wrap naturally in a narrow editor pane. '.repeat(3),
        'https://example.com/' + 'long-path-segment'.repeat(18),
        '> A quote that should wrap within the page instead of widening the editor. '.repeat(2),
        '| Alpha | Beta | Gamma | Delta | Epsilon | Zeta |\n| --- | --- | --- | --- | --- | --- |\n| One | Two | Three | Four | Five | Six |',
      ].join('\n\n');
      const data = new DataTransfer();
      data.setData('text/markdown', markdown);
      const content = document.querySelector<HTMLElement>('#blockEditor .block-content')!;
      content.focus();
      content.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
      );
    }, dark);
    await expect(page.locator('#blockEditor .simple-table')).toBeVisible();
    await page.locator('#pageTitle').fill('A long page title that wraps within a narrow editor');
    await page.setViewportSize({ width: 600, height: 900 });
    await expect
      .poll(() => page.locator('#editorView').evaluate((el) => el.scrollWidth - el.clientWidth))
      .toBeLessThanOrEqual(1);
    const mainParagraph = page.locator('#blockEditor .block-content').first();
    await mainParagraph.hover();
    const mainAdd = page.locator('#blockEditor [data-block-action="add"]').first();
    const mainAddRect = (await mainAdd.boundingBox())!;
    expect(mainAddRect.x).toBeGreaterThanOrEqual(
      (await page.locator('#editorView').boundingBox())!.x,
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.keyboard.press('Control+Alt+ArrowRight');
    await expect(page.locator('.dock-pane')).toHaveCount(2);
    const panes = page.locator('.dock-pane');
    for (const pane of await panes.all()) {
      const scroller = pane.locator('.dock-scroll');
      expect(await scroller.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(
        1,
      );
      const paragraph = pane.locator('.block-content').first();
      expect(await paragraph.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(
        50,
      );
      const table = pane.locator('.simple-table-scroll');
      expect(await table.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(100);
      await table.evaluate((el) => {
        el.scrollLeft = 100;
      });
      expect(await table.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
      await paragraph.hover();
      const add = pane.locator('[data-block-action="add"]').first();
      await expect(add).toBeVisible();
      expect(
        await add.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          const pane = el.closest('.dock-pane')!.getBoundingClientRect();
          return (
            rect.left >= pane.left &&
            rect.right <= pane.right &&
            el.contains(
              document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2),
            )
          );
        }),
      ).toBe(true);
    }
    const divider = page.locator('[data-dock-divider]');
    const rect = (await divider.boundingBox())!;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + 100);
    await page.mouse.down();
    await page.mouse.move(rect.x - 500, rect.y + 100, { steps: 8 });
    await page.mouse.up();
    for (const pane of await panes.all()) {
      expect((await pane.boundingBox())!.width).toBeGreaterThanOrEqual(280);
      expect(
        await pane.locator('.dock-scroll').evaluate((el) => el.scrollWidth - el.clientWidth),
      ).toBeLessThanOrEqual(1);
    }
    await page.keyboard.press('Control+Alt+ArrowRight');
    await expect(panes).toHaveCount(3);
    await page.setViewportSize({ width: 600, height: 900 });
    for (const pane of await panes.all()) {
      expect((await pane.boundingBox())!.width).toBeGreaterThanOrEqual(280);
      expect(
        await pane.locator('.dock-scroll').evaluate((el) => el.scrollWidth - el.clientWidth),
      ).toBeLessThanOrEqual(1);
    }
    const dock = page.locator('#editorDock');
    expect(await dock.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(100);
    await dock.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    expect(await dock.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  });
}

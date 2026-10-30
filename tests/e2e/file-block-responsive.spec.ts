import { expect, test } from '@playwright/test';

for (const docked of [false, true]) {
  test(`File cards fit narrow ${docked ? 'split panes' : 'windows'}`, async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await page.locator('#newPageBtn').click();
    await page
      .locator('#blockEditor .block-content')
      .first()
      .evaluate((element) => {
        const data = new DataTransfer();
        data.setData(
          'text/markdown',
          '[An extremely long filename with spaces and many details about the project.zip](.attachments/report.zip)\n<!-- laplace:file: {"version":1} -->\n[File]()\n<!-- laplace:file: {"version":1} -->\nFollowing paragraph',
        );
        (element as HTMLElement).focus();
        element.dispatchEvent(
          new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
        );
      });
    if (docked) {
      await page
        .locator('.editor-tab')
        .filter({ hasText: 'Getting Started' })
        .locator('[data-tab-close]')
        .click();
      await page.keyboard.press('Control+Alt+ArrowRight');
    }
    await page.keyboard.press('Control+Alt+L');
    await page.keyboard.press('Control+Alt+R');
    await page.setViewportSize({ width: docked ? 720 : 360, height: 800 });
    const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
    const cards = editor.locator('[data-file-card]');
    await expect(cards).toHaveCount(2);
    for (const card of await cards.all()) {
      const geometry = await card.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const copy = element.querySelector('.file-copy')!.getBoundingClientRect();
        const button = element.querySelector(':scope > button')!.getBoundingClientRect();
        return {
          width: rect.width,
          overflow: element.scrollWidth - element.clientWidth,
          fits: [...element.children]
            .filter((child) => !(child as HTMLElement).hidden)
            .every((child) => {
              const box = child.getBoundingClientRect();
              return box.left >= rect.left && box.right <= rect.right;
            }),
          buttonBelow: button.top >= copy.bottom,
        };
      });
      expect(geometry.width).toBeLessThanOrEqual(360);
      expect(geometry.overflow).toBeLessThanOrEqual(1);
      expect(geometry.fits).toBe(true);
      expect(geometry.buttonBelow).toBe(true);
    }
    const menu = editor.locator('details.file-menu');
    await menu.locator('summary').click();
    const cardBox = await cards.first().boundingBox();
    const menuBox = await menu.locator('.file-menu-body').boundingBox();
    expect(menuBox!.x).toBeGreaterThanOrEqual(cardBox!.x);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
    await menu.getByRole('textbox', { name: 'File display name' }).fill('A shorter name');
    await menu.getByRole('button', { name: 'Save name' }).click();
    await expect(cards.first().locator('.file-name')).toHaveText('A shorter name');
    await page.screenshot({ path: testInfo.outputPath('file-narrow.png') });
  });
}

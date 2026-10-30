import { expect, test } from '@playwright/test';

for (const docked of [false, true]) {
  test(`slash, gutter and File menus close on page scroll in the ${docked ? 'split' : 'main'} editor`, async ({
    page,
  }) => {
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
          '[Report](.attachments/report.pdf)\n<!-- laplace:file: {"version":1} -->\n' +
            Array.from({ length: 60 }, (_, index) => `Paragraph ${index}`).join('\n'),
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
    const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
    const content = editor.locator('.block-content').first();
    await content.fill('');
    await content.pressSequentially('/');
    const menu = page.locator('#slashMenu');
    await expect(menu).toBeVisible();
    await page.locator('#slashResults').evaluate((element) => {
      element.scrollTop = 100;
    });
    await expect(page.locator('#slashResults')).toHaveJSProperty('scrollTop', 100);
    await expect(menu).toBeVisible();
    const scroller = page.locator(docked ? '.dock-pane.active .dock-scroll' : '#editorView');
    await scroller.evaluate((element) => {
      element.scrollTop += 100;
    });
    await expect(menu).toBeHidden();
    await expect(content).toHaveText('/');
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
    });
    await content.locator('..').locator('[data-block-action="drag"]').click();
    await expect(page.locator('#blockMenu')).toBeVisible();
    await scroller.evaluate((element) => {
      element.scrollTop += 100;
    });
    await expect(page.locator('#blockMenu')).toBeHidden();
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
    });
    const fileMenu = editor.locator('details.file-menu');
    await fileMenu.locator('summary').click();
    await expect(fileMenu).toHaveAttribute('open', '');
    await scroller.evaluate((element) => {
      element.scrollTop += 100;
    });
    await expect(fileMenu).not.toHaveAttribute('open');
  });
}

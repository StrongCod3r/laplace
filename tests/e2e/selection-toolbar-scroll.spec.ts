import { expect, test } from '@playwright/test';

for (const docked of [false, true]) {
  test(`selection toolbar follows visible text and hides outside ${docked ? 'a docked' : 'the main'} page viewport`, async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
    await page.locator('#newPageBtn').click();
    if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
    const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
    await editor
      .locator('.block-content')
      .first()
      .evaluate((content) => {
        const data = new DataTransfer();
        data.setData(
          'text/html',
          Array.from({ length: 60 }, (_, i) => `<p>Selectable paragraph ${i}</p>`).join(''),
        );
        content.dispatchEvent(
          new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
        );
      });
    const content = editor.locator('.block-content').nth(12);
    await content.evaluate((content: HTMLElement) => {
      content.scrollIntoView({ block: 'center' });
      content.focus({ preventScroll: true });
      const range = document.createRange();
      range.selectNodeContents(content);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
    });
    const toolbar = page.locator('#textFormatToolbar');
    await expect(toolbar).toBeVisible();
    const scroller = page.locator(docked ? '.dock-pane.active .dock-scroll' : '#editorView');
    const initialScroll = await scroller.evaluate((el) => el.scrollTop);
    const top = await toolbar.evaluate((el) => el.getBoundingClientRect().top);
    await scroller.evaluate((el) => {
      el.scrollTop += 30;
    });
    await expect
      .poll(() => toolbar.evaluate((el) => el.getBoundingClientRect().top))
      .toBe(top - 30);
    await expect(toolbar).toBeVisible();
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(toolbar).toBeHidden();
    await scroller.evaluate((el, scroll) => {
      el.scrollTop = scroll;
    }, initialScroll);
    await expect(toolbar).toBeVisible();
    await expect.poll(() => toolbar.evaluate((el) => el.getBoundingClientRect().top)).toBe(top);
    await toolbar.locator('[data-format-inline="bold"]').click();
    await expect(content.locator('[data-inline-format="bold"]')).toHaveText(
      'Selectable paragraph 12',
    );
  });
}

import { expect, test } from '@playwright/test';

for (const docked of [false, true]) {
  for (const table of [false, true]) {
    test(`slash inserts an inline equation inside a ${table ? 'table cell' : 'paragraph'} in the ${docked ? 'split' : 'main'} editor`, async ({
      page,
    }) => {
      await page.goto('/');
      await expect(page.locator('#pageTitle')).toBeVisible();
      await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
      await page.locator('#newPageBtn').click();
      await page.evaluate((isTable) => {
        const markdown = isTable
          ? '| Head | Other |\n| --- | --- |\n| Before  after | Neighbor |'
          : 'Before  after\nSibling';
        const data = new DataTransfer();
        data.setData('text/markdown', markdown);
        const content = document.querySelector<HTMLElement>('#blockEditor .block-content')!;
        content.focus();
        content.dispatchEvent(
          new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
        );
      }, table);
      if (docked) {
        await page
          .locator('.editor-tab')
          .filter({ hasText: 'Getting Started' })
          .locator('[data-tab-close]')
          .click();
        await page.keyboard.press('Control+Alt+ArrowRight');
      }
      const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
      const content = table
        ? editor.locator('[data-table-cell="1:0"]')
        : editor.locator('.block-content').first();
      const placeCaret = async () =>
        content.evaluate((element: HTMLElement) => {
          element.focus();
          const range = document.createRange();
          range.setStart(element.firstChild!, 7);
          range.collapse(true);
          window.getSelection()!.removeAllRanges();
          window.getSelection()!.addRange(range);
        });
      await placeCaret();
      await page.keyboard.type('/');
      const choice = page.locator('[data-slash-type="inline-equation"]');
      await expect(choice).toBeVisible();
      await expect(choice.locator('svg.lucide-radical')).toHaveCount(1);
      await expect(page.locator('#slashResults [data-slash-type]')).toHaveCount(1);
      await page.keyboard.type('equation');
      await page.keyboard.press('Enter');
      const input = page.locator('[data-equation-input]');
      await expect(input).toBeFocused();
      await input.fill('x^2');
      await input.press('Escape');
      await expect(content).toHaveText('Before /equation after');
      // Returning to the command and typing a character refreshes its caret range.
      await content.evaluate((element: HTMLElement) => {
        element.focus();
        const range = document.createRange();
        range.setStart(element.firstChild!, 'Before /equation'.length);
        range.collapse(true);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
      });
      await page.keyboard.press('Backspace');
      await page.keyboard.type('n');
      await choice.click();
      await input.fill('x^2');
      await input.press('Enter');
      await expect(content).toHaveText('Before $x^2$ after', { useInnerText: true });
      await expect(content.locator('[data-inline-math] .katex')).toBeVisible();
      if (table) await expect(editor.locator('[data-table-cell="1:1"]')).toHaveText('Neighbor');
      else await expect(editor.locator('.block-content').last()).toHaveText('Sibling');
      await content.press('Control+z');
      await expect(content).toHaveText('Before /equation after');
      await content.press('Control+Shift+z');
      await expect(content).toHaveText('Before $x^2$ after', { useInnerText: true });
    });
  }
}

test('slashes inside URLs, file paths and inline code do not open equation commands', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.locator('#newPageBtn').click();
  const content = page.locator('#blockEditor .block-content').first();
  await content.fill('https://example.com/equation');
  await expect(page.locator('#slashMenu')).toBeHidden();
  await content.fill('folder/equation');
  await expect(page.locator('#slashMenu')).toBeHidden();
  await content.fill('`code`');
  const code = content.locator('[data-inline-format="code"]');
  await expect(code).toBeVisible();
  await code.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  });
  await page.keyboard.type(' /equation');
  await expect(page.locator('#slashMenu')).toBeHidden();
});

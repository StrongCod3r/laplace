import { expect, test, type Page } from '@playwright/test';

async function openMath(page: Page, markdown: string) {
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  await page.locator('#newPageBtn').click();
  await page.evaluate((source) => {
    const content = document.querySelector<HTMLElement>('#blockEditor .block-content')!;
    const data = new DataTransfer();
    data.setData('text/markdown', source);
    content.focus();
    content.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
    );
  }, markdown);
}

for (const docked of [false, true]) {
  test(`native copy exports only LaTeX and pastes without duplication in the ${docked ? 'split' : 'main'} editor`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const original = String.raw`Before $\frac{x}{2}$ and \(y^2\) after`;
    await openMath(page, original);
    if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
    const editor = docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor';
    const content = page.locator(`${editor} .block-content`).first();
    await content.evaluate((element: HTMLElement) => {
      element.focus();
      const range = document.createRange();
      range.selectNodeContents(element);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
    });
    await expect(content.locator('.katex')).toHaveCount(2);
    await expect(content.locator('.katex').first()).toBeVisible();
    await page.keyboard.press('Control+c');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(original);
    const html = await page.evaluate(async () => {
      for (const item of await navigator.clipboard.read()) {
        if (item.types.includes('text/html')) return (await item.getType('text/html')).text();
      }
      return '';
    });
    expect(html).toContain(String.raw`$\frac{x}{2}$`);
    expect(html).not.toContain('katex');
    expect(html).not.toContain('<math');
    await content
      .locator('[data-inline-math]')
      .first()
      .evaluate((host) => {
        const range = document.createRange();
        range.selectNodeContents(host);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
      });
    await page.keyboard.press('Control+c');
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(String.raw`$\frac{x}{2}$`);
    await content.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
    });
    await page.keyboard.press('Control+c');
    await page.locator('#newPageBtn').click();
    const destination = page.locator(`${editor} .block-content`).first();
    await destination.click();
    await page.keyboard.press('Control+v');
    await expect(destination).toHaveText(original, { useInnerText: true });
    await expect(destination.locator('[data-inline-math]')).toHaveCount(2);
  });
}

test('copying a native selection across paragraphs preserves source, breaks and neighboring rich text', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openMath(page, 'First **$x^2$** and [link](https://example.com)\nSecond $y^2$ end');
  const contents = page.locator('#blockEditor .block-content');
  await expect(contents).toHaveCount(2);
  await page.locator('#blockEditor').evaluate((editor) => {
    const contents = editor.querySelectorAll<HTMLElement>('.block-content');
    contents[0].focus();
    const range = document.createRange();
    range.setStart(contents[0].firstChild!, 0);
    range.setEnd(contents[1], contents[1].childNodes.length);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  });
  await page.keyboard.press('Control+c');
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('First $x^2$ and link\nSecond $y^2$ end');
  const html = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    return (await items[0].getType('text/html')).text();
  });
  expect(html).toContain('<strong');
  expect(html).toContain('https://example.com/');
  expect(html).not.toContain('katex');
});

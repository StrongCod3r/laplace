import { expect, test, type Locator } from '@playwright/test';

async function caretInsideLine(content: Locator, word: string) {
  await content.focus();
  await content.evaluate((element, word) => {
    let offset = element.textContent!.indexOf(word) + 2;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (offset > node.textContent!.length) {
        offset -= node.textContent!.length;
        continue;
      }
      const range = document.createRange();
      range.setStart(node, offset);
      range.collapse(true);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      break;
    }
  }, word);
}

for (const docked of [false, true]) {
  test(`quote indentation starts at the caret line in ${docked ? 'a split pane' : 'the main editor'}`, async ({
    page,
  }) => {
    await page.goto('/laplace/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await page.locator('#newPageBtn').click();
    await page
      .locator('#blockEditor .block-content')
      .first()
      .evaluate((element) => {
        element.focus();
        const clipboard = new DataTransfer();
        clipboard.setData(
          'text/markdown',
          '> Parent **bold**\n>\n> Child [link](https://example.com)\n> Tail *italic*',
        );
        element.dispatchEvent(
          new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: clipboard,
          }),
        );
      });
    if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
    const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
    const quotes = editor.locator('[data-type="quote"]');
    await expect(quotes).toHaveCount(1);
    await caretInsideLine(quotes.first().locator('.block-content'), 'Child');
    await page.keyboard.press('Tab');
    const verify = async () => {
      await expect(quotes).toHaveCount(2);
      await expect(quotes.first()).toHaveAttribute('data-quote-depth', '1');
      await expect(quotes.last()).toHaveAttribute('data-quote-depth', '2');
      await expect(quotes.first().locator('.block-content')).toHaveText('Parent bold\n');
      await expect(quotes.first().locator('strong')).toHaveText('bold');
      await expect(quotes.last().locator('.block-content')).toHaveText('Child link\nTail italic');
      await expect(quotes.last().locator('a')).toHaveText('link');
      await expect(quotes.last().locator('em')).toHaveText('italic');
    };
    await verify();
    const caret = await quotes
      .last()
      .locator('.block-content')
      .evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection()!;
        range.setEnd(selection.anchorNode!, selection.anchorOffset);
        return range.toString().length;
      });
    expect(caret).toBe(2);
    await page.keyboard.press('Control+z');
    await expect(quotes).toHaveCount(1);
    await page.keyboard.press('Control+Shift+z');
    await verify();
    await caretInsideLine(quotes.last().locator('.block-content'), 'Tail');
    await page.keyboard.press('Shift+Tab');
    await expect(quotes).toHaveCount(3);
    const verifyFinal = async () => {
      await expect(quotes).toHaveCount(3);
      expect(
        await quotes.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-quote-depth'))),
      ).toEqual(['1', '2', '1']);
      await expect(quotes.nth(1).locator('a')).toHaveText('link');
      await expect(quotes.nth(2).locator('em')).toHaveText('italic');
    };
    await verifyFinal();
    await page.evaluate(async () => {
      const { useWorkspaceStore } = await import(
        new URL('src/store/workspace.store.ts', location.href).href
      );
      if (!(await useWorkspaceStore.getState().controller.flush())) throw new Error('Save failed');
    });
    await page.reload();
    await verifyFinal();
  });
  test(`nested blockquotes retain their depth and formatting in ${docked ? 'a split pane' : 'the main editor'}`, async ({
    page,
  }) => {
    await page.goto('/laplace/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await page.locator('#newPageBtn').click();
    const initial = page.locator('#blockEditor .block-content').first();
    await initial.evaluate((element) => {
      element.focus();
      const clipboard = new DataTransfer();
      clipboard.setData(
        'text/markdown',
        '## Blockquotes\n> Outer **bold**\n>\n>> Nested [link](https://example.com)\n>>> Third\n> Outer again',
      );
      element.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }),
      );
    });
    if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
    const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
    const quotes = editor.locator('[data-type="quote"]');
    const nested = quotes.nth(1).locator('.block-content');
    const verify = async () => {
      await expect(quotes).toHaveCount(4);
      expect(
        await quotes.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-quote-depth'))),
      ).toEqual(['1', '2', '3', '1']);
      const guides = await quotes.evaluateAll((rows) =>
        rows.map((row) => {
          const rect = row.getBoundingClientRect();
          return {
            left: rect.left,
            top: rect.top,
            bottom: rect.bottom,
            radius: getComputedStyle(row).borderTopLeftRadius,
          };
        }),
      );
      for (let index = 1; index < guides.length; index += 1) {
        expect(guides[index].left).toBeCloseTo(guides[0].left, 1);
        expect(guides[index].top).toBeCloseTo(guides[index - 1].bottom, 1);
        expect(guides[index].radius).toBe('0px');
      }
      await expect(quotes.first().locator('strong')).toHaveText('bold');
      await expect(nested.locator('a')).toHaveText('link');
      expect(
        await quotes
          .nth(1)
          .evaluate((element) => parseFloat(getComputedStyle(element).paddingLeft)),
      ).toBeGreaterThan(
        await quotes
          .first()
          .evaluate((element) => parseFloat(getComputedStyle(element).paddingLeft)),
      );
    };
    await verify();
    for (const dark of [false, true]) {
      await page.evaluate((dark) => document.body.classList.toggle('dark', dark), dark);
      await editor.screenshot({
        path: `test-results/nested-quotes-${docked ? 'split' : 'main'}-${dark ? 'dark' : 'light'}.png`,
      });
    }
    await nested.click({ position: { x: 3, y: 8 } });
    await nested.press('Tab');
    await expect(quotes.nth(1)).toHaveAttribute('data-quote-depth', '3');
    await nested.press('Control+z');
    await verify();
    await nested.press('Control+Shift+z');
    await expect(quotes.nth(1)).toHaveAttribute('data-quote-depth', '3');
    await nested.press('Shift+Tab');
    await verify();
    await page.evaluate(async () => {
      const { useWorkspaceStore } = await import(
        new URL('src/store/workspace.store.ts', location.href).href
      );
      if (!(await useWorkspaceStore.getState().controller.flush())) throw new Error('Save failed');
    });
    await page.reload();
    await verify();
  });
}

test('typing and rich HTML paste support nested quote levels', async ({ page }) => {
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.locator('#newPageBtn').click();
  const content = page.locator('#blockEditor .block-content').first();
  await content.click();
  await page.keyboard.type('>> ');
  await expect(page.locator('#blockEditor .block-row').first()).toHaveAttribute(
    'data-quote-depth',
    '2',
  );
  await page.keyboard.type('Typed quote');
  await expect(content).toHaveText('Typed quote');
  await page.locator('#newPageBtn').click();
  await content.evaluate((element) => {
    element.focus();
    const clipboard = new DataTransfer();
    clipboard.setData(
      'text/html',
      '<blockquote><p>Outer</p><blockquote><p>Inner <strong>bold</strong></p></blockquote><p>Outer again</p></blockquote>',
    );
    element.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }),
    );
  });
  const rows = page.locator('#blockEditor [data-type="quote"]');
  expect(
    await rows.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-quote-depth')),
    ),
  ).toEqual(['1', '2', '1']);
  await expect(rows.nth(1).locator('strong')).toHaveText('bold');
});

import { expect, test } from '@playwright/test';

test('HTML paste preserves all six heading levels', async ({ page }) => {
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.locator('#newPageBtn').click();
  await page
    .locator('#blockEditor .block-content')
    .first()
    .evaluate((element) => {
      element.focus();
      const data = new DataTransfer();
      data.setData(
        'text/html',
        Array.from({ length: 6 }, (_, index) => {
          const level = index + 1;
          return `<h${level}>Heading <em>${level}</em></h${level}>`;
        }).join(''),
      );
      element.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  const rows = page.locator('#blockEditor > .block-row');
  await expect(rows).toHaveCount(6);
  for (let level = 1; level <= 6; level++) {
    await expect(rows.nth(level - 1)).toHaveAttribute('data-type', `h${level}`);
    await expect(rows.nth(level - 1).locator('em')).toHaveText(String(level));
  }
});

for (const docked of [false, true]) {
  for (const level of [1, 2, 3, 4, 5, 6]) {
    test(`rich paste inherits H${level} typography in ${docked ? 'a split pane' : 'the main editor'}`, async ({
      page,
    }) => {
      await page.goto('/laplace/');
      await expect(page.locator('#pageTitle')).toBeVisible();
      await page.locator('#newPageBtn').click();
      await page.locator('#pageTitle').fill('Heading paste');
      const main = page.locator('#blockEditor .block-content').first();
      await main.click();
      if (level >= 4 && !docked) {
        await page.keyboard.type(`/heading ${level}`);
        await expect(page.locator(`[data-slash-type="h${level}"]`)).toContainText(
          '#'.repeat(level),
        );
        await page.locator(`[data-slash-type="h${level}"]`).click();
      } else await page.keyboard.type('#'.repeat(level) + ' ');
      await main.fill('Before after');
      if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
      const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
      const content = editor.locator('.block-content').first();
      const row = editor.locator('.block-row').first();
      const originalId = await row.getAttribute('data-block-id');
      await content.focus();
      await content.evaluate((element, paragraphs) => {
        const range = document.createRange();
        range.setStart(element.firstChild!, 7);
        range.collapse(true);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
        const data = new DataTransfer();
        const styled =
          '<span style="font-size:11px;font-family:monospace;font-weight:400">small <em style="font-size:42px">italic</em> <a href="https://example.com" style="font-size:9px;font-family:serif">link</a></span>';
        data.setData(
          'text/html',
          paragraphs ? `<p>${styled}</p><p style="font-size:12px">Second paragraph</p>` : styled,
        );
        element.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
        );
      }, level === 2);
      const expected =
        'Before small italic link' + (level === 2 ? '\nSecond paragraph' : '') + 'after';
      const verify = async () => {
        await expect(editor.locator(':scope > .block-row')).toHaveCount(1);
        await expect(row).toHaveAttribute('data-type', `h${level}`);
        await expect(row).toHaveAttribute('data-block-id', originalId!);
        await expect(content).toHaveText(expected);
        await expect(content.locator('em')).toHaveText('italic');
        await expect(content.locator('a')).toHaveAttribute('href', 'https://example.com/');
        expect(
          await content.evaluate((element) => {
            const target = getComputedStyle(element);
            return [...element.querySelectorAll('*')].every((node) => {
              const style = getComputedStyle(node);
              return style.fontSize === target.fontSize && style.fontFamily === target.fontFamily;
            });
          }),
        ).toBe(true);
        await expect(content.locator('[style]')).toHaveCount(0);
        if (level >= 4) {
          await expect(content).toHaveCSS('font-size', `${26 - level * 2}px`);
          await expect(
            page.locator(`#rightSidebar [data-outline-block="${originalId}"]`),
          ).toHaveClass(new RegExp(`level-${level}`));
        }
      };
      await verify();
      await content.press('Control+z');
      await expect(content).toHaveText('Before after');
      await content.press('Control+Shift+z');
      await verify();
      await page.evaluate(async () => {
        const url = new URL('src/store/workspace.store.ts', location.href).href;
        const { useWorkspaceStore } = await import(url);
        if (!(await useWorkspaceStore.getState().controller.flush()))
          throw new Error('Save failed');
      });
      await page.reload();
      await verify();
    });
  }
}

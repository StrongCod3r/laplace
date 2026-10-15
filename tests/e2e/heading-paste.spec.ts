import { expect, test } from '@playwright/test';

for (const docked of [false, true]) {
  for (const level of [1, 2, 3, 4]) {
    test(`rich paste inherits H${level} typography in ${docked ? 'a split pane' : 'the main editor'}`, async ({
      page,
    }) => {
      await page.goto('/laplace/');
      await expect(page.locator('#pageTitle')).toBeVisible();
      await page.locator('#newPageBtn').click();
      await page.locator('#pageTitle').fill('Heading paste');
      const main = page.locator('#blockEditor .block-content').first();
      await main.click();
      if (level === 4 && !docked) {
        await page.keyboard.type('/heading 4');
        await expect(page.locator('[data-slash-type="h4"]')).toContainText('####');
        await page.locator('[data-slash-type="h4"]').click();
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
        if (level === 4) {
          await expect(content).toHaveCSS('font-size', '18px');
          await expect(
            page.locator(`#rightSidebar [data-outline-block="${originalId}"]`),
          ).toHaveClass(/level-4/);
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

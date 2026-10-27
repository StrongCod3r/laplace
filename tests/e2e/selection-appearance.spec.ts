import { expect, test } from '@playwright/test';

for (const docked of [false, true]) {
  for (const light of [false, true]) {
    test(`selection shares text color, block corners, and content width (${light ? 'light' : 'dark'}, ${docked ? 'split' : 'main'})`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.goto('/laplace/');
      await expect(page.locator('#pageTitle')).toBeVisible();
      await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
      await page.locator('#newPageBtn').click();
      await page
        .locator('#blockEditor .block-content')
        .first()
        .evaluate((content) => {
          const data = new DataTransfer();
          data.setData(
            'text/markdown',
            'First paragraph\n> [!NOTE] A callout with highlighted content.\n```javascript\nconst selected = true;\n```\nLast paragraph',
          );
          content.dispatchEvent(
            new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
          );
        });
      await page.locator('[data-ribbon-action="settings"]').click();
      await page.locator('#themeToggle').click();
      if (!light) await page.locator('#themeToggle').click();
      await page.locator('#settingsModal [data-close-modal]').click();
      if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
      const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
      const rows = editor.locator(':scope > .block-row');
      await expect(rows).toHaveCount(4);
      const first = (await rows.first().boundingBox())!;
      const last = (await rows.last().boundingBox())!;
      await page.mouse.move(first.x - 12, first.y - 1);
      await page.mouse.down();
      await page.mouse.move(last.x + last.width - 5, last.y + last.height - 1, { steps: 12 });
      await page.mouse.up();
      await expect(page.locator('#multiBlockSelectionLayer [data-selected-block-id]')).toHaveCount(
        4,
      );
      const appearance = await editor.evaluate((root) => {
        const content = root.querySelector('.block-content')!;
        const nativeColor = getComputedStyle(content, '::selection').backgroundColor;
        const bounds = root.getBoundingClientRect();
        return {
          nativeColor,
          blocks: [...root.querySelectorAll<HTMLElement>(':scope > .block-row')].map((row) => {
            const mark = document.querySelector<HTMLElement>(
              `[data-selected-block-id="${row.dataset.blockId}"]`,
            )!;
            const style = getComputedStyle(mark);
            const box = mark.getBoundingClientRect();
            const original = getComputedStyle(row);
            return {
              type: row.dataset.type,
              color: style.backgroundColor,
              radius: style.borderRadius,
              originalRadius: original.borderRadius,
              width: box.width,
              originalWidth: row.getBoundingClientRect().width,
              left: box.left,
              editorLeft: bounds.left,
              right: box.right,
              editorRight: bounds.right,
              border: style.borderTopWidth,
            };
          }),
        };
      });
      expect(appearance.nativeColor).not.toBe('rgba(0, 0, 0, 0)');
      for (const block of appearance.blocks) {
        expect(block.color).toBe(appearance.nativeColor);
        expect(block.border).toBe('0px');
        expect(block.left).toBeGreaterThanOrEqual(block.editorLeft - 0.5);
        expect(block.right).toBeLessThanOrEqual(block.editorRight + 0.5);
        if (block.type === 'code' || block.type === 'callout')
          expect(block.radius).toBe(block.originalRadius);
      }
      const callout = appearance.blocks.find((block) => block.type === 'callout')!;
      expect(Math.abs(callout.width - appearance.blocks[0].width)).toBeLessThan(0.5);
      await page.screenshot({ path: testInfo.outputPath('selection.png') });
      await page.keyboard.press('Escape');
      const firstContent = editor.locator('.block-content').first();
      await firstContent.evaluate((content: HTMLElement) => {
        content.focus();
        const range = document.createRange();
        range.selectNodeContents(content);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
      });
      await expect(page.locator('#textFormatToolbar')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('native-selection.png') });
    });
  }
}

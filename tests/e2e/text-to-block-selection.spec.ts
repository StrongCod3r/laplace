import { expect, test } from '@playwright/test';

const example = [
  'A paragraph with an inline equation: $E = mc^2$.',
  '---',
  '```javascript',
  'function square(x) {',
  '  return x * x;',
  '}',
  '',
  'console.log(square(5));',
  '```',
  '```mermaid',
  'flowchart LR',
  '  A[Idea] --> B[Draft]',
  '  B --> C[Review]',
  '  C --> D[Publish]',
  '```',
].join('\n');

for (const docked of [false, true]) {
  for (const backward of [false, true]) {
    test(`text drag includes each nontext block immediately (${backward ? 'upward' : 'downward'}, ${docked ? 'split' : 'main'})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1600, height: 1100 });
      await page.goto('/laplace/');
      await expect(page.locator('#pageTitle')).toBeVisible();
      await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
      await page.locator('#newPageBtn').click();
      await page
        .locator('#blockEditor .block-content')
        .first()
        .evaluate(
          (content, markdown) => {
            const data = new DataTransfer();
            data.setData('text/markdown', markdown);
            content.dispatchEvent(
              new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
            );
          },
          example + (backward ? '\nTrailing paragraph' : ''),
        );
      if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
      const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
      const rows = editor.locator(':scope > .block-row');
      await expect(rows).toHaveCount(backward ? 5 : 4);
      await expect(editor.locator('svg.pele-flowchart')).toBeVisible();
      const originalIds = await rows.evaluateAll((rows) =>
        rows.map((row) => row.getAttribute('data-block-id')),
      );
      const text = (await editor
        .locator('.block-content')
        .nth(backward ? 1 : 0)
        .boundingBox())!;
      await page.mouse.move(
        backward ? text.x + text.width - 1 : text.x + 1,
        text.y + text.height / 2,
      );
      await page.mouse.down();
      const indices = backward ? [3, 2, 1] : [1, 2, 3];
      for (const [index, rowIndex] of indices.entries()) {
        const block = (await rows.nth(rowIndex).boundingBox())!;
        await page.mouse.move(block.x + block.width / 2, block.y + block.height / 2, { steps: 10 });
        await expect(
          page.locator('#multiBlockSelectionLayer [data-selected-block-id]'),
        ).toHaveCount(index + 1);
        expect(
          await page
            .locator('#multiBlockSelectionLayer [data-selected-block-id]')
            .evaluateAll((marks) =>
              marks.map((mark) => mark.getAttribute('data-selected-block-id')),
            ),
        ).toEqual(originalIds.slice(backward ? rowIndex : 1, backward ? 4 : rowIndex + 1));
      }
      // Moving back over a block must immediately shrink the selection as well.
      const retreat = (await rows.nth(2).boundingBox())!;
      await page.mouse.move(retreat.x + retreat.width / 2, retreat.y + retreat.height / 2, {
        steps: 10,
      });
      await expect(page.locator('#multiBlockSelectionLayer [data-selected-block-id]')).toHaveCount(
        2,
      );
      const last = (await rows.nth(backward ? 1 : 3).boundingBox())!;
      await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2, { steps: 10 });
      await page.mouse.up();
      await expect(page.locator('#multiBlockSelectionLayer [data-selected-block-id]')).toHaveCount(
        3,
      );
      const copied = await page.evaluate(() => {
        const data = new DataTransfer();
        document.activeElement!.dispatchEvent(
          new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: data }),
        );
        return data.getData('text/plain');
      });
      expect(copied).toContain('function square(x)');
      expect(copied).toContain('flowchart LR');
      expect(copied).toContain(backward ? 'Trailing paragraph' : '$E = mc^2$');
      await page.locator('#textFormatToolbar [data-format-inline="bold"]').click();
      await expect(editor.locator('[data-inline-format="bold"]').first()).toBeVisible();
      await expect(page.locator('#multiBlockSelectionLayer [data-selected-block-id]')).toHaveCount(
        3,
      );
      await page.keyboard.press('Delete');
      await expect(rows).toHaveCount(1);
      expect(
        await editor.locator('.block-content').evaluate((content) => content.textContent),
      ).toBe(backward ? 'A paragraph with an inline equation: $E = mc^2$.' : '');
      await page.keyboard.press('Control+z');
      await expect(rows).toHaveCount(backward ? 5 : 4);
      expect(
        await rows.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-block-id'))),
      ).toEqual(originalIds);
      await expect(editor.locator('svg.pele-flowchart')).toBeVisible();
      await page.keyboard.press('Control+Shift+z');
      await expect(rows).toHaveCount(1);
    });
  }
}

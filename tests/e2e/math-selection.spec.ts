import { expect, test } from '@playwright/test';

for (const docked of [false, true]) {
  for (const table of [false, true]) {
    test(`inline equations support continuous selection and trailing text (${docked ? 'split' : 'main'}, ${table ? 'table' : 'paragraph'})`, async ({
      page,
      context,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto('/');
      await expect(page.locator('#pageTitle')).toBeVisible();
      await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
      await page.locator('#newPageBtn').click();
      const source = 'Before $x^2$ after';
      await page.evaluate(
        (markdown) => {
          const content = document.querySelector<HTMLElement>('#blockEditor .block-content')!;
          content.focus();
          const data = new DataTransfer();
          data.setData('text/markdown', markdown);
          content.dispatchEvent(
            new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
          );
        },
        table ? `| Equation |\n| --- |\n| ${source} |` : source,
      );
      if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
      const root = docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor';
      const content = table
        ? page
            .locator(`${root} [data-table-cell]`)
            .filter({ has: page.locator('[data-inline-math]') })
        : page.locator(`${root} .block-content`).first();
      await expect(content.locator('.katex')).toBeVisible();
      const points = await content.evaluate((element) => {
        const first = document.createRange();
        first.setStart(element.firstChild!, 0);
        first.setEnd(element.firstChild!, 1);
        const last = document.createRange();
        last.selectNodeContents(element.lastChild!);
        const a = first.getBoundingClientRect(),
          b = last.getBoundingClientRect();
        return { x: a.left + 1, y: a.top + a.height / 2, end: b.right + 1 };
      });
      await page.mouse.move(points.x, points.y);
      await page.mouse.down();
      await page.mouse.move(points.end, points.y, { steps: 20 });
      await page.mouse.up();
      await expect(page.getByRole('dialog', { name: 'Inline equation', exact: true })).toBeHidden();
      await page.keyboard.press('Control+c');
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(source);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Backspace');
      // Remove the suffix through native selection, leaving the equation at the end.
      await content.evaluate((element) => {
        const range = document.createRange();
        range.setStartAfter(element.querySelector('[data-inline-math]')!);
        range.setEnd(element, element.childNodes.length);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
      });
      await page.keyboard.press('Backspace');
      await expect(content).toHaveText('Before $x^2$', { useInnerText: true });
      const afterEquation = await content.evaluate((element) => {
        const equation = element.querySelector('[data-inline-math]')!.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        return {
          x: equation.right - rect.left + 4,
          y: equation.top - rect.top + equation.height / 2,
        };
      });
      await content.click({ position: afterEquation });
      await page.keyboard.type(' mouse');
      await expect(content).toHaveText('Before $x^2$ mouse', { useInnerText: true });
      await content.press('End');
      await page.keyboard.type(' appended');
      await expect(content).toHaveText('Before $x^2$ mouse appended', { useInnerText: true });
      await expect(content.locator('.katex')).toBeVisible();
    });
  }
}

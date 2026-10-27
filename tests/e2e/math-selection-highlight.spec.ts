import { expect, test } from '@playwright/test';

for (const docked of [false, true]) {
  for (const light of [false, true]) {
    for (const custom of [false, true]) {
      test(`inline formulas are highlighted with selected text (${custom ? 'cross-block' : 'native'}, ${light ? 'light' : 'dark'}, ${docked ? 'split' : 'main'})`, async ({
        page,
      }, testInfo) => {
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
              String.raw`Before $x^2$ between \(y^2\) after` + '\nSecond $z^2$ tail',
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
        const editor = page.locator(
          docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor',
        );
        const content = editor.locator('.block-content').first();
        await expect(editor.locator('.katex')).toHaveCount(3);
        if (custom) {
          const points = await editor.evaluate((root) => {
            const contents = root.querySelectorAll('.block-content');
            const first = document.createRange();
            first.setStart(contents[0].firstChild!, 0);
            first.setEnd(contents[0].firstChild!, 1);
            const last = document.createRange();
            last.setStart(contents[1].firstChild!, 5);
            last.setEnd(contents[1].firstChild!, 6);
            const a = first.getBoundingClientRect();
            const b = last.getBoundingClientRect();
            return {
              x: a.left + 1,
              y: a.top + a.height / 2,
              endX: b.left + 1,
              endY: b.top + b.height / 2,
            };
          });
          await page.mouse.move(points.x, points.y);
          await page.mouse.down();
          await page.mouse.move(points.endX, points.endY, { steps: 16 });
          await page.mouse.up();
        } else {
          await content.evaluate((element: HTMLElement) => {
            element.focus();
            const range = document.createRange();
            range.selectNodeContents(element);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
          });
        }
        const highlights = page.locator('#multiBlockSelectionLayer [data-selected-inline-math]');
        await expect(highlights).toHaveCount(2);
        await expect
          .poll(() =>
            content.evaluate((element) => {
              const formulas = [...element.querySelectorAll('[data-inline-math]')];
              const highlights = [...document.querySelectorAll('[data-selected-inline-math]')];
              return (
                highlights.length === 2 &&
                formulas.every((formula, index) => {
                  const box = formula.getBoundingClientRect();
                  const mark = highlights[index].getBoundingClientRect();
                  return (
                    mark.left <= box.left + 1 &&
                    mark.top <= box.top + 1 &&
                    mark.right >= box.right - 1 &&
                    mark.bottom >= box.bottom - 1
                  );
                })
              );
            }),
          )
          .toBe(true);
        await expect(content.locator('.katex').first()).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('selected-math.png') });
        const copied = await page.evaluate(() => {
          const data = new DataTransfer();
          document.activeElement!.dispatchEvent(
            new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: data }),
          );
          return data.getData('text/plain');
        });
        expect(copied).toContain('$x^2$');
        expect(copied).toContain(String.raw`\(y^2\)`);
        expect(copied).not.toContain('$z^2$');
        await editor.evaluate((root) => {
          (root as HTMLElement).style.paddingBottom = '1200px';
          root.closest('.dock-scroll, #editorView')!.scrollTop = 250;
        });
        await expect(highlights).toHaveCount(0);
        await editor.evaluate((root) => {
          root.closest('.dock-scroll, #editorView')!.scrollTop = 0;
        });
        await expect(highlights).toHaveCount(2);
        await content.click({ position: { x: 1, y: 10 } });
        await expect(highlights).toHaveCount(0);
        await content.press('Control+a');
        await expect(highlights).toHaveCount(3);
        await page.keyboard.press('Delete');
        await expect(editor.locator('.katex')).toHaveCount(0);
        await expect(highlights).toHaveCount(0);
        await page.keyboard.press('Control+z');
        await expect(editor.locator('.katex')).toHaveCount(3);
        expect(await content.evaluate((element) => element.textContent)).toBe(
          String.raw`Before $x^2$ between \(y^2\) after`,
        );
      });
    }
  }
}

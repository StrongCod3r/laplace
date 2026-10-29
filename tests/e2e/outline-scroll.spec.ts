import { expect, test } from '@playwright/test';

for (const docked of [false, true]) {
  test(`outline navigation smoothly scrolls and focuses headings in the ${docked ? 'split' : 'main'} editor`, async ({
    page,
  }) => {
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
          [
            '# Start',
            ...Array.from({ length: 35 }, (_, index) => `Paragraph before ${index}.`),
            '## Destination',
            ...Array.from({ length: 25 }, (_, index) => `Paragraph after ${index}.`),
          ].join('\n\n'),
        );
        (content as HTMLElement).focus();
        content.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
        );
      });
    if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
    const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
    const destination = editor.locator('[data-type="h2"] .block-content');
    await expect(destination).toHaveText('Destination');
    await editor.evaluate(async (root) => {
      const scroller = root.closest<HTMLElement>('.dock-scroll, #editorView')!;
      scroller.scrollTo({ top: 0, behavior: 'instant' });
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const probe = { samples: [] as number[], frame: 0 };
      (window as any).outlineScrollProbe = probe;
      const sample = () => {
        probe.samples.push(scroller.scrollTop);
        probe.frame = requestAnimationFrame(sample);
      };
      sample();
    });
    await page
      .locator('#rightSidebar [data-outline-block]')
      .filter({ hasText: 'Destination' })
      .click();
    await expect(destination).toBeFocused();
    await expect
      .poll(() =>
        destination.evaluate((content) => {
          const scroller = content.closest('.dock-scroll, #editorView')!;
          const viewport = scroller.getBoundingClientRect();
          const row = content.closest('.block-row')!.getBoundingClientRect();
          return Math.abs((row.top + row.bottom) / 2 - (viewport.top + viewport.bottom) / 2);
        }),
      )
      .toBeLessThan(3);
    const result = await editor.evaluate((root) => {
      const probe = (window as any).outlineScrollProbe;
      cancelAnimationFrame(probe.frame);
      return {
        samples: probe.samples as number[],
        finalTop: root.closest('.dock-scroll, #editorView')!.scrollTop,
      };
    });
    expect(result.samples[0]).toBe(0);
    expect(result.finalTop).toBeGreaterThan(500);
    const intermediate = result.samples.filter((top) => top > 10 && top < result.finalTop - 20);
    expect(new Set(intermediate).size).toBeGreaterThan(2);
  });
}

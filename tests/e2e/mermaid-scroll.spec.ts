import { expect, test, type Page } from '@playwright/test';

async function openMermaidPage(page: Page, trailingText = false) {
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  await page.locator('#newPageBtn').click();
  await page.evaluate((withText) => {
    const markdown =
      '```mermaid\ngraph TD\n  A --> B --> C --> D --> E --> F --> G --> H --> I --> J --> K --> L\n```' +
      (withText ? '\n\nAfter diagram' : '');
    const data = new DataTransfer();
    data.setData('text/markdown', markdown);
    const content = document.querySelector<HTMLElement>('#blockEditor .block-content')!;
    content.focus();
    content.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
    );
  }, trailingText);
  await expect(page.locator('#blockEditor [data-mermaid-render] svg')).toBeVisible();
  await expect(page.locator('#blockEditor .code-block')).toHaveClass(/mermaid-mode-preview/);
  await expect(page.locator('#blockEditor [data-code-editor]')).toBeHidden();
  // The scroll scenarios below exercise an explicitly selected split display.
  await page.locator('#blockEditor [data-mermaid-mode-toggle]').click();
  await page.locator('#blockEditor [data-mermaid-view-mode="split"]').click();
}

for (const docked of [false, true]) {
  const label = docked ? 'docked' : 'main';
  const editor = docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor';

  test(`adding a code block below a split Mermaid preview preserves scroll in the ${label} editor`, async ({
    page,
  }) => {
    await openMermaidPage(page, true);
    if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
    await expect(page.locator(`${editor} [data-mermaid-render] svg`)).toBeVisible();
    const baseline = await page.locator(editor).evaluate(async (blocks) => {
      const content = blocks.querySelector<HTMLElement>('.block-content')!;
      const root = blocks.closest<HTMLElement>('.dock-scroll, #editorView')!;
      content.focus({ preventScroll: true });
      const range = document.createRange();
      range.selectNodeContents(content);
      range.collapse(false);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      root.scrollTop +=
        content.getBoundingClientRect().top -
        root.getBoundingClientRect().top -
        root.clientHeight / 2;
      await new Promise(requestAnimationFrame);
      (window as any).mermaidProbe = {
        svg: blocks.querySelector('[data-mermaid-render] svg'),
        root,
        samples: [],
      };
      const sample = () => {
        const probe = (window as any).mermaidProbe;
        probe.samples.push(root.scrollTop);
        probe.frame = requestAnimationFrame(sample);
      };
      sample();
      return root.scrollTop;
    });
    expect(baseline).toBeGreaterThan(200);
    await page.keyboard.press('Enter');
    await page.locator(`${editor} .block-content`).last().pressSequentially('/code');
    await page.locator('.slash-item').filter({ hasText: /^Code/ }).click();
    await expect(page.locator(`${editor} [data-code-editor]`)).toHaveCount(2);
    await expect(page.locator(`${editor} [data-code-editor]`).last()).toBeFocused();
    const result = await page.locator(editor).evaluate(async (blocks) => {
      for (let frame = 0; frame < 12; frame++) await new Promise(requestAnimationFrame);
      const probe = (window as any).mermaidProbe;
      cancelAnimationFrame(probe.frame);
      return {
        sameSvg: probe.svg === blocks.querySelector('[data-mermaid-render] svg'),
        samples: probe.samples as number[],
      };
    });
    expect(result.sameSvg).toBe(true);
    expect(Math.max(...result.samples.map((value) => Math.abs(value - baseline)))).toBeLessThan(3);
  });

  for (const mode of ['split', 'preview']) {
    test(`click below a ${mode} Mermaid preview creates a block despite a trailing code newline in the ${label} editor`, async ({
      page,
    }) => {
      await openMermaidPage(page);
      if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
      const code = page.locator(`${editor} [data-code-editor]`);
      await code.fill('graph TD\n  A --> B\n');
      if (mode === 'preview') {
        await page.locator(`${editor} [data-mermaid-mode-toggle]`).click();
        await page.locator(`${editor} [data-mermaid-view-mode="preview"]`).click();
      }
      await expect(page.locator(`${editor} [data-mermaid-render] svg`)).toBeVisible();
      await page.locator(editor).evaluate((blocks) => {
        const root = blocks.closest<HTMLElement>('.dock-scroll, #editorView')!;
        root.scrollTop = root.scrollHeight;
      });
      const box = await page.locator(`${editor} > .block-row`).last().boundingBox();
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height + 12);
      const text = page.locator(`${editor} > [data-type="text"] .block-content`);
      await expect(text).toHaveCount(1);
      await expect(text).toBeFocused();
      // An existing empty text block still prevents duplicate trailing blocks.
      const textBox = await text.boundingBox();
      await page.mouse.click(textBox!.x + textBox!.width / 2, textBox!.y + textBox!.height + 12);
      await expect(text).toHaveCount(1);
    });
  }
}

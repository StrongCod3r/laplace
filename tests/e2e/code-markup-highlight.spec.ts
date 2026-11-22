import { expect, test } from '@playwright/test';

for (const docked of [false, true]) {
  test(`markup language selection preserves code in the ${docked ? 'split' : 'main'} editor`, async ({
    page,
  }) => {
    await page.goto('/laplace/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
    await page.locator('#newPageBtn').click();
    const source = [
      '<?xml version="1.0"?>',
      '<!-- Keep <tags> and whitespace -->',
      '<section class = "active" data-test="a > b and key=value" title=\'x &amp; y\'>',
      '  <ns:item ns:id="42">&lt;literal&gt; & text</ns:item>',
      '  <input disabled />',
      '</section>',
      '</textarea><script>window.markupExecuted = true;</script>',
      '',
    ].join('\n');
    await page.evaluate((source) => {
      const data = new DataTransfer();
      data.setData('text/markdown', '```plain\n' + source + '\n```');
      const content = document.querySelector<HTMLElement>('#blockEditor .block-content')!;
      content.focus();
      content.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
      );
    }, source);
    if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
    const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
    const block = editor.locator('.code-block');
    const input = block.locator('[data-code-editor]');
    const highlight = block.locator('[data-code-highlight] code');
    await expect(input).toHaveValue(source);
    for (const language of ['html', 'xml', 'plain', 'html']) {
      await block.locator('[data-code-language]').selectOption(language);
      await expect(input).toHaveValue(source);
      expect(await highlight.textContent()).toBe(source);
      if (language !== 'plain') {
        await expect(highlight.locator('.code-token.tag').first()).toHaveText('section');
        await expect(highlight.locator('.code-token.attr').first()).toHaveText('class');
      }
    }
    // Editing uses the same highlighter without rebuilding the entire block.
    await input.fill(source + '<br title="a > b" />');
    expect(await highlight.textContent()).toBe(source + '<br title="a > b" />');
    expect(await page.evaluate(() => 'markupExecuted' in window)).toBe(false);
    await page.evaluate(async () => {
      const { useWorkspaceStore } = await import(
        new URL('src/store/workspace.store.ts', location.href).href
      );
      await useWorkspaceStore.getState().controller.flush();
    });
    await page.reload();
    await expect(input).toHaveValue(source + '<br title="a > b" />');
    expect(await highlight.textContent()).toBe(source + '<br title="a > b" />');
  });
}

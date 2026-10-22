import { expect, test } from '@playwright/test';

for (const docked of [false, true]) {
  for (const wrapped of [false, true]) {
    test(`inline code stays inside its paragraph when pasted as ${wrapped ? 'a paragraph' : 'HTML fragments'} in the ${docked ? 'split' : 'main'} editor`, async ({
      page,
    }) => {
      await page.goto('/laplace/');
      await expect(page.locator('#pageTitle')).toBeVisible();
      await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
      await page.locator('#newPageBtn').click();
      await page.locator('#pageTitle').fill('Inline code paste');
      if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
      const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
      const content = editor.locator('.block-content').first();
      await content.fill('Before after');
      const blockId = await editor.locator('.block-row').first().getAttribute('data-block-id');
      await content.evaluate((element, wrapped) => {
        element.focus();
        const range = document.createRange();
        range.setStart(element.firstChild!, 7);
        range.collapse(true);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
        const html = 'An operation marked <code>Destructivo</code> needs <em>care</em>. ';
        const data = new DataTransfer();
        data.setData('text/html', wrapped ? `<p>${html}</p>` : html);
        data.setData('text/plain', 'An operation marked Destructivo needs care. ');
        element.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
        );
      }, wrapped);
      const verify = async () => {
        await expect(editor.locator(':scope > .block-row')).toHaveCount(1);
        await expect(editor.locator('.block-row').first()).toHaveAttribute(
          'data-block-id',
          blockId!,
        );
        await expect(content).toHaveText(
          'Before An operation marked Destructivo needs care. after',
        );
        await expect(content.locator('code')).toHaveText('Destructivo');
        await expect(content.locator('em')).toHaveText('care');
      };
      await verify();
      await content.press('Control+z');
      await expect(content).toHaveText('Before after');
      await content.press('Control+Shift+z');
      await verify();
      await page.evaluate(async () => {
        const { useWorkspaceStore } = await import(
          new URL('src/store/workspace.store.ts', location.href).href
        );
        await useWorkspaceStore.getState().controller.flush();
      });
      await page.reload();
      await verify();
    });
  }
}

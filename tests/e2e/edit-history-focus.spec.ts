import { expect, test, type Locator } from '@playwright/test';

async function caretOffset(content: Locator) {
  return content.evaluate((element) => {
    const selection = window.getSelection();
    if (!selection?.focusNode || !element.contains(selection.focusNode)) return -1;
    const range = document.createRange();
    range.selectNodeContents(element);
    range.setEnd(selection.focusNode, selection.focusOffset);
    return range.toString().length;
  });
}

for (const docked of [false, true]) {
  test(`undo and redo keep the edited note and focus in ${docked ? 'a split pane' : 'the main editor'}`, async ({
    page,
  }) => {
    await page.goto('/laplace/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
    await page.locator('#newPageBtn').click();
    await page.locator('#pageTitle').fill('Previous note');
    await page.locator('#newPageBtn').click();
    await page.locator('#pageTitle').fill('Edited note');
    await page.evaluate(async () => {
      const url = new URL('src/store/workspace.store.ts', location.href).href;
      const { useWorkspaceStore } = await import(url);
      await useWorkspaceStore.getState().controller.flush();
    });
    await page
      .locator('#pageTree .tree-page-btn')
      .filter({ hasText: /^Previous note$/ })
      .click();
    await page
      .locator('#pageTree .tree-page-btn')
      .filter({ hasText: /^Edited note$/ })
      .click();
    if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
    const content = page
      .locator(
        docked
          ? '.dock-pane.active [data-dock-blocks] .block-content'
          : '#blockEditor .block-content',
      )
      .first();
    const title = page.locator(docked ? '.dock-pane.active [data-dock-title]' : '#pageTitle');
    await content.click();
    await page.keyboard.type('hola');
    await content.press('Backspace');
    await content.press('Backspace');
    await page.keyboard.type('nuevo');
    await expect(content).toHaveText('honuevo');
    for (const [text, offset] of [
      ['ho', 2],
      ['hola', 4],
      ['', 0],
    ] as const) {
      await content.press('Control+z');
      await expect(title).toHaveText('Edited note');
      await expect(content).toHaveText(text);
      await expect(content).toBeFocused();
      await expect.poll(() => caretOffset(content)).toBe(offset);
    }
    for (const [text, offset] of [
      ['hola', 4],
      ['ho', 2],
      ['honuevo', 7],
    ] as const) {
      await content.press('Control+Shift+z');
      await expect(title).toHaveText('Edited note');
      await expect(content).toHaveText(text);
      await expect(content).toBeFocused();
      await expect.poll(() => caretOffset(content)).toBe(offset);
    }
    await content.press('Control+z');
    await expect(content).toHaveText('ho');
    await expect(content).toBeFocused();
    await expect.poll(() => caretOffset(content)).toBe(2);
    await page.keyboard.type('otro');
    await expect(content).toHaveText('hootro');
    await content.press('Control+z');
    await expect(content).toHaveText('ho');
    await expect(title).toHaveText('Edited note');
    await expect(content).toBeFocused();
    await expect.poll(() => caretOffset(content)).toBe(2);
  });

  test(`undo and redo restore the caret around deleted text in ${docked ? 'a split pane' : 'the main editor'}`, async ({
    page,
  }) => {
    await page.goto('/laplace/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
    await page.locator('#newPageBtn').click();
    await page.locator('#pageTitle').fill('Deleted text caret');
    if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
    const content = page
      .locator(
        docked
          ? '.dock-pane.active [data-dock-blocks] .block-content'
          : '#blockEditor .block-content',
      )
      .first();
    await content.fill('alpha beta gamma');
    await page.evaluate(async () => {
      const url = new URL('src/store/workspace.store.ts', location.href).href;
      const { useWorkspaceStore } = await import(url);
      await useWorkspaceStore.getState().controller.flush();
    });
    await content.evaluate((element) => {
      const range = document.createRange();
      range.setStart(element.firstChild!, 6);
      range.setEnd(element.firstChild!, 10);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await content.press('Control+x');
    await expect(content).toHaveText('alpha  gamma');
    await expect.poll(() => caretOffset(content)).toBe(6);
    // Moving the cursor after cutting must not replace the positions stored in history.
    await content.press('End');
    await content.press('Control+z');
    await expect(content).toHaveText('alpha beta gamma');
    await expect(content).toBeFocused();
    await expect.poll(() => caretOffset(content)).toBe(10);
    await content.press('Home');
    await content.press('Control+Shift+z');
    await expect(content).toHaveText('alpha  gamma');
    await expect(content).toBeFocused();
    await expect.poll(() => caretOffset(content)).toBe(6);
  });
}

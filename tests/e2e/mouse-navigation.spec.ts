import { expect, test, type Locator } from '@playwright/test';

async function pressSideButton(target: Locator, button: 3 | 4) {
  const prevented = await target.evaluate((element, button) => {
    const down = new MouseEvent('mousedown', { button, bubbles: true, cancelable: true });
    element.dispatchEvent(down);
    // Navigation may replace the original target before the button is released.
    const releaseTarget = element.isConnected ? element : document.body;
    releaseTarget.dispatchEvent(new MouseEvent('mouseup', { button, bubbles: true }));
    const click = new MouseEvent('auxclick', { button, bubbles: true, cancelable: true });
    releaseTarget.dispatchEvent(click);
    return { down: down.defaultPrevented, click: click.defaultPrevented };
  }, button);
  expect(prevented).toEqual({ down: true, click: true });
}

test('mouse side buttons navigate once per press and stay inside the workspace', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  const ids = await page.evaluate(async () => {
    const { useWorkspaceStore } = await import(
      new URL('src/store/workspace.store.ts', location.href).href
    );
    const controller = useWorkspaceStore.getState().controller;
    const initial = controller.getDocument().currentPageId;
    controller.invoke('createPage');
    const first = controller.getDocument().currentPageId;
    controller.invoke('createPage');
    return { initial, first, second: controller.getDocument().currentPageId };
  });
  const active = page.locator('#tabsScroll .editor-tab.active');
  await pressSideButton(page.locator('#pageTitle'), 3);
  await expect(active).toHaveAttribute('data-page-id', ids.first);
  await pressSideButton(page.locator('body'), 3);
  await expect(active).toHaveAttribute('data-page-id', ids.initial);
  await pressSideButton(page.locator('body'), 3);
  await expect(active).toHaveAttribute('data-page-id', ids.initial);
  await pressSideButton(page.locator('body'), 4);
  await expect(active).toHaveAttribute('data-page-id', ids.first);
  await pressSideButton(page.locator('body'), 4);
  await expect(active).toHaveAttribute('data-page-id', ids.second);
  await pressSideButton(page.locator('body'), 4);
  await expect(active).toHaveAttribute('data-page-id', ids.second);
});

test('mouse side buttons use the pane under the pointer', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  const ids = await page.evaluate(async () => {
    const { useWorkspaceStore } = await import(
      new URL('src/store/workspace.store.ts', location.href).href
    );
    const controller = useWorkspaceStore.getState().controller;
    const initial = controller.getDocument().currentPageId;
    controller.invoke('createPage');
    const first = controller.getDocument().currentPageId;
    controller.invoke('createPage');
    const second = controller.getDocument().currentPageId;
    const left = controller.getDocument().activeEditorGroupId;
    controller.invoke('splitActiveTab', 'right');
    const right = controller.getDocument().activeEditorGroupId;
    controller.invoke('openPage', initial);
    controller.invoke('focusEditorGroup', left);
    return {
      initial,
      first,
      second,
      left,
      right,
      leftPage: controller.getDocument().currentPageId,
    };
  });
  const left = page.locator(`.dock-pane[data-editor-group="${ids.left}"]`);
  const right = page.locator(`.dock-pane[data-editor-group="${ids.right}"]`);
  await expect(left).toHaveClass(/active/);
  await pressSideButton(right.locator('[data-dock-title]'), 3);
  await expect(right.locator('[data-dock-page]')).toHaveAttribute('data-page-id', ids.second);
  await expect(left.locator('[data-dock-page]')).toHaveAttribute('data-page-id', ids.leftPage);
  await pressSideButton(right.locator('[data-dock-title]'), 4);
  await expect(right.locator('[data-dock-page]')).toHaveAttribute('data-page-id', ids.initial);
});

import { expect, test } from '@playwright/test';

test('page navigation commits a bounded number of UI snapshots and preserves edits', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  const result = await page.evaluate(async () => {
    const modulePath = new URL('src/store/workspace.store.ts', location.href).pathname;
    const { useWorkspaceStore } = await import(/* @vite-ignore */ modulePath);
    const controller = useWorkspaceStore.getState().controller;
    for (let index = 0; index < 40; index++) controller.invoke('createPage');
    const tabs = controller
      .getDocument()
      .openTabs.filter((tab: { kind: string }) => tab.kind === 'page');
    const stringify = JSON.stringify;
    const durations: number[] = [];
    const snapshots: number[] = [];
    let builds = 0;
    JSON.stringify = function (value, ...args) {
      if (
        value &&
        typeof value === 'object' &&
        'tree' in value &&
        'gallery' in value &&
        'tabs' in value
      )
        builds++;
      return Reflect.apply(stringify, JSON, [value, ...args]);
    } as typeof JSON.stringify;
    try {
      for (let index = 0; index < 12; index++) {
        builds = 0;
        const start = performance.now();
        controller.invoke('activateTab', tabs[index % 2].id);
        durations.push(performance.now() - start);
        snapshots.push(builds);
      }
      builds = 0;
      controller.invoke('openPage', tabs[2].pageId);
      snapshots.push(builds);
    } finally {
      JSON.stringify = stringify;
    }
    return { snapshots, durations, pageId: tabs[2].pageId };
  });
  console.log('Navigation probe (40 extra pages):', JSON.stringify(result));
  expect(Math.max(...result.snapshots)).toBeLessThanOrEqual(3);
  await expect(page.locator('#tabsScroll .editor-tab.active')).toHaveAttribute(
    'data-page-id',
    result.pageId,
  );
  await expect(page.locator(`#pageTree [data-page-id="${result.pageId}"]`).first()).toHaveClass(
    /selected/,
  );
  await page.locator('#blockEditor .block-content').first().fill('Persisted through tab switching');
  const tabId = await page.locator('#tabsScroll .editor-tab.active').getAttribute('data-tab-id');
  await page.locator('#tabsScroll .editor-tab').first().click();
  await page.locator(`#tabsScroll [data-tab-id="${tabId}"]`).click();
  await expect(page.locator('#blockEditor')).toContainText('Persisted through tab switching');
  const history = await page.evaluate(async (pageId) => {
    const modulePath = new URL('src/store/workspace.store.ts', location.href).pathname;
    const { useWorkspaceStore } = await import(/* @vite-ignore */ modulePath);
    const controller = useWorkspaceStore.getState().controller;
    const content = () =>
      JSON.stringify(
        controller.getDocument().pages.find((note: { id: string }) => note.id === pageId).blocks,
      );
    await controller.invoke('undoWorkspace');
    const undone = content();
    await controller.invoke('redoWorkspace');
    const redone = content();
    await controller.flush();
    return { undone, redone };
  }, result.pageId);
  expect(history.undone).not.toContain('Persisted through tab switching');
  expect(history.redone).toContain('Persisted through tab switching');
  await page.reload();
  await expect(page.locator('#blockEditor')).toContainText('Persisted through tab switching');
});

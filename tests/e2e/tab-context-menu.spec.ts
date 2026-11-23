import { expect, test, type Page } from '@playwright/test';

async function prepareTabs(page: Page) {
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  return page.evaluate(async () => {
    const { useWorkspaceStore } = await import(
      new URL('src/store/workspace.store.ts', location.href).href
    );
    const controller = useWorkspaceStore.getState().controller!;
    controller.invoke('createPage');
    controller.invoke('createPage');
    const document = controller.getDocument();
    return { tabs: document.openTabs, pageCount: document.pages.length };
  });
}

test('tab context actions close the requested side, reopen and retain notes', async ({ page }) => {
  const { tabs, pageCount } = await prepareTabs(page);
  const first = page.locator(`#tabsScroll [data-tab-id="${tabs[0].id}"]`);
  await first.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Tab actions' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Close tabs to the left' })).toBeDisabled();
  await expect(page.locator('#tabsScroll .active')).toHaveAttribute('data-tab-id', tabs.at(-1)!.id);
  await menu.getByRole('menuitem', { name: 'Close tabs to the right' }).click();
  await expect(page.locator('#tabsScroll [data-tab-id]')).toHaveCount(1);
  await first.click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Reopen closed tab' }).click();
  await expect(page.locator('#tabsScroll [data-tab-id]')).toHaveCount(2);
  await first.click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Close other tabs' }).click();
  await expect(page.locator('#tabsScroll [data-tab-id]')).toHaveCount(1);
  await first.click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Close all tabs' }).click();
  await expect(page.locator('#tabsScroll [data-tab-id]')).toHaveCount(0);
  expect(
    await page.evaluate(async () => {
      const { useWorkspaceStore } = await import(
        new URL('src/store/workspace.store.ts', location.href).href
      );
      return useWorkspaceStore.getState().controller!.getDocument().pages.length;
    }),
  ).toBe(pageCount);
});

test('duplicate and split actions work in inactive panes and close only their group', async ({
  page,
}) => {
  const { tabs } = await prepareTabs(page);
  const menu = page.getByRole('menu', { name: 'Tab actions' });
  await page.locator(`#tabsScroll [data-tab-id="${tabs[0].id}"]`).click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Duplicate tab' }).click();
  await expect(page.locator('#tabsScroll [data-tab-id]')).toHaveCount(tabs.length + 1);
  await expect(page.locator('#tabsScroll .active')).toHaveAttribute(
    'data-page-id',
    tabs[0].pageId!,
  );
  await page.locator('#tabsScroll .active').click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Split right' }).click();
  await expect(page.locator('.dock-pane')).toHaveCount(2);
  const inactive = page.locator('.dock-pane:not(.active)');
  await inactive.locator('.dock-tab').first().click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Close other tabs' }).click();
  await expect(inactive.locator('.dock-tab')).toHaveCount(1);
  await expect(page.locator('.dock-pane.active .dock-tab')).toHaveCount(1);
  await inactive.locator('.dock-tab').click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Split down' }).click();
  await expect(page.locator('.dock-pane')).toHaveCount(3);
});

test('tab menu supports keyboard dismissal and stays inside the viewport in both themes', async ({
  page,
}) => {
  await prepareTabs(page);
  const tab = page.locator('#tabsScroll .active');
  const menu = page.getByRole('menu', { name: 'Tab actions' });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => document.body.classList.toggle('dark', theme === 'dark'), theme);
    await tab.focus();
    await page.keyboard.press('Shift+F10');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Close tab', exact: true })).toBeFocused();
    await page.keyboard.press('End');
    await expect(menu.getByRole('menuitem', { name: 'Split down' })).toBeFocused();
    const bounds = await menu.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await page.screenshot({ path: test.info().outputPath(`tab-menu-${theme}.png`) });
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(tab).toBeFocused();
    await tab.click({ button: 'right' });
    await page.locator('#pageTitle').click();
    await expect(menu).toBeHidden();
  }
});

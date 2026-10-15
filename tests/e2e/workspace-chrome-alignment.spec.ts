import { expect, test } from '@playwright/test';

test('workspace headers align across panels, themes, and split editors', async ({ page }) => {
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  const bounds = async (selector: string) => {
    const rect = await page.locator(selector).first().boundingBox();
    if (!rect) throw new Error(`Missing visible element: ${selector}`);
    return rect;
  };
  const reference = await bounds('[data-left-panel="files"] .section-title');
  for (const dark of [false, true]) {
    await page.evaluate((dark) => document.body.classList.toggle('dark', dark), dark);
    for (const selector of ['#editorTabs', '.right-sidebar-head', '.topbar']) {
      const rect = await bounds(selector);
      expect(rect.height).toBe(reference.height);
    }
    expect((await bounds('#editorTabs')).y).toBe(reference.y);
    expect((await bounds('.right-sidebar-head')).y).toBe(reference.y);
    const files = await bounds('[data-ribbon-action="files"]');
    expect(files.y + files.height / 2).toBe(reference.y + reference.height / 2);
    const toggle = await bounds('#rightSidebarToggle');
    expect(toggle.y + toggle.height / 2).toBe(reference.y + reference.height / 2);
    const toolbar = await bounds('.topbar');
    expect(toolbar.y).toBe(reference.y + reference.height);
    expect((await bounds('#editorView')).y).toBe(toolbar.y + toolbar.height);
    for (const panel of ['favorites', 'git', 'files']) {
      await page.locator(`[data-ribbon-action="${panel}"]`).click();
      const header = await bounds(
        panel === 'git' ? '#gitPanel > header' : `[data-left-panel="${panel}"] .section-title`,
      );
      expect(header.y).toBe(reference.y);
      expect(header.height).toBe(reference.height);
    }
    await page.screenshot({
      path: `test-results/workspace-headers-${dark ? 'dark' : 'light'}.png`,
    });
  }
  await page.locator('#newPageBtn').click();
  await page.keyboard.press('Control+Alt+ArrowRight');
  await expect(page.locator('.dock-pane')).toHaveCount(2);
  for (const pane of await page.locator('.dock-pane').all()) {
    const tabs = (await pane.locator('.dock-tabs').boundingBox())!;
    const toolbar = (await pane.locator('.dock-breadcrumbs').boundingBox())!;
    expect(tabs.y).toBe(reference.y);
    expect(tabs.height).toBe(reference.height);
    expect(toolbar.y).toBe(tabs.y + tabs.height);
    expect(toolbar.height).toBe(reference.height);
  }
});

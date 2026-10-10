import { expect, test } from '@playwright/test';

test('CSS Modules style both Preact views and generated command UI', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  await expect(page.locator('#sidebar')).toHaveClass(/(?:^|\s)nv_/);
  await expect(page.locator('#app')).toHaveCSS('display', 'flex');
  await page.keyboard.press('Control+k');
  await expect(page.locator('#commandPalette')).toBeVisible();
  const item = page.locator('#commandResults .command-item').first();
  await expect(item).toHaveClass(/(?:^|\s)nv_/);
  await expect(item).toHaveCSS('display', 'flex');
  await page.keyboard.press('Escape');
  await page.locator('[data-ribbon-action="graph"]').click();
  await page.locator('[data-graph-search]').fill('no-matching-note');
  await expect(page.locator('#graphView .graph-node').first()).toHaveCSS('opacity', '0.13');
  await page.locator('[data-ribbon-action="settings"]').click();
  await page.locator('[data-settings-tab="shortcuts"]').click();
  const shortcut = page.locator('#settingsModal .shortcut-row').first();
  await expect(shortcut).toBeVisible();
  await expect(shortcut).toHaveClass(/(?:^|\s)nv_/);
  await expect(shortcut).toHaveCSS('display', 'flex');
});

test('responsive styles and global theme variables survive module isolation', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  const light = await page.evaluate(() =>
    getComputedStyle(document.body).getPropertyValue('--text'),
  );
  await page.evaluate(() => document.body.classList.add('dark'));
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--text')))
    .not.toBe(light);
  await page.setViewportSize({ width: 800, height: 720 });
  await expect(page.locator('#sidebar')).toHaveCSS('position', 'fixed');
  await expect(page.locator('#sidebar')).toHaveCSS('left', '40px');
  await page.setViewportSize({ width: 390, height: 720 });
  await expect(page.locator('#sidebar')).toHaveCSS('left', '0px');
});

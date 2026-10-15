import { expect, test } from '@playwright/test';

test('Settings floats above the workspace, drags within the viewport, and closes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.locator('[data-ribbon-action="settings"]').click();
  const window = page.getByRole('dialog', { name: 'Settings', exact: true });
  const title = page.locator('#settingsWindowTitle');
  await expect(window).toBeVisible();
  await expect(window).toHaveAttribute('aria-modal', 'false');
  const drag = async (dx: number, dy: number) => {
    const bounds = await title.boundingBox();
    if (!bounds) throw new Error('Missing title');
    const x = bounds.x + bounds.width / 2,
      y = bounds.y + bounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 6 });
    await page.mouse.up();
  };
  const before = await window.boundingBox();
  await drag(110, 65);
  const after = await window.boundingBox();
  expect(after!.x - before!.x).toBeCloseTo(110, 0);
  expect(after!.y - before!.y).toBeCloseTo(65, 0);
  await page.locator('[data-ribbon-action="files"]').click();
  await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
  await expect(window).toBeVisible();
  await drag(-2000, -2000);
  const upper = await window.boundingBox();
  expect(upper!.x).toBe(12);
  expect(upper!.y).toBe(12);
  await drag(2000, 2000);
  const lower = await window.boundingBox();
  expect(lower!.x + lower!.width).toBeLessThanOrEqual(1268);
  expect(lower!.y + lower!.height).toBeLessThanOrEqual(888);
  await page.setViewportSize({ width: 390, height: 600 });
  await expect
    .poll(async () => {
      const bounds = await window.boundingBox();
      return (
        bounds!.x >= 12 &&
        bounds!.y >= 12 &&
        bounds!.x + bounds!.width <= 378 &&
        bounds!.y + bounds!.height <= 588
      );
    })
    .toBe(true);
  await expect(page.getByRole('button', { name: 'Close settings', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await drag(-2000, -2000);
  await page.locator('#themeToggle').click();
  await expect(page.locator('#themeToggle')).toContainText('Light');
  await page.screenshot({ path: 'test-results/settings-window-light.png' });
  await page.locator('#themeToggle').click();
  await expect(page.locator('body')).toHaveClass(/dark/);
  await page.screenshot({ path: 'test-results/settings-window-dark.png' });
  await page.locator('[data-settings-tab="shortcuts"]').click();
  await expect(page.locator('#shortcutList')).toBeVisible();
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await expect(window).toBeHidden();
  await page.locator('[data-ribbon-action="settings"]').click();
  await expect(window).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(window).toBeHidden();
});

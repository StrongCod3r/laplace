import { expect, test } from '@playwright/test';

for (const language of ['mermaid', 'latex']) {
  for (const docked of [false, true]) {
    test(`${language} display menu stays centered under its dropdown in the ${docked ? 'split' : 'main'} editor`, async ({
      page,
    }) => {
      await page.goto('/');
      await expect(page.locator('#pageTitle')).toHaveText('Getting Started');
      await page.getByRole('button', { name: 'Toggle right sidebar', exact: true }).click();
      if (docked) {
        await page.locator('#newPageBtn').click();
        await page.locator('.editor-tab').filter({ hasText: 'Getting Started' }).click();
        await page.keyboard.press('Control+Alt+ArrowRight');
      }
      const pane = page.locator(docked ? '.dock-pane.active' : '#pageEditor');
      const block = pane.locator(`[data-block-id="getting_started_${language}"]`);
      const toggle = block.locator('[data-code-mode-toggle]');
      const menu = block.locator('[data-code-mode-toolbar]');
      const original = await block.locator('[data-code-editor]').inputValue();
      for (const width of [1280, 900]) {
        await page.setViewportSize({ width, height: 800 });
        for (const mode of ['code', 'split', 'preview']) {
          await toggle.click();
          await expect(toggle).toHaveAttribute('aria-expanded', 'true');
          await expect(toggle.locator('svg')).toHaveCount(1);
          await expect(menu).toBeVisible();
          const buttonBounds = (await toggle.boundingBox())!;
          const menuBounds = (await menu.boundingBox())!;
          expect(
            Math.abs(menuBounds.x + menuBounds.width / 2 - buttonBounds.x - buttonBounds.width / 2),
          ).toBeLessThan(1);
          expect(menuBounds.y - buttonBounds.y - buttonBounds.height).toBeCloseTo(8, 0);
          await menu.locator(`[data-code-view-mode="${mode}"]`).click();
          await expect(menu).toBeHidden();
          await expect(toggle).toHaveAttribute('aria-expanded', 'false');
          await expect(block.locator('[data-code-editor]')).toHaveValue(original);
        }
      }
    });
  }
}

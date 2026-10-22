import { expect, test } from '@playwright/test';

for (const split of [false, true]) {
  for (const gesture of ['click', 'control', 'meta', 'middle'] as const) {
    test(`breadcrumb ${gesture} opens in ${split ? 'a split pane' : 'the main editor'}`, async ({
      page,
    }) => {
      await page.goto('/');
      await expect(page.locator('#pageTitle')).toHaveText('Getting Started');
      await page
        .locator('#blockEditor [data-page-block-open="page_getting_started_example"]')
        .click();
      await expect(page.locator('#pageTitle')).toHaveText('Example page');
      if (split) {
        await page.locator('#newPageBtn').click();
        await page.locator('#pageTitle').fill('Other pane');
        await page.locator('.editor-tab').filter({ hasText: 'Example page' }).click();
        await page.keyboard.press('Control+Alt+ArrowRight');
      }
      const pane = page.locator(split ? '.dock-pane.active' : '#app');
      const tabs = pane.locator(split ? '.dock-tab' : '.editor-tab');
      const before = await tabs.count();
      const crumb = pane.locator('[data-crumb-id]').filter({ hasText: 'Getting Started' });
      await crumb.click({
        button: gesture === 'middle' ? 'middle' : 'left',
        modifiers: gesture === 'control' ? ['Control'] : gesture === 'meta' ? ['Meta'] : [],
      });
      await expect(pane.locator(split ? '[data-dock-title]' : '#pageTitle')).toHaveText(
        'Getting Started',
      );
      await expect(tabs).toHaveCount(before + (gesture === 'click' ? 0 : 1));
      await expect(tabs.filter({ hasText: 'Example page' })).toHaveCount(
        gesture === 'click' ? 0 : 1,
      );
      if (split) {
        const otherPane = page.locator('.dock-pane:not(.active)');
        await expect(otherPane.locator('[data-dock-title]')).toHaveText('Other pane');
        await expect(otherPane.locator('.dock-tab')).toHaveCount(1);
      }
    });
  }
}

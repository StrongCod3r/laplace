import { expect, test, type Page } from '@playwright/test';

async function addNotes(page: Page) {
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toBeVisible({ timeout: 15_000 });
  for (const name of ['First note', 'Second note']) {
    await page.locator('#newPageBtn').click();
    await page.locator('#pageTitle').fill(name);
    await page.locator('#blockEditor .block-content').first().fill(`${name} content`);
  }
}

test('closing the active tab returns to the last visited tab and ignores background closures', async ({
  page,
}) => {
  await addNotes(page);
  const tabs = await page
    .locator('#tabsScroll .editor-tab')
    .evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute('data-tab-id')));
  const first = page.locator(`#tabsScroll [data-tab-id="${tabs[1]}"]`);
  const second = page.locator(`#tabsScroll [data-tab-id="${tabs[2]}"]`);
  await first.click();
  await second.click();
  await page.locator(`#tabsScroll [data-tab-id="${tabs[0]}"] [data-tab-close]`).click();
  await expect(second).toHaveClass(/active/);
  await second.locator('[data-tab-close]').click();
  await expect(first).toHaveClass(/active/);
  await expect(page.locator('#pageTitle')).toHaveText('First note');
});

test('Ctrl+Alt+T reopens closed notes in order and retains their tab position and source view', async ({
  page,
}) => {
  await addNotes(page);
  const order = await page
    .locator('.editor-tab')
    .evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute('data-tab-id')));
  await page.locator('#breadcrumbs [data-page-plain-text-toggle]').click();
  await page.getByRole('button', { name: 'Close Second note', exact: true }).click();
  await page.keyboard.press('Control+Alt+t');
  await expect(page.locator('#pageTitle')).toHaveText('Second note');
  await expect(page.locator('#pageEditor [data-plain-text-content]')).toBeVisible();
  await expect(page.locator('#pageEditor [data-plain-text-content]')).toContainText(
    'Second note content',
  );
  expect(
    await page
      .locator('.editor-tab')
      .evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute('data-tab-id'))),
  ).toEqual(order);
  await page.getByRole('button', { name: 'Close Second note', exact: true }).click();
  await page.getByRole('button', { name: 'Close First note', exact: true }).click();
  await page.keyboard.press('Control+Alt+t');
  await expect(page.locator('#pageTitle')).toHaveText('First note');
  await expect(page.locator('#blockEditor')).toContainText('First note content');
  await page.keyboard.press('Control+Alt+t');
  await expect(page.locator('#pageTitle')).toHaveText('Second note');
  await page.keyboard.press('Control+Alt+t');
  await expect(page.locator('.editor-tab')).toHaveCount(3);
  await page.locator('[data-ribbon-action="settings"]').click();
  await page.locator('[data-settings-tab="shortcuts"]').click();
  await expect(
    page.getByRole('button', { name: 'Set shortcut for Reopen closed tab', exact: true }),
  ).not.toHaveText('Unassigned');
});

test('reopening a tab from a removed split pane uses the remaining pane', async ({ page }) => {
  await addNotes(page);
  await page.keyboard.press('Control+Alt+ArrowRight');
  await expect(page.locator('.dock-pane')).toHaveCount(2);
  await page.locator('.dock-pane.active [data-tab-close]').click();
  await expect(page.locator('.dock-pane:visible')).toHaveCount(0);
  await page.keyboard.press('Control+Alt+t');
  await expect(page.locator('#pageTitle')).toHaveText('Second note');
  await expect(page.locator('#blockEditor')).toContainText('Second note content');
  await expect(page.locator('.editor-tab.active')).toContainText('Second note');
});

import { expect, test } from '@playwright/test';

test('new tables show a themed header row and retain it after reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.locator('#newPageBtn').click();
  const title = page.locator('#pageTitle');
  await title.fill('Table header');
  const content = page.locator('#blockEditor .block-content').first();
  await content.click();
  await page.keyboard.type('/table');
  await page.locator('[data-slash-type="table"]').click();

  const table = page.locator('#blockEditor .simple-table');
  await expect(table.locator('tr').first().locator('th')).toHaveCount(3);
  await expect(table.locator('td')).toHaveCount(6);
  for (const dark of [false, true]) {
    await page.evaluate((value) => document.body.classList.toggle('dark', value), dark);
    const header = table.locator('th').first();
    const background = await header.evaluate((node) =>
      getComputedStyle(node).getPropertyValue('--hover').trim(),
    );
    await expect(header).toHaveCSS('background-color', background);
    await expect(header).toHaveCSS('font-weight', '600');
  }
  await table.locator('[data-table-cell="0:0"]').fill('Column');
  await table.locator('[data-table-cell="1:0"]').fill('Value');
  await page.evaluate(async () => {
    const { useWorkspaceStore } = await import(
      new URL('src/store/workspace.store.ts', location.href).href
    );
    await useWorkspaceStore.getState().controller.flush();
  });
  await page.reload();
  await page
    .locator('#pageTree [data-action="open-page"]')
    .filter({ hasText: /^Table header$/ })
    .click();
  await expect(table.locator('th')).toHaveCount(3);
  await expect(table.locator('th').first()).toHaveText('Column');
  await expect(table.locator('[data-table-cell="1:0"]')).toHaveText('Value');
});

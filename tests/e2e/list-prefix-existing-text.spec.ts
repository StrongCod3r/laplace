import { expect, test } from '@playwright/test';

for (const [prefix, type] of [
  ['- ', 'bullet'],
  ['+ ', 'bullet'],
  ['* ', 'bullet'],
  ['1. ', 'number'],
  ['2) ', 'number'],
  ['[] ', 'todo'],
  ['[x] ', 'todo'],
] as const) {
  test(`typing ${JSON.stringify(prefix)} before existing text converts it to ${type}`, async ({
    page,
  }) => {
    await page.goto('/laplace/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await page.locator('#newPageBtn').click();
    const content = page.locator('#blockEditor .block-content').first();
    await content.fill('Existing text');
    await content.press('Home');
    await page.keyboard.type(prefix);
    const row = page.locator('#blockEditor > .block-row').first();
    await expect(row).toHaveAttribute('data-type', type);
    await expect(content).toHaveText('Existing text');
    await expect(content).toBeFocused();
    await page.keyboard.type('New ');
    await expect(content).toHaveText('New Existing text');
    if (type === 'todo')
      await expect(row.locator('.todo-box')).toBeChecked({ checked: prefix === '[x] ' });
  });
}

test('prefix conversion preserves existing inline formatting and supports undo', async ({
  page,
}) => {
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.locator('#newPageBtn').click();
  const content = page.locator('#blockEditor .block-content').first();
  await content.fill('Formatted text');
  await content.press('Control+a');
  await content.press('Control+b');
  await content.press('Home');
  await page.keyboard.type('1. ');
  const row = page.locator('#blockEditor > .block-row').first();
  await expect(row).toHaveAttribute('data-type', 'number');
  await expect(content).toHaveText('Formatted text');
  await expect(content.locator('strong')).toHaveText('Formatted text');
  await content.press('Control+z');
  await expect(row).toHaveAttribute('data-type', 'text');
  await expect(content).toHaveText('1. Formatted text');
  await content.press('Control+Shift+z');
  await expect(row).toHaveAttribute('data-type', 'number');
  await expect(content).toHaveText('Formatted text');
});

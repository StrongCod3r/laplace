import { expect, test } from '@playwright/test';

for (const dark of [false, true]) {
  test(`plain text toggles without changing content in ${dark ? 'dark' : 'light'} theme`, async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await page.evaluate((enabled) => document.body.classList.toggle('dark', enabled), dark);
    await page.locator('#newPageBtn').click();
    await page.locator('#pageTitle').fill('Plain text test');
    const content = page.locator('#blockEditor .block-content').first();
    await content.fill('Text <script>alert(1)</script>');
    const toggle = page.locator('#breadcrumbs [data-page-plain-text-toggle]');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(content).toBeHidden();
    const source = page.locator('#pageEditor [data-plain-text-content]');
    await expect(source).toBeVisible();
    await expect(source).toContainText('Text &#60;script&#62;alert(1)&#60;/script&#62;');
    await expect(source.locator('script')).toHaveCount(0);
    await expect(source).not.toHaveAttribute('contenteditable', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(content).toBeVisible();
    await expect(content).toHaveText('Text <script>alert(1)</script>');
  });
}

test('split panes keep independent plain text views and refresh the source after editing', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.locator('#newPageBtn').click();
  await page.locator('#pageTitle').fill('Split source');
  await page.locator('#blockEditor .block-content').first().fill('Original content');
  await page
    .locator('.editor-tab')
    .filter({ hasText: 'Getting Started' })
    .locator('[data-tab-close]')
    .click();
  await page.keyboard.press('Control+Alt+ArrowRight');
  const panes = page.locator('.dock-pane');
  await expect(panes).toHaveCount(2);
  const left = panes.nth(0);
  const right = panes.nth(1);
  await left.locator('[data-page-plain-text-toggle]').click();
  await expect(left.locator('[data-plain-text-content]')).toContainText('Original content');
  await expect(left.locator('[data-dock-blocks]')).toBeHidden();
  await expect(right.locator('[data-page-plain-text-toggle]')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await right.locator('.block-content').first().fill('Updated content');
  await expect(left.locator('[data-plain-text-content]')).toContainText('Updated content');
  await left.locator('[data-page-plain-text-toggle]').click();
  await expect(left.locator('.block-content').first()).toHaveText('Updated content');
});

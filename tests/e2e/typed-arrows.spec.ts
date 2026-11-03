import { expect, test } from '@playwright/test';

test('typing arrow shortcuts replaces them at the caret', async ({ page }) => {
  await page.goto('/laplace/');
  await page.locator('#newPageBtn').click();
  const content = page.locator('#blockEditor .block-content').first();
  await content.fill('before after');
  await content.press('Home');
  await content.press('ArrowRight');
  await page.keyboard.type('-> <- => <=');
  await expect(content).toHaveText('b→ ← ⇒ ⇐efore after');
  await page.keyboard.type('!');
  await expect(content).toHaveText('b→ ← ⇒ ⇐!efore after');
});

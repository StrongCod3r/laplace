import { expect, test } from '@playwright/test';

test.use({ baseURL: 'http://127.0.0.1:4176', serviceWorkers: 'allow' });

test('production lazy chunks are cached after use and the workspace reloads offline', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        for (const name of await caches.keys()) {
          if (!name.startsWith('laplace-shell-')) continue;
          const cache = await caches.open(name);
          if ((await cache.keys()).some((request) => /WorkspacePage-.*\.js/.test(request.url)))
            return true;
        }
        return false;
      }),
    )
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  expect(errors).toEqual([]);
  await context.setOffline(false);
});

test.describe('workspace chunk errors', () => {
  test.use({ serviceWorkers: 'block' });
  test('a rejected workspace chunk shows the global boundary', async ({ page }) => {
    await page.route('**/WorkspacePage-*.js', (route) => route.abort());
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Laplace could not open' })).toBeVisible();
    await expect(page.getByText('Your workspace is still stored locally.')).toBeVisible();
  });
});

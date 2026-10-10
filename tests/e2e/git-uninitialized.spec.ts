import { expect, test } from '@playwright/test';

for (const local of [false, true]) {
  test(
    (local ? 'local' : 'browser') + ' workspace without Git only shows an informational state',
    async ({ page }) => {
      const gitRequests: string[] = [];
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route(/git-worker-client|git\.worker/, (route) => {
        gitRequests.push(route.request().url());
        return route.abort();
      });
      if (local)
        await page.addInitScript(() => {
          Object.defineProperty(window, 'showDirectoryPicker', {
            configurable: true,
            value: async () => navigator.storage.getDirectory(),
          });
        });
      await page.goto('/laplace/');
      await expect(page.locator('#pageTitle')).toBeVisible();
      if (local) {
        if (!(await page.locator('#chooseDirectoryBtn').isVisible()))
          await page.getByRole('button', { name: 'Files', exact: true }).click();
        await page.locator('#chooseDirectoryBtn').click();
        await expect(page.locator('#workspaceSelect')).not.toHaveValue('browser');
      }
      await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
      const panel = page.locator('#gitPanel');
      await expect(
        panel.getByText('Git is not initialized in this workspace.', { exact: true }),
      ).toBeVisible();
      await expect(panel).toHaveAttribute('aria-busy', 'false');
      await expect(panel.getByRole('button')).toHaveCount(0);
      await expect(panel.getByRole('alert')).toHaveCount(0);
      await page.getByRole('button', { name: 'Files', exact: true }).click();
      await page.getByRole('button', { name: 'Git synchronization', exact: true }).click();
      await expect(
        panel.getByText('Git is not initialized in this workspace.', { exact: true }),
      ).toBeVisible();
      expect(gitRequests).toEqual([]);
      expect(errors).toEqual([]);
    },
  );
}

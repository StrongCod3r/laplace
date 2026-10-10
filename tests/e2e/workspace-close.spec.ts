import { expect, test } from '@playwright/test';

for (const missing of [false, true]) {
  test(
    'closing an active ' +
      (missing ? 'missing' : 'local') +
      ' workspace returns to Browser storage',
    async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(window, 'showDirectoryPicker', {
          configurable: true,
          value: async () =>
            (await navigator.storage.getDirectory()).getDirectoryHandle('Close-test', {
              create: true,
            }),
        });
      });
      await page.goto('/laplace/');
      await expect(page.locator('#pageTitle')).toBeVisible();
      await page.locator('#pageTitle').fill('Browser note kept');
      await page.locator('#pageTitle').press('Tab');
      await page.locator('#chooseDirectoryBtn').click();
      await expect(page.locator('#workspaceSelect')).not.toHaveValue('browser');
      const localId = await page.locator('#workspaceSelect').inputValue();
      if (missing) {
        await page.evaluate(async () =>
          (await navigator.storage.getDirectory()).removeEntry('Close-test', { recursive: true }),
        );
        await page.reload();
        await expect(page.locator('#workspaceAccessNotice')).toBeVisible();
      }
      await page.locator(missing ? '#workspaceDisconnectCloseBtn' : '#closeWorkspaceBtn').click();
      await expect(page.locator('#workspaceCloseDialog')).toBeVisible();
      if (missing) {
        await page.locator('#workspaceCloseCancel').click();
        await expect(page.locator('#workspaceAccessNotice')).toBeVisible();
        await page.locator('#workspaceDisconnectCloseBtn').click();
        await expect(page.locator('#workspaceCloseDialog')).toBeVisible();
      }
      await page.locator('#workspaceCloseConfirm').click();
      await expect(page.locator('#workspaceSelect')).toHaveValue('browser');
      await expect(page.locator('#workspaceSelect option[value="' + localId + '"]')).toHaveCount(0);
      await expect(page.locator('#workspaceAccessNotice')).toBeHidden();
      await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
      await expect(page.locator('#pageTitle')).toHaveText('Browser note kept');
      await page.reload();
      await expect(page.locator('#workspaceSelect')).toHaveValue('browser');
      await expect(page.locator('#workspaceSelect option[value="' + localId + '"]')).toHaveCount(0);
      await expect(page.locator('#pageTitle')).toHaveText('Browser note kept');
      if (!missing)
        expect(
          await page.evaluate(async () => {
            const root = await navigator.storage.getDirectory();
            return (await root.getDirectoryHandle('Close-test')).name;
          }),
        ).toBe('Close-test');
    },
  );
}

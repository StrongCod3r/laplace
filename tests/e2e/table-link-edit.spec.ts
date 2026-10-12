import { expect, test } from '@playwright/test';

for (const docked of [false, true]) {
  test(`table link Edit opens a floating panel and persists changes in ${docked ? 'a docked' : 'the main'} editor`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showDirectoryPicker', {
        configurable: true,
        value: async () => navigator.storage.getDirectory(),
      });
    });
    await page.goto('/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const writer = await (
        await root.getFileHandle('Links.md', { create: true })
      ).createWritable();
      await writer.write(
        '| Link | Other |\n| --- | --- |\n| Prefix [Original](https://example.com/old) suffix | Keep this cell |\n',
      );
      await writer.close();
    });
    await page.locator('#chooseDirectoryBtn').click();
    const openNote = page
      .locator('#pageTree [data-action="open-page"]')
      .filter({ hasText: /^Links$/ });
    await openNote.click();
    if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
    const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
    const cell = editor.locator('[data-table-cell="1:0"]');
    const link = cell.locator('a[data-inline-link]');
    await link.hover();
    await expect(page.locator('#linkHoverMenu')).toBeVisible();
    await page.locator('[data-link-hover-edit]').click();
    const panel = page.locator('#linkEditPanel');
    await expect(panel).toBeVisible();
    const title = panel.locator('[data-format-link-title]');
    const url = panel.locator('[data-format-link-input]');
    await expect(title).toBeFocused();
    await expect(title).toHaveValue('Original');
    await expect(url).toHaveValue('https://example.com/old');
    await url.fill('https://example.com/updated');
    await title.fill('Renamed');
    await title.press('Enter');
    await expect(panel).toBeHidden();
    await expect(link).toHaveText('Renamed');
    await expect(link).toHaveAttribute('href', 'https://example.com/updated');
    await expect(cell).toHaveText('Prefix Renamed suffix');
    await expect(editor.locator('[data-table-cell="1:1"]')).toHaveText('Keep this cell');
    const readNote = () =>
      page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        return (await (await root.getFileHandle('Links.md')).getFile()).text();
      });
    await expect.poll(readNote).toContain('Prefix [Renamed](https://example.com/updated) suffix');
    await page.reload();
    await openNote.click();
    await expect(link).toHaveText('Renamed');
    await link.hover();
    await page.locator('[data-link-hover-edit]').click();
    await expect(panel).toBeVisible();
    await panel.locator('[data-format-link-remove]').click();
    await expect(link).toHaveCount(0);
    await expect(cell).toHaveText('Prefix Renamed suffix');
    await expect.poll(readNote).not.toContain('https://example.com/updated');
  });
}

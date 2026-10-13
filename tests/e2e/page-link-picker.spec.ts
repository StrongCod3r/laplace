import { expect, test } from '@playwright/test';

for (const folder of ['', 'Docs']) {
  test(`Link to page ./ includes descendant folder notes in ${folder || 'the vault root'}`, async ({
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
    await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      for (const path of [
        'Root source.md',
        'Shared root.md',
        'Other root.md',
        'Docs/Docs source.md',
        'Docs/Shared sibling.md',
        'Docs/Other sibling.md',
        'Docs/Nested/Shared nested.md',
        'Docs/Nested/Nested.md',
        'DocsExtra/Shared prefix outside.md',
        'Elsewhere/Shared outside.md',
      ]) {
        const parts = path.split('/');
        const name = parts.pop()!;
        let directory = root;
        for (const part of parts)
          directory = await directory.getDirectoryHandle(part, { create: true });
        const file = await directory.getFileHandle(name, { create: true });
        const writer = await file.createWritable();
        await writer.write('Source content\n');
        await writer.close();
      }
    });
    await page.locator('#chooseDirectoryBtn').click();
    await expect(page.locator('#pageTree .page-tree-row')).toHaveCount(9);
    await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
    await page
      .locator('#pageTree .tree-page-btn')
      .filter({
        hasText: folder ? 'Docs source' : 'Root source',
      })
      .click();
    await page.locator('#blockEditor .block-content').first().fill('/');
    await page.locator('[data-slash-type="page-link"]').click();
    const search = page.locator('[data-page-link-search]');
    const titles = page.locator('[data-page-link-pick] .page-link-picker-title');
    await search.fill('./');
    await expect(titles).toHaveText(
      folder
        ? ['Other sibling', 'Shared sibling', 'Nested', 'Shared nested']
        : [
            'Docs source',
            'Other sibling',
            'Shared sibling',
            'Nested',
            'Shared nested',
            'Shared prefix outside',
            'Shared outside',
            'Other root',
            'Shared root',
          ],
    );
    await search.fill('./shared');
    await expect(titles).toHaveText(
      folder
        ? ['Shared sibling', 'Shared nested']
        : [
            'Shared sibling',
            'Shared nested',
            'Shared prefix outside',
            'Shared outside',
            'Shared root',
          ],
    );
    await search.fill('./Nested/');
    await expect(titles).toHaveText(['Nested', 'Shared nested']);
    await search.fill('./missing');
    await expect(titles).toHaveCount(0);
    await expect(page.locator('.page-link-picker-empty')).toBeVisible();
    await search.fill('Shared');
    await expect(titles).toHaveCount(5);
    await search.fill('./Nested/Nested');
    await search.press('Enter');
    await expect(page.locator('#blockEditor [data-page-link-open]')).toHaveText('Nested');
    await expect(page.locator('#blockEditor .block-content').last()).toBeFocused();
  });
}

for (const docked of [false, true]) {
  test(`confirming Link to page creates and focuses a following block in ${docked ? 'a docked' : 'the main'} editor`, async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
    await page.locator('#newPageBtn').click();
    await page.locator('#pageTitle').fill('Linked destination');
    await page.locator('#newPageBtn').click();
    await page.locator('#pageTitle').fill('Source note');
    if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
    const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
    const content = editor.locator('.block-content').first();
    await content.fill('Before');
    await content.press('End');
    await content.press('Enter');
    await editor.locator('.block-content').nth(1).fill('Keep following text');
    await content.fill('/');
    await page.locator('[data-slash-type="page-link"]').click();
    const search = page.locator('[data-page-link-search]');
    await expect(search).toBeFocused();
    await search.fill('Linked destination');
    if (docked) await search.press('Enter');
    else
      await page.locator('[data-page-link-pick]').filter({ hasText: 'Linked destination' }).click();
    const rows = editor.locator(':scope > .block-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toHaveAttribute('data-type', 'page-link');
    await expect(rows.nth(0).locator('[data-page-link-open]')).toHaveText('Linked destination');
    const next = rows.nth(1).locator('.block-content');
    await expect(next).toBeFocused();
    await expect(next).toHaveText('');
    await expect(rows.nth(2)).toContainText('Keep following text');
    await page.keyboard.type('Continue here');
    await expect(next).toHaveText('Continue here');
  });
}

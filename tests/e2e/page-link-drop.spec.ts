import { expect, test } from '@playwright/test';

test.use({ baseURL: 'http://127.0.0.1:4176' });

for (const docked of [false, true]) {
  for (const multiple of [false, true]) {
    test(`Files drops ${multiple ? 'selected pages' : 'a page'} as links in ${docked ? 'a docked' : 'the main'} editor`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/');
      await expect(page.locator('#pageTitle')).toBeVisible();
      await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);

      const sourceTitles = multiple ? ['Drag source A', 'Drag source B'] : ['Drag source A'];
      for (const title of [...sourceTitles, 'Drop destination']) {
        await page.locator('#newPageBtn').click();
        await page.locator('#pageTitle').fill(title);
      }
      if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
      const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
      const sources = sourceTitles.map((title) =>
        page.locator('#pageTree .page-tree-row').filter({ hasText: title }),
      );
      const sourceIds = await Promise.all(
        sources.map((source) => source.getAttribute('data-page-id')),
      );
      if (multiple) {
        await sources[0].click({ button: 'right' });
        await page.keyboard.press('Escape');
        await sources
          .at(-1)!
          .locator('.tree-page-btn')
          .click({ modifiers: ['Shift'] });
        await expect(page.locator('#pageTree .page-tree-row[aria-selected="true"]')).toHaveCount(
          sources.length,
        );
      }

      await sources[0].dragTo(editor.locator('.block-row').first());

      expect(errors).toEqual([]);
      await expect(editor.locator('[data-page-link-open]')).toHaveCount(sources.length);
      for (let index = 0; index < sourceIds.length; index++) {
        await expect(editor.locator(`[data-page-link-open="${sourceIds[index]}"]`)).toHaveText(
          sourceTitles[index],
        );
        await expect(sources[index]).toBeVisible();
      }
      await expect(
        page.locator(docked ? '.dock-pane.active [data-dock-title]' : '#pageTitle'),
      ).toHaveText('Drop destination');
    });
  }
}

for (const docked of [false, true]) {
  test(`Files drops a folder's associated page as a link in ${docked ? 'a docked' : 'the main'} editor`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
    for (const title of ['Drop destination', 'Linked folder']) {
      await page.locator('#newPageBtn').click();
      await page.locator('#pageTitle').fill(title);
    }
    const sourcePage = page
      .locator('#pageTree .page-tree-row')
      .filter({ hasText: 'Linked folder' });
    const sourceId = await sourcePage.getAttribute('data-page-id');
    await sourcePage.click({ button: 'right' });
    await page.locator('[data-tree-context-action="convert-page-to-folder"]').click();
    await page
      .getByRole('alertdialog', { name: 'Convert note to folder?' })
      .getByRole('button', { name: 'Convert to Folder', exact: true })
      .click();
    const sourceFolder = page.locator(
      '#pageTree .folder-tree-row[data-folder-path="Linked folder"]',
    );
    await expect(sourceFolder).toBeVisible();
    const destination = page
      .locator('#pageTree .page-tree-row')
      .filter({ hasText: 'Drop destination' });
    await destination.locator('.tree-page-btn').click();
    if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
    const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
    await editor.locator('.block-content').first().fill('Keep this text');

    await sourceFolder.dragTo(editor.locator('.block-row').first());

    expect(errors).toEqual([]);
    await expect(editor.locator('[data-page-link-open]')).toHaveCount(1);
    await expect(editor.locator(`[data-page-link-open="${sourceId}"]`)).toHaveText('Linked folder');
    await expect(editor.locator('.block-content').first()).toHaveText('Keep this text');
    await expect(sourceFolder).toBeVisible();
    await expect(
      page.locator(docked ? '.dock-pane.active [data-dock-title]' : '#pageTitle'),
    ).toHaveText('Drop destination');

    if (!docked) {
      await destination.locator('.tree-page-btn').click();
      await page.locator('#newFolderBtn').click();
      await page.locator('#newFolderNameInput').fill('Move target');
      await page.locator('#newFolderConfirm').click();
      const targetFolder = page.locator(
        '#pageTree .folder-tree-row[data-folder-path="Move target"]',
      );
      await expect(targetFolder).toBeVisible();
      await destination.locator('.tree-page-btn').click();
      await sourceFolder.dragTo(targetFolder);
      await expect(
        page.locator('#pageTree .folder-tree-row[data-folder-path="Move target/Linked folder"]'),
      ).toBeVisible();
      await expect(editor.locator(`[data-page-link-open="${sourceId}"]`)).toHaveText(
        'Linked folder',
      );
      expect(errors).toEqual([]);
    }
  });
}

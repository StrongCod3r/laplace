import { expect, test } from '@playwright/test';

for (const docked of [false, true]) {
  for (const name of ['report (1).pdf', 'picture.svg']) {
    test(`gallery copies ${name} as a File block in the ${docked ? 'split' : 'main'} editor`, async ({
      page,
      context,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.addInitScript(() => {
        Object.defineProperty(window, 'showDirectoryPicker', {
          configurable: true,
          value: async () => navigator.storage.getDirectory(),
        });
      });
      await page.goto('/');
      await expect(page.locator('#pageTitle')).toBeVisible();
      await page.evaluate(async (filename) => {
        const root = await navigator.storage.getDirectory();
        const folder = await root.getDirectoryHandle('.attachments', { create: true });
        const stream = await (
          await folder.getFileHandle(filename, { create: true })
        ).createWritable();
        await stream.write(
          filename.endsWith('.svg')
            ? '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"/>'
            : 'PDF attachment bytes',
        );
        await stream.close();
      }, name);
      await page.locator('#chooseDirectoryBtn').click();
      await page.locator('[data-ribbon-action="attachments"]').click();
      const copy = page.getByRole('button', { name: `Copy file attachment ${name}`, exact: true });
      await expect(copy).toBeVisible();
      await expect(copy).toHaveAttribute('title', 'Copy as file');
      if (name.endsWith('.svg'))
        await expect(
          page.getByRole('button', { name: `Copy image attachment ${name}`, exact: true }),
        ).toHaveAttribute('title', 'Copy as image');
      await expect(
        page.getByRole('button', { name: `Copy image attachment ${name}`, exact: true }),
      ).toHaveCount(name.endsWith('.svg') ? 1 : 0);
      await copy.click();
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toContain('<!-- laplace:file: {"version":1} -->');
      await page.locator('#newPageBtn').click();
      await page.locator('#pageTitle').fill('Pasted attachment');
      if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
      const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
      const content = editor.locator('.block-content').first();
      await content.click();
      await content.press('Control+v');
      const card = editor.locator('[data-type="file"]');
      await expect(card).toHaveCount(1);
      await expect(card.locator('.file-name')).toHaveText(name);
      await expect(card.locator('[data-file-card]')).toHaveAttribute(
        'data-file-source',
        `.attachments/${name}`,
      );
      await expect(card.locator('[data-file-meta]')).not.toHaveText(/Loading|not found/);
      await expect(editor.locator('[data-type="image"]')).toHaveCount(0);
      const downloadEvent = page.waitForEvent('download');
      await card.getByRole('button', { name: 'Download file', exact: true }).click();
      expect((await downloadEvent).suggestedFilename()).toBe(name);
      await page.keyboard.press('Control+z');
      await expect(card).toHaveCount(0);
      await page.keyboard.press('Control+Shift+z');
      await expect(card).toHaveCount(1);
      await page.evaluate(async () => {
        const { useWorkspaceStore } = await import(
          new URL('src/store/workspace.store.ts', location.href).href
        );
        await useWorkspaceStore.getState().controller.flush();
      });
      await page.reload();
      await expect(page.locator('[data-type="file"] .file-name')).toHaveText(name);
      expect(
        await page.evaluate(async () => {
          const folder = (await (
            await navigator.storage.getDirectory()
          ).getDirectoryHandle('.attachments')) as FileSystemDirectoryHandle & {
            entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
          };
          const names: string[] = [];
          for await (const [filename] of folder.entries()) names.push(filename);
          return names;
        }),
      ).toEqual([name]);
    });
  }
}

for (const renamed of [false, true]) {
  test(`gallery File copy preserves the ${renamed ? 'custom label and download name' : 'original filename and marker'}`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await page.locator('#newPageBtn').click();
    const content = page.locator('#blockEditor .block-content').first();
    await content.fill('/file');
    await page.locator('[data-slash-type="file"]').click();
    const card = page.locator('#blockEditor [data-type="file"]');
    const choose = page.waitForEvent('filechooser');
    await card.getByRole('button', { name: 'Upload file', exact: true }).click();
    await (
      await choose
    ).setFiles({
      name: 'Jonathan Naranjo CV_en.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('PDF attachment bytes'),
    });
    await expect(card.locator('.file-name')).toHaveText('Jonathan Naranjo CV_en.pdf');
    if (renamed) {
      await card.locator('summary').click();
      await card.getByRole('textbox', { name: 'File display name' }).fill('Jonathan CV');
      await card.getByRole('button', { name: 'Save name', exact: true }).click();
      await expect(card.locator('.file-name')).toHaveText('Jonathan CV');
    }
    const toggle = page.locator('#breadcrumbs [data-page-plain-text-toggle]');
    await toggle.click();
    const original = await page.locator('[data-plain-text-content]').textContent();
    expect(original).toContain('<!-- laplace:file:');
    await toggle.click();
    await page.locator('[data-ribbon-action="attachments"]').click();
    // The bundled Getting Started image is also present; select the uploaded PDF by name.
    await page
      .getByRole('button', { name: /Copy file attachment .*Jonathan Naranjo CV_en\.pdf/ })
      .click();
    await expect
      .poll(() =>
        page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n')),
      )
      .toBe(original!.trim());
    await page.locator('#newPageBtn').click();
    await content.click();
    await content.press('Control+v');
    await expect(card.locator('.file-name')).toHaveText(
      renamed ? 'Jonathan CV' : 'Jonathan Naranjo CV_en.pdf',
    );
    await toggle.click();
    await expect(page.locator('[data-plain-text-content]')).toHaveText(original!);
    await toggle.click();
    const downloadEvent = page.waitForEvent('download');
    await card.getByRole('button', { name: 'Download file', exact: true }).click();
    expect((await downloadEvent).suggestedFilename()).toBe('Jonathan Naranjo CV_en.pdf');
  });
}

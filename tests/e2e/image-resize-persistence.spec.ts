import { expect, test } from '@playwright/test';

for (const docked of [false, true]) {
  test(`resizing an image persists its Markdown width in ${docked ? 'a split pane' : 'the main editor'}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showDirectoryPicker', {
        configurable: true,
        value: async () => navigator.storage.getDirectory(),
      });
    });
    await page.goto('/laplace/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const attachments = await root.getDirectoryHandle('.attachments', { create: true });
      const write = async (directory: FileSystemDirectoryHandle, name: string, text: string) => {
        const stream = await (
          await directory.getFileHandle(name, { create: true })
        ).createWritable();
        await stream.write(text);
        await stream.close();
      };
      await write(
        attachments,
        'example.svg',
        '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="purple"/></svg>',
      );
      await write(
        root,
        'Resize.md',
        '![[example.svg]]\n![Description|201](.attachments/example.svg "Caption")\n',
      );
    });
    await page.locator('#chooseDirectoryBtn').click();
    await page
      .locator('#pageTree [data-action="open-page"]')
      .filter({ hasText: /^Resize$/ })
      .click();
    if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
    const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
    const shell = editor.locator('.image-preview-shell').first();
    await expect
      .poll(() => shell.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBe(640);
    const before = (await shell.boundingBox())!;
    await shell.hover();
    const handle = (await shell.locator('[data-image-resize="right"]').boundingBox())!;
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (313 - before.width) / 2, y, { steps: 10 });
    await page.mouse.up();
    const resizedWidth = Math.round((await shell.boundingBox())!.width);
    expect(Math.abs(resizedWidth - 313)).toBeLessThanOrEqual(1);
    const markdown = await page.evaluate(async () => {
      const url = new URL('src/store/workspace.store.ts', location.href).href;
      const { useWorkspaceStore } = await import(url);
      if (!(await useWorkspaceStore.getState().controller.flush())) throw new Error('Save failed');
      const root = await navigator.storage.getDirectory();
      return (await (await root.getFileHandle('Resize.md')).getFile()).text();
    });
    expect(markdown).toContain(`![[.attachments/example.svg|${resizedWidth}]]`);
    expect(markdown).toContain('![Description|201](.attachments/example.svg "Caption")');
    await page.reload();
    await expect
      .poll(async () => Math.round((await shell.boundingBox())!.width))
      .toBe(resizedWidth);
    await expect(editor.locator('.image-caption').nth(0)).toHaveText('Caption');
    await expect
      .poll(async () =>
        Math.round((await editor.locator('.image-preview-shell').nth(1).boundingBox())!.width),
      )
      .toBe(201);
  });
}

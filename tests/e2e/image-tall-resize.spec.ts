import { expect, test } from '@playwright/test';

for (const docked of [false, true]) {
  test(`pasted tall images keep their aspect ratio and can grow in the ${docked ? 'split' : 'main'} editor`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/laplace/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
    await page.locator('#newPageBtn').click();
    if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
    const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
    await editor
      .locator('.block-content')
      .first()
      .evaluate(async (content: HTMLElement) => {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 1600;
        const context = canvas.getContext('2d')!;
        context.fillStyle = 'purple';
        context.fillRect(0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!)));
        const data = new DataTransfer();
        data.items.add(new File([blob], 'tall.png', { type: 'image/png' }));
        content.focus();
        content.dispatchEvent(
          new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
        );
      });
    const shell = editor.locator('.image-preview-shell');
    const image = shell.locator('img');
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalHeight))
      .toBe(1600);
    const original = (await image.boundingBox())!;
    expect(original.height / original.width).toBeCloseTo(5, 1);
    expect(original.height).toBeGreaterThan(900);

    const resize = async (width: number) => {
      const handle = shell.locator('[data-image-resize="right"]');
      await handle.scrollIntoViewIfNeeded();
      const bounds = (await handle.boundingBox())!;
      const before = (await shell.boundingBox())!;
      const x = bounds.x + bounds.width / 2;
      const y = bounds.y + bounds.height / 2;
      await page.mouse.move(before.x + before.width - 20, y);
      await expect(handle).toHaveCSS('pointer-events', 'auto');
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + (width - before.width) / 2, y, { steps: 10 });
      await page.mouse.up();
      await expect.poll(async () => Math.round((await image.boundingBox())!.width)).toBe(width);
      const size = (await image.boundingBox())!;
      expect(size.height / size.width).toBeCloseTo(5, 1);
      return size;
    };
    const smaller = await resize(160);
    const larger = await resize(280);
    expect(larger.height).toBeGreaterThan(smaller.height);
    expect(larger.height).toBeGreaterThan(900);
    await page.evaluate(async () => {
      const { useWorkspaceStore } = await import(
        new URL('src/store/workspace.store.ts', location.href).href
      );
      if (!(await useWorkspaceStore.getState().controller.flush())) throw new Error('Save failed');
    });
    await page.reload();
    await expect.poll(async () => Math.round((await image.boundingBox())!.height)).toBe(1400);
    await expect.poll(async () => Math.round((await image.boundingBox())!.width)).toBe(280);
  });
}

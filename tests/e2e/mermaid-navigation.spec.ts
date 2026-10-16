import { expect, test } from '@playwright/test';

for (const docked of [false, true]) {
  for (const dark of [false, true]) {
    test(`Mermaid zoom and pan work in the ${docked ? 'split' : 'main'} editor (${dark ? 'dark' : 'light'})`, async ({
      page,
    }) => {
      await page.route('https://cdn.jsdelivr.net/npm/mermaid@12/**', (route) =>
        route.fulfill({
          contentType: 'text/javascript',
          body: `export default { initialize() {}, async render(id) { return { svg: '<svg id="'+id+'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 240" style="max-width:500px"><rect x="10" y="10" width="480" height="220" fill="#778899"/></svg>' }; } };`,
        }),
      );
      await page.goto('/');
      await expect(page.locator('#pageTitle')).toBeVisible();
      await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
      await page.locator('#newPageBtn').click();
      await page.evaluate((dark) => {
        document.body.classList.toggle('dark', dark);
        const data = new DataTransfer();
        data.setData('text/markdown', '```mermaid\ngraph TD\n A --> B\n```\n\nAfter diagram');
        const content = document.querySelector<HTMLElement>('#blockEditor .block-content')!;
        content.focus();
        content.dispatchEvent(
          new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
        );
      }, dark);
      if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
      const root = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
      const preview = root.locator('[data-mermaid-preview]');
      const viewport = preview.locator('[data-mermaid-render]');
      const svg = viewport.locator('svg');
      const reset = preview.locator('[data-mermaid-reset]');
      await expect(svg).toBeVisible();
      const original = await svg.boundingBox();
      await preview.getByRole('button', { name: 'Zoom in', exact: true }).click();
      await expect(reset).toHaveText('125%');
      expect((await svg.boundingBox())!.width).toBeCloseTo(original!.width * 1.25, 0);
      await preview.getByRole('button', { name: 'Zoom out', exact: true }).click();
      await expect(reset).toHaveText('100%');
      const rect = (await viewport.boundingBox())!;
      const x = rect.x + rect.width / 2,
        y = rect.y + rect.height / 2;
      await page.mouse.move(x, y);
      const wheelPrevented = await viewport.evaluate((element) => {
        const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 });
        element.dispatchEvent(wheel);
        return wheel.defaultPrevented;
      });
      expect(wheelPrevented).toBe(false);
      await expect(reset).toHaveText('100%');
      const before = (await svg.boundingBox())!;
      await page.mouse.down();
      await page.mouse.move(x + 60, y + 35, { steps: 8 });
      await page.mouse.up();
      const after = (await svg.boundingBox())!;
      expect(after.x - before.x).toBeCloseTo(60, 0);
      expect(after.y - before.y).toBeCloseTo(35, 0);
      await expect(viewport).not.toHaveAttribute('data-panning');
      const transform = await preview.locator('[data-mermaid-canvas]').getAttribute('style');
      await root.locator('.block-content').last().press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('New block');
      await expect(preview.locator('[data-mermaid-canvas]')).toHaveAttribute('style', transform!);
      await reset.click();
      await expect(reset).toHaveText('100%');
      await expect(preview.locator('[data-mermaid-canvas]')).toHaveCSS(
        'transform',
        'matrix(1, 0, 0, 1, 0, 0)',
      );
      await viewport.focus();
      await page.keyboard.press('+');
      await expect(reset).toHaveText('125%');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('0');
      await expect(reset).toHaveText('100%');
      await expect(preview.locator('[data-mermaid-canvas]')).toHaveCSS(
        'transform',
        'matrix(1, 0, 0, 1, 0, 0)',
      );
      await preview.getByRole('button', { name: 'Zoom in', exact: true }).click();
      const savedTransform = await preview.locator('[data-mermaid-canvas]').getAttribute('style');
      const savedSvgStyle = await svg.getAttribute('style');
      const svgId = await svg.getAttribute('id');
      const launch = preview.getByRole('button', { name: 'Open diagram viewer', exact: true });
      await launch.click();
      const viewer = page.getByRole('dialog', { name: 'Mermaid diagram viewer', exact: true });
      await expect(viewer).toBeVisible();
      const viewerBounds = (await viewer.boundingBox())!;
      expect(viewerBounds.width).toBe(page.viewportSize()!.width);
      expect(viewerBounds.height).toBe(page.viewportSize()!.height);
      await expect(viewer.locator('[data-mermaid-reset]')).toHaveText('100%');
      await expect(page.locator(`svg[id="${svgId}"]`)).toHaveCount(1);
      const diagram = (await viewer.locator('[data-mermaid-canvas] svg').boundingBox())!;
      expect(diagram.height).toBeLessThanOrEqual(viewerBounds.height - 80);
      await viewer.getByRole('button', { name: 'Zoom in', exact: true }).click();
      await expect(viewer.locator('[data-mermaid-reset]')).toHaveText('125%');
      const fullViewport = viewer.locator('[data-mermaid-render]');
      await fullViewport.hover();
      await page.mouse.wheel(0, -100);
      await expect(viewer.locator('[data-mermaid-reset]')).not.toHaveText('125%');
      const fullBox = (await fullViewport.boundingBox())!;
      await page.mouse.move(fullBox.x + 40, fullBox.y + 40);
      await page.mouse.down();
      await page.mouse.move(fullBox.x + 90, fullBox.y + 70, { steps: 6 });
      await page.mouse.up();
      await page.keyboard.press('Escape');
      await expect(viewer).toHaveCount(0);
      await expect(launch).toBeFocused();
      await expect(svg).toBeVisible();
      await expect(svg).toHaveAttribute('style', savedSvgStyle!);
      await expect(preview.locator('[data-mermaid-canvas]')).toHaveAttribute(
        'style',
        savedTransform!,
      );
      await viewport.dblclick();
      await expect(viewer).toBeVisible();
      await viewer.locator('[data-mermaid-render]').dblclick();
      await expect(viewer).toHaveCount(1);
      await viewer.getByRole('button', { name: 'Close diagram viewer', exact: true }).click();
      await expect(viewer).toHaveCount(0);
      await expect(svg).toBeVisible();
      await expect(root.locator('[data-code-editor]')).toHaveValue('graph TD\n A --> B');
      await expect(root.locator('[data-code-editor]')).toBeHidden();
      if (!dark && !docked) {
        await launch.click();
        await page.evaluate(async () => {
          const { useWorkspaceStore } = await import(
            new URL('src/store/workspace.store.ts', location.href).href
          );
          useWorkspaceStore.getState().controller.dispose();
        });
        await expect(viewer).toHaveCount(0);
        await expect(svg).toBeVisible();
      }
    });
  }
}

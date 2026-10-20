import { expect, test } from '@playwright/test';

async function openGraph(page: import('@playwright/test').Page, count = 0) {
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  await page.evaluate(async (count) => {
    const { useWorkspaceStore } = await import(
      new URL('src/store/workspace.store.ts', location.href).href
    );
    const controller = useWorkspaceStore.getState().controller;
    const roots: string[] = [];
    for (let i = 0; i < count; i++) {
      const note = controller.invoke('createPage') as {
        id: string;
        title: string;
        parentId?: string;
      };
      note.title = `Cluster ${Math.floor(i / 8) + 1} note ${(i % 8) + 1}`;
      if (i % 8 === 0) roots.push(note.id);
      else note.parentId = roots.at(-1);
    }
    controller.invoke('openGraphTab');
  }, count);
  await expect(page.locator('[data-graph-canvas] canvas')).toBeVisible();
  // Allow native D3 cooling to complete before testing stationary clicks.
  await page.waitForTimeout(4500);
}

async function selectFirst(page: import('@playwright/test').Page) {
  const host = page.locator('[data-graph-canvas]');
  await host.focus();
  await host.press('ArrowRight');
  const bounds = await host.boundingBox();
  if (!bounds) throw new Error('Canvas must be visible');
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

test('native canvas supports normal clicks, Ctrl-click and middle-click navigation', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openGraph(page);
  const point = await selectFirst(page);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#graphView')).toBeVisible();
  await page.keyboard.down('Control');
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 70, point.y + 25, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Control');
  await expect(page.locator('#graphView')).toBeVisible();
  await page.locator('[data-graph-canvas]').press('ArrowRight');
  await page.mouse.move(point.x, point.y);
  await expect(page.locator('[data-graph-canvas] .float-tooltip-kap')).toBeVisible();
  await page.keyboard.down('Control');
  await page.mouse.click(point.x, point.y);
  await page.keyboard.up('Control');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.evaluate(async () => {
    const { useWorkspaceStore } = await import(
      new URL('src/store/workspace.store.ts', location.href).href
    );
    useWorkspaceStore.getState().controller.invoke('openGraphTab');
  });
  const next = await selectFirst(page);
  await page.mouse.move(next.x, next.y);
  await page.waitForTimeout(100);
  await page.mouse.click(next.x, next.y, { button: 'middle' });
  await expect(page.locator('#pageTitle')).toBeVisible();
  expect(errors).toEqual([]);
});

test('search, keyboard access, zoom, resize and both themes work with canvas', async ({
  page,
}, testInfo) => {
  await openGraph(page, 32);
  const label = page.getByLabel('Zoom level');
  const before = await label.textContent();
  await page.locator('[data-graph-zoom-in]').click();
  await expect(label).not.toHaveText(before!);
  await page.getByLabel('Fit graph', { exact: true }).click();
  await page.getByLabel('Filter notes').fill('Example');
  await page.locator('[data-graph-canvas]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-graph-canvas]')).toHaveAttribute(
    'aria-label',
    /Selected:.*Example/i,
  );
  for (const theme of ['light', 'dark']) {
    await page.evaluate(async (theme) => {
      const { useWorkspaceStore } = await import(
        new URL('src/store/workspace.store.ts', location.href).href
      );
      for (let i = 0; i < 3 && useWorkspaceStore.getState().ui.theme !== theme; i++)
        useWorkspaceStore.getState().controller.invoke('cycleTheme');
    }, theme);
    await page.getByLabel('Filter notes').fill('');
    await page.getByLabel('Fit graph', { exact: true }).click();
    await page.waitForTimeout(100);
    await page
      .locator('#graphView')
      .screenshot({ path: testInfo.outputPath(`force-graph-${theme}.png`) });
  }
  await page.setViewportSize({ width: 1100, height: 740 });
  await expect
    .poll(async () =>
      page.locator('[data-graph-canvas]').evaluate((host) => {
        const canvas = host.querySelector('canvas')!;
        return Math.abs(canvas.getBoundingClientRect().width - host.getBoundingClientRect().width);
      }),
    )
    .toBeLessThan(2);
  await page.locator('[data-graph-canvas]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#pageTitle')).toBeVisible();
});

test('library data is isolated and disposal removes its canvas', async ({ page }) => {
  await openGraph(page);
  const result = await page.evaluate(async () => {
    const { GraphScene } = await import(
      new URL('src/features/graph/services/scene.ts', location.href).href
    );
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:600px;height:400px';
    document.body.append(host);
    const nodes = [
      {
        id: 'a',
        title: '<img src=x onerror=alert(1)>',
        current: false,
        degree: 1,
        parentId: null,
        childCount: 1,
        depth: 0,
        rootId: 'a',
      },
      {
        id: 'b',
        title: 'Child',
        current: false,
        degree: 1,
        parentId: 'a',
        childCount: 0,
        depth: 1,
        rootId: 'a',
      },
    ];
    const model = { nodes, edges: [{ source: 'a', target: 'b', kind: 'hierarchy' }] };
    const baseline = JSON.stringify(model);
    for (const node of nodes) Object.freeze(node);
    Object.freeze(model.edges[0]);
    const labels: string[] = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      labels.push(text);
      original.call(this, text, ...args);
    };
    const scene = new GraphScene(host, () => {}, null);
    scene.setActive(true);
    scene.setGraph(model);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const unchanged = JSON.stringify(model) === baseline;
    scene.setActive(false);
    scene.dispose();
    CanvasRenderingContext2D.prototype.fillText = original;
    const removed = !host.querySelector('canvas');
    host.remove();
    return { unchanged, removed, labels: labels.includes('Child') };
  });
  expect(result).toEqual({ unchanged: true, removed: true, labels: true });
});

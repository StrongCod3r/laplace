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

test('the graph starts fitted and preserves its camera after navigation and cooling', async ({
  page,
}) => {
  await openGraph(page, 32);
  const label = page.getByLabel('Zoom level');
  await expect(label).not.toHaveText('100%');
  await page.locator('[data-graph-zoom-out]').click();
  const adjustedZoom = await label.textContent();
  await page.evaluate(async () => {
    const { useWorkspaceStore } = await import(
      new URL('src/store/workspace.store.ts', location.href).href
    );
    const controller = useWorkspaceStore.getState().controller;
    controller.invoke('openPage', controller.getDocument().pages[0].id, { newTab: true });
  });
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.locator('[data-ribbon-action="graph"]').click();
  await expect(label).toHaveText(adjustedZoom!);
  await page.evaluate(async () => {
    const { useWorkspaceStore } = await import(
      new URL('src/store/workspace.store.ts', location.href).href
    );
    await useWorkspaceStore.getState().controller.flush();
  });
  await page.reload();
  await expect(page.locator('[data-graph-canvas] canvas')).toBeVisible();
  const zoomLevels = await page.getByLabel('Zoom level').evaluate(async (label) => {
    // The first tick fits the warmed layout before painting it.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const levels = new Set([label.textContent]);
    for (let frame = 0; frame < 260; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      levels.add(label.textContent);
    }
    return [...levels];
  });
  expect(zoomLevels).toHaveLength(1);
  expect(zoomLevels[0]).toMatch(/^\d+%$/);
  expect(zoomLevels[0]).not.toBe('100%');
});

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
  await page.locator('#tabsScroll .editor-tab.active [data-tab-close]').click();
  await expect(page.locator('#graphView')).toBeVisible();
  await expect(page.locator('#tabsScroll .editor-tab.active')).toContainText('Graph');
  expect(errors).toEqual([]);
});

test('double-click focuses a node without opening it or zooming on the background', async ({
  page,
}) => {
  await openGraph(page, 16);
  const center = await selectFirst(page);
  const zoom = page.getByLabel('Zoom level');
  const host = page.locator('[data-graph-canvas]');
  const bounds = (await host.boundingBox())!;
  // Move the selected node away from the center by panning the background.
  await page.mouse.move(bounds.x + 20, bounds.y + 20);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 100, bounds.y + 60, { steps: 8 });
  await page.mouse.up();
  await page.mouse.move(center.x + 80, center.y + 40);
  const tooltip = host.locator('.float-tooltip-kap');
  await expect(tooltip).toBeVisible();
  const title = await tooltip.textContent();
  await page.mouse.dblclick(center.x + 80, center.y + 40);
  await expect(zoom).toHaveText('250%');
  await expect(page.locator('#graphView')).toBeVisible();
  // The same node must now be under the viewport center.
  await page.mouse.move(center.x, center.y);
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText(title!);
  await page.locator('[data-graph-zoom-in]').click();
  await expect(zoom).toHaveText('300%');
  await page.mouse.dblclick(center.x, center.y);
  await expect(zoom).toHaveText('300%');
  await page.mouse.dblclick(bounds.x + 15, bounds.y + 15);
  await expect(zoom).toHaveText('300%');
});

test('clicking inside a family circle centers and fits the group', async ({ page }) => {
  await page.goto('/laplace/');
  const result = await page.evaluate(async () => {
    const { GraphScene } = await import(
      new URL('src/features/graph/services/scene.ts', location.href).href
    );
    const { createFamilyRegions } = await import(
      new URL('src/features/graph/services/family-regions.ts', location.href).href
    );
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;width:600px;height:400px;z-index:9999';
    document.body.append(host);
    let opened = 0;
    const scene = new GraphScene(host, () => opened++, null);
    // Keep this fixture stationary so camera assertions use exact geometry.
    const graph = scene.graph;
    graph.warmupTicks(0).cooldownTicks(0);
    scene.setActive(true);
    scene.setGraph({
      nodes: [0, 1, 2].map((i) => ({
        id: String(i),
        title: `Note ${i}`,
        parentId: i === 1 ? '0' : null,
        rootId: i === 1 ? '0' : String(i),
        current: false,
        degree: i < 2 ? 1 : 0,
        childCount: i === 0 ? 1 : 0,
        depth: i === 1 ? 1 : 0,
        x: i * 300,
        y: 0,
      })),
      edges: [{ source: '0', target: '1', kind: 'hierarchy' }],
    });
    scene.fit();
    const region = createFamilyRegions(graph.graphData().nodes)[0];
    const before = graph.zoom();
    const canvas = host.querySelector('canvas')!;
    const click = async (x: number, y: number) => {
      const point = graph.graph2ScreenCoords(x, y);
      const options = { clientX: point.x, clientY: point.y, bubbles: true, pointerId: 1 };
      canvas.dispatchEvent(new PointerEvent('pointermove', options));
      await new Promise((resolve) => setTimeout(resolve, 50));
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...options, buttons: 1 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', options));
      await new Promise((resolve) => setTimeout(resolve, 350));
    };
    try {
      await click(region.x, region.y + region.radius - 10);
      const center = graph.centerAt();
      const focused = graph.zoom();
      const centered = Math.hypot(center.x - region.x, center.y - region.y) < 0.1;
      const fits = region.radius * 2 * focused <= host.clientHeight - 99;
      // Outside the circle and at least ten graph units beyond its edge.
      await click(region.x, region.y + region.radius + 15);
      const unchanged = Math.abs(graph.zoom() - focused) < 0.001;
      return { centered, fits, zoomedIn: focused > before, unchanged, opened };
    } finally {
      scene.dispose();
      host.remove();
    }
  });
  expect(result).toEqual({
    centered: true,
    fits: true,
    zoomedIn: true,
    unchanged: true,
    opened: 0,
  });
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
    let dashedCircles = 0;
    let drawingCircle = false;
    const originalArc = CanvasRenderingContext2D.prototype.arc;
    const originalStroke = CanvasRenderingContext2D.prototype.stroke;
    CanvasRenderingContext2D.prototype.arc = function (...args) {
      drawingCircle = args[2] > 30;
      originalArc.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.stroke = function (path?: Path2D) {
      if (drawingCircle && this.getLineDash().length) dashedCircles++;
      drawingCircle = false;
      const stroke = originalStroke.bind(this);
      if (path) stroke(path);
      else stroke();
    };
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
    CanvasRenderingContext2D.prototype.arc = originalArc;
    CanvasRenderingContext2D.prototype.stroke = originalStroke;
    const removed = !host.querySelector('canvas');
    host.remove();
    return { unchanged, removed, labels: labels.includes('Child'), circles: dashedCircles > 0 };
  });
  expect(result).toEqual({ unchanged: true, removed: true, labels: true, circles: true });
});

test('overlapping families separate without distorting groups or moving the dragged node', async ({
  page,
}) => {
  await page.goto('/laplace/');
  const result = await page.evaluate(async () => {
    const { separateGraphFamilies } = await import(
      new URL('src/features/graph/services/family-collision.ts', location.href).href
    );
    const { createFamilyRegions } = await import(
      new URL('src/features/graph/services/family-regions.ts', location.href).href
    );
    const nodes = Array.from({ length: 20 }, (_, family) =>
      Array.from({ length: 3 }, (_, member) => ({
        id: `${family}-${member}`,
        rootId: `${family}-0`,
        title: `Family ${family}`,
        current: false,
        degree: 2,
        childCount: member === 0 ? 2 : 0,
        parentId: member === 0 ? null : `${family}-0`,
        depth: member === 0 ? 0 : 1,
        x: member * (family + 10),
        y: member * 12,
        vx: 0,
        vy: 0,
        fx: family === 0 && member === 0 ? 0 : undefined,
        fy: family === 0 && member === 0 ? 0 : undefined,
      })),
    ).flat();
    const original = structuredClone(nodes);
    const gap = () => {
      const circles: { x: number; y: number; radius: number }[] = createFamilyRegions(nodes);
      return Math.min(
        ...circles.flatMap((a, i) =>
          circles.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius),
        ),
      );
    };
    separateGraphFamilies(nodes);
    const initialGap = gap();
    const rigid = nodes.every((node, i) => {
      const root = nodes[Math.floor(i / 3) * 3];
      const oldRoot = original[Math.floor(i / 3) * 3];
      return (
        Math.abs(node.x - root.x - (original[i].x - oldRoot.x)) < 0.001 &&
        Math.abs(node.y - root.y - (original[i].y - oldRoot.y)) < 0.001
      );
    });
    // Expanding the dragged family must also clear all neighboring circles.
    nodes[0].x = nodes[0].fx = 200;
    nodes[0].y = nodes[0].fy = 200;
    separateGraphFamilies(nodes);
    return {
      initialGap,
      draggedGap: gap(),
      rigid,
      pinned: nodes[0].x === 200 && nodes[0].y === 200,
      velocities: nodes.every((node) => node.vx === 0 && node.vy === 0),
    };
  });
  expect(result.initialGap).toBeGreaterThan(0);
  expect(result.draggedGap).toBeGreaterThan(0);
  expect(result.rigid).toBe(true);
  expect(result.pinned).toBe(true);
  expect(result.velocities).toBe(true);
});

import { expect, test, type Page } from '@playwright/test';

async function documentState(page: Page) {
  return page.evaluate(async () => {
    const module = await import(new URL('src/store/workspace.store.ts', location.href).href);
    const controller = module.useWorkspaceStore.getState().controller;
    if (!(await controller.flush())) throw new Error('Workspace save failed.');
    return controller.getDocument();
  });
}

test('new local workspaces stay empty after reload and preserve explicitly created Untitled notes', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      value: async () =>
        (await navigator.storage.getDirectory()).getDirectoryHandle('Empty workspace', {
          create: true,
        }),
    });
  });
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toHaveText('Getting Started');
  await page.locator('#chooseDirectoryBtn').click();
  await expect(page.locator('#workspaceSelect')).not.toHaveValue('browser');
  const localId = await page.locator('#workspaceSelect').inputValue();
  const empty = await documentState(page);
  expect(empty.pages).toEqual([]);
  expect(empty.openTabs).toEqual([]);
  await expect(page.locator('#pageTree .page-tree-row')).toHaveCount(0);
  await expect(page.locator('#homeView')).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const root = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('Empty workspace');
      const files = [];
      for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys())
        if (name.endsWith('.md')) files.push(name);
      return files;
    }),
  ).toEqual([]);
  await page.reload();
  await expect(page.locator('#workspaceSelect')).toHaveValue(localId);
  await expect(page.locator('#homeView')).toBeVisible();
  expect((await documentState(page)).pages).toEqual([]);
  await page.locator('#newPageBtn').click();
  await expect(page.locator('#pageTitle')).toHaveText('Untitled');
  await page.locator('#blockEditor .block-content').first().fill('Created explicitly by the user.');
  expect((await documentState(page)).pages).toHaveLength(1);
  await page.locator('#workspaceSelect').selectOption('browser');
  await expect(page.locator('#pageTitle')).toHaveText('Getting Started');
  await page.locator('#workspaceSelect').selectOption(localId);
  await expect(page.locator('#pageTree')).toContainText('Untitled');
  await page.reload();
  await page.locator('#pageTree').getByText('Untitled', { exact: true }).click();
  await expect(page.locator('#blockEditor')).toContainText('Created explicitly by the user.');
});

test('blank vault templates contain no automatic note or tab', async ({ page }) => {
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toHaveText('Getting Started');
  const blank = await page.evaluate(async () => {
    const module = await import(new URL('src/store/workspace.store.ts', location.href).href);
    return module.useWorkspaceStore.getState().controller.invoke('makeBlankWorkspace');
  });
  expect(blank.pages).toEqual([]);
  expect(blank.openTabs).toEqual([]);
  expect(blank.currentPageId).toBe('__home__');
  expect(blank.gettingStartedInitialized).toBe(true);
});

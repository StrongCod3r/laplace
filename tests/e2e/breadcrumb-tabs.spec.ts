import { expect, test } from '@playwright/test';

for (const mode of ['main', 'active split', 'inactive split']) {
  const split = mode !== 'main';
  for (const gesture of ['click', 'control', 'meta', 'middle'] as const) {
    test(`breadcrumb ${gesture} opens in ${mode}`, async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('#pageTitle')).toHaveText('Getting Started');
      await page
        .locator('#blockEditor [data-page-block-open="page_getting_started_example"]')
        .click();
      await expect(page.locator('#pageTitle')).toHaveText('Example page');
      if (split) {
        await page.locator('#newPageBtn').click();
        await page.locator('#pageTitle').fill('Other pane');
        await page.locator('.editor-tab').filter({ hasText: 'Example page' }).click();
        await page.keyboard.press('Control+Alt+ArrowRight');
      }
      const groupId = split
        ? await page.locator('.dock-pane.active').getAttribute('data-editor-group')
        : null;
      const pane = page.locator(split ? `.dock-pane[data-editor-group="${groupId}"]` : '#app');
      if (mode === 'inactive split') {
        await page.locator('.dock-pane:not(.active) [data-dock-title]').click();
        await expect(pane).not.toHaveClass(/active/);
      }
      const tabs = pane.locator(split ? '.dock-tab' : '.editor-tab');
      const before = await tabs.count();
      const crumb = pane.locator('[data-crumb-id]').filter({ hasText: 'Getting Started' });
      await page.evaluate(() => {
        window.addEventListener('mousedown', (event) => {
          const target = (event.target as Element).closest('[data-crumb-id]');
          if (target) document.body.dataset.breadcrumbTargetRetained = String(target.isConnected);
        });
      });
      await crumb.click({
        button: gesture === 'middle' ? 'middle' : 'left',
        modifiers: gesture === 'control' ? ['Control'] : gesture === 'meta' ? ['Meta'] : [],
      });
      await expect(pane.locator(split ? '[data-dock-title]' : '#pageTitle')).toHaveText(
        'Getting Started',
      );
      await expect(tabs).toHaveCount(before + (gesture === 'click' ? 0 : 1));
      await expect(page.locator('body')).toHaveAttribute('data-breadcrumb-target-retained', 'true');
      await expect(tabs.filter({ hasText: 'Example page' })).toHaveCount(
        gesture === 'click' ? 0 : 1,
      );
      if (split) {
        await expect(pane).toHaveClass(/active/);
        const otherPane = page.locator('.dock-pane:not(.active)');
        await expect(otherPane.locator('[data-dock-title]')).toHaveText('Other pane');
        await expect(otherPane.locator('.dock-tab')).toHaveCount(1);
      }
    });
  }
}

for (const gesture of ['click', 'control', 'meta', 'middle'] as const) {
  test(`folder breadcrumb ${gesture} works on the first gesture in an inactive pane`, async ({
    page,
  }) => {
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
      const docs = await root.getDirectoryHandle('Docs', { create: true });
      for (const [directory, name, text] of [
        [root, 'Other.md', 'Other pane content.'],
        [docs, 'Docs.md', 'Folder note content.'],
        [docs, 'Child.md', 'Child content.'],
      ] as const) {
        const writer = await (
          await directory.getFileHandle(name, { create: true })
        ).createWritable();
        await writer.write(text);
        await writer.close();
      }
    });
    await page.locator('#chooseDirectoryBtn').click();
    await page
      .locator('#pageTree [data-action="open-page"]')
      .filter({ hasText: /^Other$/ })
      .click();
    const child = page
      .locator('#pageTree [data-action="open-page"]')
      .filter({ hasText: /^Child$/ });
    if (!(await child.isVisible()))
      await page
        .locator('#pageTree [data-folder-path="Docs"] [data-action="toggle-folder"]')
        .click();
    await child.click({ modifiers: ['Control'] });
    await page.keyboard.press('Control+Alt+ArrowRight');
    const groupId = await page.locator('.dock-pane.active').getAttribute('data-editor-group');
    const pane = page.locator(`.dock-pane[data-editor-group="${groupId}"]`);
    await page.locator('.dock-pane:not(.active) [data-dock-title]').click();
    const count = await pane.locator('.dock-tab').count();
    await pane.locator('[data-crumb-folder-path="Docs"]').click({
      button: gesture === 'middle' ? 'middle' : 'left',
      modifiers: gesture === 'control' ? ['Control'] : gesture === 'meta' ? ['Meta'] : [],
    });
    await expect(pane).toHaveClass(/active/);
    await expect(pane.locator('[data-dock-title]')).toHaveText('Docs');
    await expect(pane.locator('.dock-tab')).toHaveCount(count + (gesture === 'click' ? 0 : 1));
    await expect(page.locator('.dock-pane:not(.active) [data-dock-title]')).toHaveText('Other');
    await expect(page.locator('.dock-pane:not(.active) [data-dock-blocks]')).toContainText(
      'Other pane content.',
    );
  });
}

for (const action of ['plain text', 'page options']) {
  test(`${action} works on the first click in an inactive breadcrumb bar`, async ({ page }) => {
    await page.goto('/laplace/');
    await expect(page.locator('#pageTitle')).toHaveText('Getting Started');
    await page.locator('#newPageBtn').click();
    await page.locator('#pageTitle').fill('Other pane');
    await page.locator('.editor-tab').filter({ hasText: 'Getting Started' }).click();
    await page.keyboard.press('Control+Alt+ArrowRight');
    const groupId = await page.locator('.dock-pane.active').getAttribute('data-editor-group');
    const pane = page.locator(`.dock-pane[data-editor-group="${groupId}"]`);
    await page.locator('.dock-pane:not(.active) [data-dock-title]').click();
    await pane
      .locator(
        action === 'plain text' ? '[data-page-plain-text-toggle]' : '[data-page-menu-trigger]',
      )
      .click();
    await expect(pane).toHaveClass(/active/);
    if (action === 'plain text')
      await expect(pane.locator('[data-plain-text-content]')).toBeVisible();
    else await expect(page.locator('#blockMenu [data-command="duplicate-page"]')).toBeVisible();
    await expect(page.locator('.dock-pane:not(.active) [data-dock-title]')).toHaveText(
      'Other pane',
    );
  });
}

test('right-click retains the inactive breadcrumb target through the context-menu event', async ({
  page,
}) => {
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toHaveText('Getting Started');
  await page.locator('#blockEditor [data-page-block-open="page_getting_started_example"]').click();
  await page.locator('#newPageBtn').click();
  await page.locator('#pageTitle').fill('Other pane');
  await page.locator('.editor-tab').filter({ hasText: 'Example page' }).click();
  await page.keyboard.press('Control+Alt+ArrowRight');
  const groupId = await page.locator('.dock-pane.active').getAttribute('data-editor-group');
  const pane = page.locator(`.dock-pane[data-editor-group="${groupId}"]`);
  await page.locator('.dock-pane:not(.active) [data-dock-title]').click();
  await page.evaluate(() => {
    document.addEventListener('contextmenu', (event) => {
      const crumb = (event.target as Element).closest('[data-crumb-id]');
      if (crumb) document.body.dataset.breadcrumbContextTarget = String(crumb.isConnected);
    });
  });
  await pane
    .locator('[data-crumb-id]')
    .filter({ hasText: 'Getting Started' })
    .click({ button: 'right' });
  await expect(pane).toHaveClass(/active/);
  await expect(page.locator('body')).toHaveAttribute('data-breadcrumb-context-target', 'true');
  await expect(pane.locator('[data-dock-title]')).toHaveText('Example page');
});

test('breadcrumb labels and icons still refresh after the parent page changes', async ({
  page,
}) => {
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toHaveText('Getting Started');
  await page.locator('#blockEditor [data-page-block-open="page_getting_started_example"]').click();
  await page
    .locator('#breadcrumbs [data-crumb-id]')
    .filter({ hasText: 'Getting Started' })
    .click({ modifiers: ['Control'] });
  await page.locator('#pageTitle').fill('Renamed parent');
  await page.locator('.editor-tab').filter({ hasText: 'Example page' }).click();
  const parent = page.locator('#breadcrumbs [data-crumb-id]').filter({ hasText: 'Renamed parent' });
  await expect(parent).toBeVisible();
  await expect(page.locator('#breadcrumbs')).not.toContainText('Getting Started');
  await page.locator('[data-ribbon-action="settings"]').click();
  await page.locator('#showBreadcrumbIcons').check();
  await page.locator('#settingsModal [data-close-modal]').click();
  await expect(parent.locator('.crumb-icon')).toBeVisible();
});

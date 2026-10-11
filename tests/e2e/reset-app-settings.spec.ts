import type { WorkspaceDocument } from '../../src/features/workspace/types';
import { expect, test, type Page } from '@playwright/test';

async function documentState(page: Page) {
  return page.evaluate(async () => {
    const url = '/laplace/src/store/workspace.store.ts';
    const { useWorkspaceStore } = await import(url);
    return useWorkspaceStore.getState().controller.getDocument();
  });
}

for (const local of [false, true]) {
  test(
    'resetting preferences preserves the ' +
      (local ? 'local' : 'browser') +
      ' workspace and survives reload',
    async ({ page }) => {
      if (local)
        await page.addInitScript(() => {
          Object.defineProperty(window, 'showDirectoryPicker', {
            configurable: true,
            value: async () =>
              (await navigator.storage.getDirectory()).getDirectoryHandle('Settings test', {
                create: true,
              }),
          });
        });
      await page.goto('/laplace/');
      await expect(page.locator('#pageTitle')).toBeVisible();
      if (local) {
        await page.locator('#chooseDirectoryBtn').click();
        await expect(page.locator('#workspaceSelect')).not.toHaveValue('browser');
        await page.locator('#newPageBtn').click();
      }
      await page.locator('#pageTitle').fill('Preserved note');
      await page.locator('#pageTitle').press('Tab');
      await page
        .locator('#blockEditor .block-content')
        .first()
        .fill('Content survives settings reset.');
      await page.locator('[data-ribbon-action="settings"]').click();
      await expect(page.locator('#exportBtn, #importBtn, #importFile, #resetBtn')).toHaveCount(0);
      const defaults = await documentState(page);
      await page.locator('#themeToggle').click();
      await page.locator('#pageFont').selectOption('georgia');
      await page.locator('#spellcheckEnabled').uncheck();
      await page.locator('#showCustomPageIcons').uncheck();
      await page.locator('#showFilesAndTabIcons').uncheck();
      await page.locator('#showBreadcrumbIcons').check();
      await page.locator('#folderNotesEnabled').uncheck();
      await page.locator('#treeIconSize').evaluate((element: HTMLInputElement) => {
        element.value = '28';
      });
      await page.locator('#treeIconSize').dispatchEvent('input');
      await page.locator('[data-settings-tab="shortcuts"]').click();
      await page.locator('[data-shortcut-action="search"]').click();
      await page.keyboard.press('Alt+k');
      await page.locator('[data-settings-tab="general"]').click();
      const changed = await documentState(page);
      expect(changed.pageFont).toBe('georgia');
      expect(changed.shortcuts.search).toBe('Alt+K');
      const workspaceId = await page.locator('#workspaceSelect').inputValue();
      await page.locator('#resetAppSettingsBtn').click();
      const verify = async (reloaded = false) => {
        const reset = await documentState(page);
        for (const key of [
          'theme',
          'pageFont',
          'treeIconSize',
          'spellcheckEnabled',
          'showCustomPageIcons',
          'showFilesAndTabIcons',
          'showBreadcrumbIcons',
          'folderNotesEnabled',
          'shortcuts',
        ]) {
          expect(reset[key]).toEqual(defaults[key]);
        }
        if (local && reloaded) {
          // Markdown reloads generate fresh block IDs and normalize absent frontmatter.
          const comparablePages = (pages: WorkspaceDocument['pages']) =>
            pages.map(({ frontmatter = [], blocks, ...note }) => ({
              ...note,
              frontmatter,
              blocks: JSON.parse(
                JSON.stringify(blocks, (key, value) => (key === 'id' ? undefined : value)),
              ),
            }));
          expect(comparablePages(reset.pages)).toEqual(comparablePages(changed.pages));
        } else {
          expect(reset.pages).toEqual(changed.pages);
        }
        expect(reset.folders).toEqual(changed.folders);
        expect(reset.openTabs).toEqual(changed.openTabs);
        expect(reset.currentPageId).toBe(changed.currentPageId);
        await expect(page.locator('#workspaceSelect')).toHaveValue(workspaceId);
        await expect(page.locator('#pageTitle')).toHaveText('Preserved note');
        await expect(page.locator('#blockEditor')).toContainText(
          'Content survives settings reset.',
        );
      };
      await verify();
      await expect(page.locator('#pageFont')).toHaveValue('system');
      await expect(page.locator('#treeIconSize')).toHaveValue('14');
      await expect(page.locator('#spellcheckEnabled')).toBeChecked();
      await page.evaluate(async () => {
        const url = '/laplace/src/store/workspace.store.ts';
        const { useWorkspaceStore } = await import(url);
        if (!(await useWorkspaceStore.getState().controller.flush()))
          throw new Error('Save failed');
      });
      await page.reload();
      await expect(page.locator('#pageTitle')).toBeVisible();
      await verify(true);
    },
  );
}

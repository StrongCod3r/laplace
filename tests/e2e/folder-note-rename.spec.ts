import { expect, test, type Page } from '@playwright/test';

async function openFolderNote(page: Page, files: Record<string, string>, path: string) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => navigator.storage.getDirectory(),
    });
  });
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  await page.evaluate(async (files) => {
    const root = await navigator.storage.getDirectory();
    for (const [path, content] of Object.entries(files)) {
      const parts = path.split('/');
      const name = parts.pop()!;
      let directory = root;
      for (const part of parts)
        directory = await directory.getDirectoryHandle(part, { create: true });
      const writer = await (await directory.getFileHandle(name, { create: true })).createWritable();
      await writer.write(content);
      await writer.close();
    }
  }, files);
  await page.locator('#chooseDirectoryBtn').click();
  await page.locator(`[data-folder-path="${path}"] .folder-select-btn`).click();
  await expect(page.locator('#pageTitle')).toHaveText('Original');
}

async function readFiles(page: Page, paths: string[]) {
  return page.evaluate(async (paths) => {
    const root = await navigator.storage.getDirectory();
    return Promise.all(
      paths.map(async (path) => {
        const parts = path.split('/');
        const name = parts.pop()!;
        let directory = root;
        for (const part of parts) directory = await directory.getDirectoryHandle(part);
        return (await (await directory.getFileHandle(name)).getFile()).text();
      }),
    );
  }, paths);
}

for (const parent of ['', 'Notes/Projects/']) {
  test(`renaming a folder note ignores sibling Markdown names in ${parent || 'root'}`, async ({
    page,
  }) => {
    await openFolderNote(
      page,
      {
        [`${parent}Original/Original.md`]: 'Folder note content\n',
        [`${parent}Original/Child.md`]: 'Child content\n',
        [`${parent}Original.md`]: 'Independent original note\n',
        [`${parent}Shared.md`]: 'Independent shared note\n',
      },
      `${parent}Original`,
    );
    const title = page.locator('#pageTitle');
    await title.click();
    await page.locator('#blockEditor .block-content').first().click();
    await expect(title).toHaveText('Original');
    await title.fill('Shared');
    await page.locator('#blockEditor .block-content').first().click();
    await expect(title).toHaveText('Shared');
    await expect(page.locator(`[data-folder-path="${parent}Shared"]`)).toBeVisible();
    const paths = [
      `${parent}Shared/Shared.md`,
      `${parent}Shared/Child.md`,
      `${parent}Original.md`,
      `${parent}Shared.md`,
    ];
    await expect
      .poll(async () => {
        try {
          return await readFiles(page, paths);
        } catch {
          return [];
        }
      })
      .toEqual([
        'Folder note content\n',
        'Child content\n',
        'Independent original note\n',
        'Independent shared note\n',
      ]);
    await page.reload();
    await expect(title).toHaveText('Shared');
    await expect(page.locator(`[data-folder-path="${parent}Shared"]`)).toBeVisible();
    expect(await readFiles(page, paths)).toEqual([
      'Folder note content\n',
      'Child content\n',
      'Independent original note\n',
      'Independent shared note\n',
    ]);
  });
}

for (const docked of [false, true]) {
  test(`folder notes stay hidden as files while typing a title in the ${docked ? 'split' : 'main'} editor`, async ({
    page,
  }) => {
    await openFolderNote(
      page,
      {
        'Original/Original.md': 'Folder note content\n',
        'Original/Child.md': 'Child content\n',
      },
      'Original',
    );
    if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
    const title = page.locator(docked ? '.dock-pane.active [data-dock-title]' : '#pageTitle');
    const root = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
    const pageId = await page.evaluate(async () => {
      const { useWorkspaceStore } = await import(
        new URL('src/store/workspace.store.ts', location.href).href
      );
      const controller = useWorkspaceStore.getState().controller;
      const id = controller.getDocument().currentPageId;
      const tree = document.querySelector('#pageTree')!;
      (window as any).folderNoteFlashed = false;
      const check = () => {
        if (tree.querySelector(`.page-tree-row[data-page-id="${id}"]`))
          (window as any).folderNoteFlashed = true;
      };
      const observer = new MutationObserver(check);
      observer.observe(tree, { subtree: true, childList: true });
      return id;
    });
    await title.fill('Ren');
    await title.pressSequentially('amed', { delay: 30 });
    await expect(title).toHaveText('Renamed');
    await expect(
      page.locator('#pageTree .folder-tree-row[data-folder-path="Original"]'),
    ).toBeVisible();
    await expect(page.locator(`#pageTree .page-tree-row[data-page-id="${pageId}"]`)).toHaveCount(0);
    await expect(
      page.locator('#pageTree .page-tree-row').filter({ hasText: 'Child' }),
    ).toBeVisible();
    await root.locator('.block-content').first().click();
    await expect(
      page.locator('#pageTree .folder-tree-row[data-folder-path="Renamed"]'),
    ).toBeVisible();
    expect(await page.evaluate(() => (window as any).folderNoteFlashed)).toBe(false);
    await expect
      .poll(async () => {
        try {
          return await readFiles(page, ['Renamed/Renamed.md', 'Renamed/Child.md']);
        } catch {
          return [];
        }
      })
      .toEqual(['Folder note content\n', 'Child content\n']);
  });
}

for (const collision of ['folder', 'note']) {
  test(`renaming a folder note still avoids an existing ${collision} at the actual destination`, async ({
    page,
  }) => {
    const conflictPath = collision === 'folder' ? 'Shared/Keep.md' : 'Original/Shared.md';
    await openFolderNote(
      page,
      {
        'Original/Original.md': 'Folder note content\n',
        [conflictPath]: 'Preserve existing content\n',
      },
      'Original',
    );
    await page.locator('#pageTitle').fill('Shared');
    await page.locator('#blockEditor .block-content').first().click();
    await expect(page.locator('#pageTitle')).toHaveText('Shared 1');
    await expect(page.locator('[data-folder-path="Shared 1"]')).toBeVisible();
    const paths = [
      'Shared 1/Shared 1.md',
      collision === 'folder' ? conflictPath : 'Shared 1/Shared.md',
    ];
    await expect
      .poll(async () => {
        try {
          return await readFiles(page, paths);
        } catch {
          return [];
        }
      })
      .toEqual(['Folder note content\n', 'Preserve existing content\n']);
  });
}

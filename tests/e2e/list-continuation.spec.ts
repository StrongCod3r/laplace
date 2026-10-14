import { expect, test, type Page } from '@playwright/test';

async function openList(page: Page, markdown: string) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => navigator.storage.getDirectory(),
    });
  });
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.evaluate(async (text) => {
    const root = await navigator.storage.getDirectory();
    const writer = await (await root.getFileHandle('List.md', { create: true })).createWritable();
    await writer.write(text);
    await writer.close();
  }, markdown);
  await page.locator('#chooseDirectoryBtn').click();
  await page
    .locator('#pageTree [data-action="open-page"]')
    .filter({ hasText: /^List$/ })
    .click();
  await expect(page.locator('#pageTitle')).toHaveText('List');
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
}

async function saveAndReload(page: Page) {
  await page.evaluate(async () => {
    const url = '/laplace/src/store/workspace.store.ts';
    const { useWorkspaceStore } = await import(url);
    if (!(await useWorkspaceStore.getState().controller.flush())) throw new Error('Save failed');
  });
  await page.reload();
  await expect(page.locator('#pageTitle')).toHaveText('List');
}

for (const docked of [false, true]) {
  test(`cutting all text from a list item keeps its height and numbering in ${docked ? 'a docked' : 'the main'} editor`, async ({
    page,
  }) => {
    await openList(page, '1. hola1\n2. hola2\n3. hola3\n');
    if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
    await page.evaluate(async () => {
      const url = new URL('src/store/workspace.store.ts', window.location.href).href;
      const { useWorkspaceStore } = await import(url);
      await useWorkspaceStore.getState().controller.flush();
    });
    const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
    const rows = editor.locator('[data-type="number"]');
    const content = rows.nth(1).locator('.block-content');
    const before = await content.boundingBox();
    await content.click();
    await content.press('Control+a');
    await content.press('Control+x');
    await expect(content).toHaveText('');
    await expect(rows.locator('.list-prefix')).toHaveText(['1.', '2.', '3.']);
    await expect.poll(async () => (await content.boundingBox())!.height).toBe(before!.height);
    await content.press('Control+z');
    await page
      .locator('#pageTree [data-action="open-page"]')
      .filter({ hasText: /^List$/ })
      .click();
    await expect(content).toHaveText('hola2');
    await content.press('Control+Shift+z');
    await page
      .locator('#pageTree [data-action="open-page"]')
      .filter({ hasText: /^List$/ })
      .click();
    await expect(content).toHaveText('');
    await expect.poll(async () => (await content.boundingBox())!.height).toBe(before!.height);
    await content.click();
    await page.keyboard.type('replacement');
    await expect(content).toHaveText('replacement');
  });
}

test('indented intermediate text belongs to its numbered item after Markdown reload', async ({
  page,
}) => {
  await openList(
    page,
    '1. I was falling down the stairs.\n\ttext\n2. He was driving when he had the accident.\n3. It was snowing when we left home.\n',
  );
  const rows = page.locator('#blockEditor [data-type="number"]');
  for (let round = 0; round < 2; round++) {
    await expect(rows).toHaveCount(3);
    await expect(rows.locator('.list-prefix')).toHaveText(['1.', '2.', '3.']);
    await expect(rows.first().locator('.block-content')).toContainText('text');
    await expect(page.locator('#blockEditor [data-type="text"]')).toHaveCount(0);
    expect(
      await rows.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-list-indent')),
      ),
    ).toEqual(['0', '0', '0']);
    if (!round) await saveAndReload(page);
  }
});

test('Enter and Tab add intermediate text while nonempty items can still form sublists', async ({
  page,
}) => {
  await openList(page, '1. First item\n');
  const rows = page.locator('#blockEditor [data-type="number"]');
  const first = rows.first().locator('.block-content');
  await first.click();
  await first.press('End');
  await first.press('Enter');
  await expect(rows.nth(1).locator('.block-content')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(rows).toHaveCount(1);
  await page.keyboard.insertText('Intermediate text');
  await page.keyboard.press('Enter');
  await expect(rows.nth(1).locator('.block-content')).toBeFocused();
  await page.keyboard.insertText('Second item');
  await page.keyboard.press('Enter');
  await expect(rows.nth(2).locator('.block-content')).toBeFocused();
  await page.keyboard.insertText('Third item');
  await expect(rows.locator('.list-prefix')).toHaveText(['1.', '2.', '3.']);
  await first.click();
  await first.press('Control+End');
  await first.press('Shift+Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.insertText('Another continuation');
  await page.keyboard.press('Shift+Tab');
  await expect(rows).toHaveCount(3);
  await expect(first).toContainText('Another continuation');
  await rows.nth(1).locator('.block-content').click();
  await page.keyboard.press('Tab');
  await expect(rows.nth(1)).toHaveAttribute('data-list-indent', '1');
  await page.keyboard.press('Shift+Tab');
  await expect(rows.nth(1)).toHaveAttribute('data-list-indent', '0');
  await saveAndReload(page);
  await expect(rows).toHaveCount(3);
  await expect(rows.locator('.list-prefix')).toHaveText(['1.', '2.', '3.']);
  await expect(first).toContainText('First item');
  await expect(first).toContainText('Intermediate text');
  await expect(first).toContainText('Another continuation');
});

test('one Shift+Enter immediately shows a continuation line and moves the caret', async ({
  page,
}) => {
  await openList(page, '1. First item\n2. **Second item**\n');
  const rows = page.locator('#blockEditor [data-type="number"]');
  for (let index = 0; index < 2; index++) {
    const content = rows.nth(index).locator('.block-content');
    await content.click();
    await content.press('End');
    const before = await content.boundingBox();
    await content.press('Shift+Enter');
    await expect
      .poll(async () => (await content.boundingBox())!.height)
      .toBeGreaterThan(before!.height + 10);
    await expect
      .poll(() =>
        content.evaluate((element) => {
          const selection = window.getSelection();
          if (!selection?.rangeCount || !element.contains(selection.anchorNode)) return -1;
          const range = selection.getRangeAt(0).cloneRange();
          range.selectNodeContents(element);
          range.setEnd(selection.anchorNode!, selection.anchorOffset);
          return range.toString().length;
        }),
      )
      .toBe('First item'.length + 1 + (index === 1 ? 1 : 0));
    await expect
      .poll(() =>
        content.evaluate(() => {
          const selection = window.getSelection();
          if (!selection?.rangeCount) return -1;
          const range = selection.getRangeAt(0);
          // Chromium reports an empty rectangle for a caret at an element boundary.
          const anchor = range.startContainer.childNodes[range.startOffset];
          return anchor instanceof HTMLBRElement && anchor.hasAttribute('data-caret-placeholder')
            ? anchor.getBoundingClientRect().top
            : -1;
        }),
      )
      .toBeGreaterThan(before!.y + 10);
    await page.keyboard.insertText('Continuation');
    expect(await content.innerText()).toBe(
      (index ? 'Second item' : 'First item') + '\nContinuation',
    );
  }
  await expect(rows.nth(1).locator('strong')).toContainText('Second item');
  await expect(rows).toHaveCount(2);
  await saveAndReload(page);
  await expect(rows).toHaveCount(2);
  await expect(rows.locator('.list-prefix')).toHaveText(['1.', '2.']);
  await expect(rows.first().locator('.block-content')).toHaveText('First item\nContinuation');
});

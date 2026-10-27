import { expect, test, type Page } from '@playwright/test';

async function openSelectionNote(page: Page, docked = false, light = false) {
  await page.setViewportSize({ width: 1600, height: 1100 });
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
    const write = async (folder: FileSystemDirectoryHandle, name: string, text: string) => {
      const stream = await (await folder.getFileHandle(name, { create: true })).createWritable();
      await stream.write(text);
      await stream.close();
    };
    await write(
      attachments,
      'small.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect width="64" height="32" fill="purple"/></svg>',
    );
    await write(root, 'Target.md', 'The target page must remain intact.\n');
    await write(
      root,
      'Selection.md',
      [
        'Outside before',
        'First selected',
        '![[small.svg]]',
        '[[Target]]',
        '```javascript',
        'const selected = true;',
        '```',
        '---',
        'Last selected',
        'Outside after',
        '',
      ].join('\n'),
    );
  });
  await page.locator('#chooseDirectoryBtn').click();
  await page
    .locator('#pageTree [data-action="open-page"]')
    .filter({ hasText: /^Selection$/ })
    .click();
  await page.locator('[data-ribbon-action="settings"]').click();
  await page.locator('#themeToggle').click();
  if (!light) await page.locator('#themeToggle').click();
  await page.locator('#settingsModal [data-close-modal]').click();
  if (light) await expect(page.locator('body')).not.toHaveClass(/dark/);
  else await expect(page.locator('body')).toHaveClass(/dark/);
  if (docked) {
    await page
      .locator('#pageTree [data-action="open-page"]')
      .filter({ hasText: /^Target$/ })
      .click({ modifiers: ['Control'] });
    await page
      .locator('#pageTree [data-action="open-page"]')
      .filter({ hasText: /^Selection$/ })
      .click();
    await page.keyboard.press('Control+Alt+ArrowRight');
  }
  const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
  await expect(editor.locator(':scope > .block-row')).toHaveCount(8);
  await expect(editor.locator('img')).toBeVisible();
  return editor;
}

for (const docked of [false, true]) {
  for (const mode of ['native', 'drag']) {
    test(`mixed text selection highlights nontext blocks (${mode}, ${docked ? 'split' : 'main'})`, async ({
      page,
    }) => {
      const editor = await openSelectionNote(page, docked);
      const expected = await editor
        .locator('.image-block,.page-link-block,.code-block,[data-type="divider"]')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-block-id')));
      if (mode === 'native') {
        await editor.evaluate((root) => {
          const contents = [...root.querySelectorAll('.block-content')];
          const first = contents.find((content) => content.textContent === 'First selected')!;
          const last = contents.find((content) => content.textContent === 'Last selected')!;
          (first as HTMLElement).focus();
          const range = document.createRange();
          range.setStart(first, 0);
          range.setEnd(last, last.childNodes.length);
          window.getSelection()!.removeAllRanges();
          window.getSelection()!.addRange(range);
        });
      } else {
        const first = (await editor
          .locator('.block-content')
          .filter({ hasText: /^First selected$/ })
          .boundingBox())!;
        const last = (await editor
          .locator('.block-content')
          .filter({ hasText: /^Last selected$/ })
          .boundingBox())!;
        await page.mouse.move(first.x + 1, first.y + first.height / 2);
        await page.mouse.down();
        await page.mouse.move(last.x + last.width - 1, last.y + last.height / 2, { steps: 12 });
        await page.mouse.up();
      }
      await expect(page.locator('#multiBlockSelectionLayer [data-selected-block-id]')).toHaveCount(
        4,
      );
      expect(
        await page
          .locator('#multiBlockSelectionLayer [data-selected-block-id]')
          .evaluateAll((marks) => marks.map((mark) => mark.getAttribute('data-selected-block-id'))),
      ).toEqual(expected);
      await page.keyboard.press('Escape');
      await expect(page.locator('#multiBlockSelectionLayer > *')).toHaveCount(0);
    });
  }
  for (const light of [false, true]) {
    test(`rectangle selects mixed blocks and supports undo (${light ? 'light' : 'dark'}, ${docked ? 'split' : 'main'})`, async ({
      page,
    }, testInfo) => {
      const editor = await openSelectionNote(page, docked, light);
      const rows = editor.locator(':scope > .block-row');
      const originalIds = await rows.evaluateAll((rows) =>
        rows.map((row) => row.getAttribute('data-block-id')),
      );
      const root = (await editor.boundingBox())!;
      const first = (await rows.nth(1).boundingBox())!;
      const last = (await rows.nth(6).boundingBox())!;
      await page.mouse.move(root.x - 12, first.y - 1);
      await page.mouse.down();
      await page.mouse.move(root.x + root.width - 5, last.y + last.height - 1, { steps: 16 });
      await expect(page.locator('[data-block-selection-box]')).toBeVisible();
      await expect(page.locator('#multiBlockSelectionLayer [data-selected-block-id]')).toHaveCount(
        6,
      );
      expect(
        await page
          .locator('#multiBlockSelectionLayer [data-selected-block-id]')
          .evaluateAll((marks) => marks.map((mark) => mark.getAttribute('data-selected-block-id'))),
      ).toEqual(originalIds.slice(1, 7));
      await page.screenshot({ path: testInfo.outputPath('rectangle.png') });
      await page.mouse.up();
      await expect(page.locator('[data-block-selection-box]')).toHaveCount(0);
      await expect(page.locator('#multiBlockSelectionLayer [data-selected-block-id]')).toHaveCount(
        6,
      );
      await page.keyboard.press('Delete');
      await expect(rows).toHaveCount(2);
      await expect(editor.locator('.block-content')).toHaveText([
        'Outside before',
        'Outside after',
      ]);
      await page.keyboard.press('Control+z');
      await expect(rows).toHaveCount(8);
      expect(
        await rows.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-block-id'))),
      ).toEqual(originalIds);
      await page.keyboard.press('Control+Shift+z');
      await expect(rows).toHaveCount(2);
      await expect(page.locator('#pageTree')).toContainText('Target');
    });
  }
  test(`rectangle starting on an image selects only nontext blocks (${docked ? 'split' : 'main'})`, async ({
    page,
  }) => {
    const editor = await openSelectionNote(page, docked);
    const rows = editor.locator(':scope > .block-row');
    const image = (await editor.locator('.image-preview img').boundingBox())!;
    const link = (await editor.locator('.page-link-block').boundingBox())!;
    await page.mouse.move(image.x + image.width / 2, image.y + image.height / 2);
    await page.mouse.down();
    await page.mouse.move(link.x + link.width - 4, link.y + link.height - 2, { steps: 12 });
    await page.mouse.up();
    await expect(page.locator('#multiBlockSelectionLayer [data-selected-block-id]')).toHaveCount(2);
    await page.keyboard.press('Backspace');
    await expect(rows).toHaveCount(6);
    await expect(editor.locator('.image-block,.page-link-block')).toHaveCount(0);
    await expect(editor.locator('.code-block')).toHaveCount(1);
    await page.keyboard.press('Control+z');
    await expect(rows).toHaveCount(8);
  });
}

test('rectangle drag from a page link does not navigate and Escape cancels', async ({ page }) => {
  const editor = await openSelectionNote(page);
  const link = (await editor.locator('[data-page-link-open]').boundingBox())!;
  const image = (await editor.locator('.image-block').boundingBox())!;
  await page.mouse.move(link.x + 20, link.y + link.height / 2);
  await page.mouse.down();
  await page.mouse.move(image.x + image.width - 5, image.y + 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('#pageTitle')).toHaveText('Selection');
  await expect(page.locator('#multiBlockSelectionLayer [data-selected-block-id]')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('#multiBlockSelectionLayer > *')).toHaveCount(0);
  await expect(editor.locator(':scope > .block-row')).toHaveCount(8);
  await editor.locator('[data-page-link-open]').click();
  await expect(page.locator('#pageTitle')).toHaveText('Target');
});

test('Escape cancels an in-progress rectangle without adding a trailing block', async ({
  page,
}) => {
  const editor = await openSelectionNote(page);
  const root = (await editor.boundingBox())!;
  await page.mouse.move(root.x - 12, root.y - 1);
  await page.mouse.down();
  await page.mouse.move(root.x + root.width - 10, root.y + root.height + 30, { steps: 12 });
  await expect(page.locator('[data-block-selection-box]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#multiBlockSelectionLayer > *')).toHaveCount(0);
  await page.mouse.up();
  await expect(editor.locator(':scope > .block-row')).toHaveCount(8);
});

test('a rectangle outside the blocks does not snap to nearby text', async ({ page }) => {
  const editor = await openSelectionNote(page);
  const root = (await editor.boundingBox())!;
  await page.mouse.move(root.x - 60, root.y + 5);
  await page.mouse.down();
  await page.mouse.move(root.x - 55, root.y + root.height - 5, { steps: 12 });
  await expect(page.locator('[data-block-selection-box]')).toBeVisible();
  await expect(page.locator('#multiBlockSelectionLayer [data-selected-block-id]')).toHaveCount(0);
  await page.mouse.up();
  await page.keyboard.press('Delete');
  await expect(editor.locator(':scope > .block-row')).toHaveCount(8);
});

test('formatting rectangle-selected text retains nontext block selection', async ({ page }) => {
  const editor = await openSelectionNote(page);
  const first = (await editor.locator(':scope > .block-row').nth(1).boundingBox())!;
  const last = (await editor.locator(':scope > .block-row').nth(6).boundingBox())!;
  await page.mouse.move(first.x - 12, first.y - 1);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width - 5, last.y + last.height - 1, { steps: 12 });
  await page.mouse.up();
  await page.locator('#textFormatToolbar [data-format-inline="bold"]').click();
  await expect(editor.locator('[data-inline-format="bold"]')).toHaveText([
    'First selected',
    'Last selected',
  ]);
  await expect(page.locator('#multiBlockSelectionLayer [data-selected-block-id]')).toHaveCount(6);
  await page.locator('#textFormatToolbar [data-format-inline="italic"]').click();
  await expect(editor.locator('[data-inline-format="italic"]')).toHaveText([
    'First selected',
    'Last selected',
  ]);
  await expect(page.locator('#multiBlockSelectionLayer [data-selected-block-id]')).toHaveCount(6);
});

for (const docked of [false, true]) {
  test(`rectangle auto-scroll retains selected blocks and clips highlights (${docked ? 'split' : 'main'})`, async ({
    page,
  }) => {
    const editor = await openSelectionNote(page, docked);
    await editor
      .locator('.block-content')
      .last()
      .evaluate((content) => {
        const data = new DataTransfer();
        data.setData(
          'text/html',
          Array.from({ length: 45 }, (_, index) => `<p>Row ${index}</p>`).join(''),
        );
        content.dispatchEvent(
          new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
        );
      });
    const scroller = editor
      .locator('xpath=ancestor::*[contains(@class,"dock-scroll") or @id="editorView"]')
      .first();
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
    });
    const before = await editor.locator(':scope > .block-row').count();
    const first = (await editor.locator(':scope > .block-row').nth(1).boundingBox())!;
    const viewport = (await scroller.boundingBox())!;
    await page.mouse.move(first.x - 12, first.y - 1);
    await page.mouse.down();
    await page.mouse.move(first.x + first.width - 5, viewport.y + viewport.height - 4, {
      steps: 12,
    });
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(140);
    await page.mouse.up();
    const copied = await page.evaluate(() => {
      const data = new DataTransfer();
      document.activeElement!.dispatchEvent(
        new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: data }),
      );
      return data.getData('text/plain');
    });
    expect(copied).toContain('First selected');
    expect(copied).toContain('const selected = true;');
    expect(copied).toMatch(/\[\[Target(?:\|Target)?\]\]/);
    const rect = (await scroller.boundingBox())!;
    for (const mark of await page
      .locator('#multiBlockSelectionLayer [data-selected-block-id]')
      .all()) {
      const box = (await mark.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(rect.y);
      expect(box.y + box.height).toBeLessThanOrEqual(rect.y + rect.height + 1);
    }
    await page.keyboard.press('Delete');
    await expect(editor.locator(':scope > .block-row')).not.toHaveCount(before);
    await page.keyboard.press('Control+z');
    await expect(editor.locator(':scope > .block-row')).toHaveCount(before);
  });
}

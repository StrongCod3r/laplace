import { expect, test, type Page } from '@playwright/test';

async function openNote(page: Page, docked: boolean) {
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  await page.locator('#newPageBtn').click();
  await page.locator('#pageTitle').fill('Other note');
  await page.locator('#blockEditor .block-content').first().fill('Other pane text');
  await page.locator('#newPageBtn').click();
  await page.locator('#pageTitle').fill('Current note');
  await page
    .locator('#blockEditor .block-content')
    .first()
    .evaluate((element) => {
      const data = new DataTransfer();
      data.setData(
        'text/html',
        '<p>Alpha content</p><pre><code>const value = 1;</code></pre><table><tr><th>Column</th></tr><tr><td>Cell value</td></tr></table><p>Omega content</p>',
      );
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });
  if (docked) {
    await page.getByRole('button', { name: 'Close Getting Started', exact: true }).click();
    await page.keyboard.press('Control+Alt+ArrowRight');
  }
  const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
  await expect(editor.locator(':scope > .block-row')).toHaveCount(4);
  return editor;
}

for (const docked of [false, true]) {
  test(`Ctrl+A selects only the current note in ${docked ? 'a split pane' : 'the main editor'}`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const editor = await openNote(page, docked);
    const first = editor.locator('.block-content').first();
    await first.click({ position: { x: 3, y: 8 } });
    await first.press('Control+a');
    expect(
      await editor.evaluate((element) => {
        const selection = window.getSelection();
        return (
          !!selection?.rangeCount &&
          element.contains(selection.getRangeAt(0).commonAncestorContainer)
        );
      }),
    ).toBe(true);
    await page.keyboard.press('Control+c');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    for (const text of ['Alpha content', 'Omega content', 'const value = 1;', 'Cell value'])
      expect(copied).toContain(text);
    for (const text of ['Other pane text', 'Current note', 'Files', 'Favorites'])
      expect(copied).not.toContain(text);
    await page.keyboard.press('Delete');
    await expect(editor.locator(':scope > .block-row')).toHaveCount(1);
    await expect(editor.locator('.block-content')).toHaveText('');
    await editor.locator('.block-content').press('Control+z');
    await expect(editor.locator(':scope > .block-row')).toHaveCount(4);
    await expect(editor).toContainText('Alpha content');
    await expect(editor).toContainText('Omega content');
    if (docked)
      await expect(page.locator('.dock-pane:not(.active) [data-dock-blocks]')).toContainText(
        'Other pane text',
      );
  });

  test(`Ctrl+A is scoped to plain text in ${docked ? 'a split pane' : 'the main editor'}`, async ({
    page,
  }) => {
    const editor = await openNote(page, docked);
    const bar = page.locator(docked ? '.dock-pane.active .dock-breadcrumbs' : '#breadcrumbs');
    await bar.locator('[data-page-plain-text-toggle]').click();
    const source = editor.locator('..').locator('[data-plain-text-content]');
    await expect(source).toBeVisible();
    await bar.locator('[data-page-menu-trigger]').focus();
    await page.keyboard.press('Control+a');
    expect(
      await source.evaluate((element) => {
        const selection = window.getSelection();
        return (
          !!selection?.rangeCount &&
          element.contains(selection.getRangeAt(0).commonAncestorContainer)
        );
      }),
    ).toBe(true);
    const selected = await page.evaluate(() => window.getSelection()!.toString());
    expect(selected).toContain('Alpha content');
    expect(selected).toContain('Omega content');
    expect(selected).not.toContain('Other pane text');
    expect(selected).not.toContain('Files');
  });
}

test('Ctrl+A retains local selection in titles, code editors and table cells', async ({ page }) => {
  const editor = await openNote(page, false);
  const title = page.locator('#pageTitle');
  await title.click();
  await title.press('Control+a');
  expect(await page.evaluate(() => window.getSelection()!.toString())).toBe('Current note');
  const code = editor.locator('[data-code-editor]');
  await code.click();
  await code.press('Control+a');
  expect(
    await code.evaluate((element: HTMLTextAreaElement) =>
      element.value.slice(element.selectionStart, element.selectionEnd),
    ),
  ).toBe('const value = 1;');
  const cell = editor.locator('[data-table-cell="1:0"]');
  await cell.click();
  await cell.press('Control+a');
  expect(await page.evaluate(() => window.getSelection()!.toString())).toBe('Cell value');
});

test('typing after selecting a page replaces its contents in one undo operation', async ({
  page,
}) => {
  const editor = await openNote(page, false);
  const content = editor.locator('.block-content').first();
  await content.click({ position: { x: 3, y: 8 } });
  await content.press('Control+a');
  await page.keyboard.type('Replacement');
  await expect(editor.locator(':scope > .block-row')).toHaveCount(1);
  await expect(content).toHaveText('Replacement');
  await content.press('Control+z');
  await expect(editor.locator(':scope > .block-row')).toHaveCount(4);
  await expect(editor).toContainText('Alpha content');
  await expect(editor).toContainText('Omega content');
});

test('pasting after selecting a page replaces its contents and supports undo', async ({ page }) => {
  const editor = await openNote(page, false);
  const content = editor.locator('.block-content').first();
  await content.click({ position: { x: 3, y: 8 } });
  await content.press('Control+a');
  await content.evaluate((element) => {
    const data = new DataTransfer();
    data.setData('text/html', '<p>Replacement one</p><p>Replacement two</p>');
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  });
  await expect(editor.locator(':scope > .block-row')).toHaveCount(2);
  await expect(editor).toContainText('Replacement one');
  await expect(editor).toContainText('Replacement two');
  await content.press('Control+z');
  await expect(editor.locator(':scope > .block-row')).toHaveCount(4);
  await expect(editor).toContainText('Alpha content');
  await expect(editor).toContainText('Omega content');
});

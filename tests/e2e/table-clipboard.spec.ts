import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ baseURL: 'http://127.0.0.1:4176' });

async function openTableNote(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => navigator.storage.getDirectory(),
    });
  });
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory();
    const file = await directory.getFileHandle('Clipboard.md', { create: true });
    const writer = await file.createWritable();
    await writer.write(
      '| Source | Destination |\n| --- | --- |\n| First<br>Second<br><br>Fourth | Keep |\n| Below | Unchanged |\n\nPaste here\n',
    );
    await writer.close();
  });
  await page.locator('#chooseDirectoryBtn').click();
  await page
    .locator('#pageTree [data-action="open-page"]')
    .filter({ hasText: /^Clipboard$/ })
    .click();
  await expect(page.locator('#blockEditor [data-table-cell="1:0"]')).toBeVisible();
}

async function selectContents(element: Locator) {
  await element.evaluate((node) => {
    (node as HTMLElement).focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

async function paste(element: Locator, plain: string, html = '') {
  await selectContents(element);
  await element.evaluate(
    (node, payload) => {
      const data = new DataTransfer();
      data.setData('text/plain', payload.plain);
      if (payload.html) data.setData('text/html', payload.html);
      node.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    },
    { plain, html },
  );
}

async function readNote(page: Page) {
  return page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory();
    return (await (await directory.getFileHandle('Clipboard.md')).getFile()).text();
  });
}

test('copying multiline text from one cell pastes into one cell without expanding the table', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openTableNote(page);
  const table = page.locator('#blockEditor .simple-table-block').first();
  const source = table.locator('[data-table-cell="1:0"]');
  const destination = table.locator('[data-table-cell="1:1"]');
  await selectContents(source);
  await source.press('Control+c');
  await selectContents(destination);
  await destination.press('Control+v');
  await expect.poll(() => destination.innerText()).toBe('First\nSecond\n\nFourth');
  await expect(table.locator('[data-table-cell]')).toHaveCount(6);
  await expect(table.locator('[data-table-cell="2:0"]')).toHaveText('Below');
  await expect(table.locator('[data-table-cell="2:1"]')).toHaveText('Unchanged');
  await page.locator('#pageTitle').click();
  await expect
    .poll(() => readNote(page))
    .toContain('| First<br>Second<br><br>Fourth | First<br>Second<br><br>Fourth |');
  await page.reload();
  await expect.poll(() => destination.innerText()).toBe('First\nSecond\n\nFourth');
  await page.evaluate(() =>
    navigator.clipboard.writeText('Plain first\nPlain second\n\nPlain fourth'),
  );
  await selectContents(destination);
  await destination.press('Control+v');
  await expect
    .poll(() => destination.innerText())
    .toBe('Plain first\nPlain second\n\nPlain fourth');
  await expect(table.locator('[data-table-cell]')).toHaveCount(6);
});

test('copying cell ranges and complete tables exports HTML with explicit cell breaks', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openTableNote(page);
  const table = page.locator('#blockEditor .simple-table-block').first();
  const start = await table.locator('[data-table-cell="1:0"]').boundingBox();
  const end = await table.locator('[data-table-cell="1:1"]').boundingBox();
  await page.mouse.move(start!.x + 8, start!.y + 8);
  await page.mouse.down();
  await page.mouse.move(end!.x + 8, end!.y + 8, { steps: 8 });
  await page.mouse.up();
  await expect(table.locator('.cell-range-selected')).toHaveCount(2);
  await page.keyboard.press('Control+c');
  const content = page.locator('#blockEditor [data-type="text"] .block-content').last();
  await selectContents(content);
  await content.press('Control+v');
  const rangeTable = page.locator('#blockEditor .simple-table-block').nth(1);
  await expect(rangeTable.locator('[data-table-cell]')).toHaveCount(2);
  await expect
    .poll(() => rangeTable.locator('[data-table-cell="0:0"]').innerText())
    .toBe('First\nSecond\n\nFourth');
  await expect(rangeTable.locator('[data-table-cell="0:1"]')).toHaveText('Keep');

  await table.locator('[data-table-corner-select]').click();
  await expect(table).toHaveClass(/table-selected/);
  const html = await table.evaluate((node) => {
    const data = new DataTransfer();
    node.dispatchEvent(
      new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }),
    );
    return data.getData('text/html');
  });
  expect(html).toContain('First<br>Second<br><br>Fourth');
  expect((html.match(/<tr>/g) || []).length).toBe(3);
  await paste(rangeTable.locator('[data-table-cell="0:0"]'), '', html);
  await expect(rangeTable.locator('[data-table-cell]')).toHaveCount(6);
  await expect
    .poll(() => rangeTable.locator('[data-table-cell="1:0"]').innerText())
    .toBe('First\nSecond\n\nFourth');
  await expect(rangeTable.locator('[data-table-cell="2:1"]')).toHaveText('Unchanged');
  expect(errors).toEqual([]);
});

test('pasting an HTML table preserves cell breaks, blank lines and inline formatting', async ({
  page,
}) => {
  await openTableNote(page);
  const content = page.locator('#blockEditor [data-type="text"] .block-content').last();
  await paste(
    content,
    'Fallback',
    `<table><tr><th>Heading<br>continued</th><th>Other</th></tr><tr><td><strong>First<br>Second<br><br>Fourth</strong></td><td>
    <p>One</p>
    <p>Two</p>
  </td></tr><tr><td style="white-space:pre-wrap">Start\n\nEnd\n</td><td>&lt;br&gt; &amp;</td></tr></table>`,
  );
  const table = page.locator('#blockEditor .simple-table-block').last();
  await expect(page.locator('#blockEditor .simple-table-block')).toHaveCount(2);
  await expect
    .poll(() => table.locator('[data-table-cell="0:0"]').innerText())
    .toBe('Heading\ncontinued');
  await expect
    .poll(() => table.locator('[data-table-cell="1:0"]').innerText())
    .toBe('First\nSecond\n\nFourth');
  await expect.poll(() => table.locator('[data-table-cell="1:1"]').innerText()).toBe('One\nTwo');
  await expect(table.locator('[data-table-cell="1:0"] [data-inline-format="bold"]')).toHaveText(
    'First\nSecond\n\nFourth',
  );
  await expect.poll(() => readNote(page)).toContain('Start<br><br>End<br>');
  await expect(table.locator('[data-table-cell="2:1"]')).toHaveText('<br> &');
  await page.reload();
  await expect
    .poll(() => table.locator('[data-table-cell="1:0"]').innerText())
    .toBe('First\nSecond\n\nFourth');
  await expect.poll(() => table.locator('[data-table-cell="1:1"]').innerText()).toBe('One\nTwo');
});

test('HTML and quoted TSV grids keep multiline cells inside their original coordinates', async ({
  page,
}) => {
  await openTableNote(page);
  const table = page.locator('#blockEditor .simple-table-block').first();
  await paste(
    table.locator('[data-table-cell="1:0"]'),
    'First\nSecond\nNeighbor',
    '<table><tr><td><div>First</div><div>Second<br><br>Fourth</div></td><td>Neighbor</td></tr></table>',
  );
  await expect
    .poll(() => table.locator('[data-table-cell="1:0"]').innerText())
    .toBe('First\nSecond\n\nFourth');
  await expect(table.locator('[data-table-cell="1:1"]')).toHaveText('Neighbor');
  await paste(table.locator('[data-table-cell="1:0"]'), '"One\nTwo\n\nFour"\tNext\nLower\tLast');
  await expect
    .poll(() => table.locator('[data-table-cell="1:0"]').innerText())
    .toBe('One\nTwo\n\nFour');
  await expect(table.locator('[data-table-cell="1:1"]')).toHaveText('Next');
  await expect(table.locator('[data-table-cell="2:0"]')).toHaveText('Lower');
  await expect(table.locator('[data-table-cell="2:1"]')).toHaveText('Last');
  await expect(table.locator('[data-table-cell]')).toHaveCount(6);
});

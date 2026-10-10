import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.use({ baseURL: 'http://127.0.0.1:4176' });

test('Enter-separated note lines stay on separate Markdown lines after editing and repeated reloads', async ({
  page,
}) => {
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
    const handle = await directory.getFileHandle('Lines.md', { create: true });
    const writer = await handle.createWritable();
    await writer.write('Lorenz\n');
    await writer.close();
  });
  await page.locator('#chooseDirectoryBtn').click();
  await page
    .locator('#pageTree [data-action="open-page"]')
    .filter({ hasText: /^Lines$/ })
    .click();
  const blocks = page.locator('#blockEditor [data-type="text"] .block-content');
  const lines = ['Lorenz', 'Igniz', 'Laplace', 'Notidian', 'Base', 'soft'];
  await expect(blocks).toHaveText([lines[0]]);
  for (const line of lines.slice(1)) {
    await blocks.last().press('End');
    await blocks.last().press('Enter');
    await blocks.last().fill(line);
  }
  await page.locator('#pageTitle').click();
  const readFile = () =>
    page.evaluate(async () => {
      const directory = await navigator.storage.getDirectory();
      return (await (await directory.getFileHandle('Lines.md')).getFile()).text();
    });
  await expect.poll(readFile).toBe(`${lines.join('\n')}\n`);
  for (let reload = 0; reload < 2; reload++) {
    await page.reload();
    await expect(blocks).toHaveText(lines);
    lines[lines.length - 1] = `soft ${reload + 1}`;
    await blocks.last().fill(lines.at(-1)!);
    await page.locator('#pageTitle').click();
    await expect.poll(readFile).toBe(`${lines.join('\n')}\n`);
  }
});

test('table cells retain line breaks and literal tags after saving and reloading Markdown', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => navigator.storage.getDirectory(),
    });
  });
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  await page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory();
    const handle = await directory.getFileHandle('Cell breaks.md', { create: true });
    const writable = await handle.createWritable();
    await writable.write(
      '| Heading<br>continued | Other |\n| --- | --- |\n| First<br/>Second<BR /><br>Fourth | &#60;br&#62; &amp; |\n',
    );
    await writable.close();
  });
  await page.locator('#chooseDirectoryBtn').click();
  await page
    .locator('#pageTree [data-action="open-page"]')
    .filter({ hasText: 'Cell breaks' })
    .click();
  const header = page.locator('#blockEditor [data-table-cell="0:0"]');
  const body = page.locator('#blockEditor [data-table-cell="1:0"]');
  const literal = page.locator('#blockEditor [data-table-cell="1:1"]');
  await expect(body).toBeVisible();
  await expect.poll(() => header.innerText()).toBe('Heading\ncontinued');
  await expect.poll(() => body.innerText()).toBe('First\nSecond\n\nFourth');
  await expect(literal).toHaveText('<br> &');

  await body.fill('Written first');
  await body.press('End');
  await body.press('Shift+Enter');
  await body.pressSequentially('Written second');
  await body.press('Shift+Enter');
  await body.press('Shift+Enter');
  await body.pressSequentially('Written fourth');
  const literalText = 'Literal <br> &lt;br&gt; & more';
  await literal.fill(literalText);
  await header.click();
  await expect.poll(() => body.innerText()).toBe('Written first\nWritten second\n\nWritten fourth');
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const directory = await navigator.storage.getDirectory();
        return (await (await directory.getFileHandle('Cell breaks.md')).getFile()).text();
      }),
    )
    .toContain('Written first<br>Written second<br><br>Written fourth');

  for (let reload = 0; reload < 2; reload++) {
    await page.reload();
    await expect(body).toBeVisible();
    await expect.poll(() => header.innerText()).toBe('Heading\ncontinued');
    await expect
      .poll(() => body.innerText())
      .toBe('Written first\nWritten second\n\nWritten fourth');
    await expect(literal).toHaveText(literalText);
  }
  expect(errors).toEqual([]);
});

test('legacy escaped breaks in text and table cells survive saving and repeated reloads', async ({
  page,
}) => {
  const source = readFileSync(
    new URL('../fixtures/legacy-line-breaks.md', import.meta.url),
    'utf8',
  );
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => navigator.storage.getDirectory(),
    });
  });
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  await page.evaluate(async (markdown) => {
    const directory = await navigator.storage.getDirectory();
    const handle = await directory.getFileHandle('Legacy breaks.md', { create: true });
    const writable = await handle.createWritable();
    await writable.write(markdown);
    await writable.close();
  }, source);
  await page.locator('#chooseDirectoryBtn').click();
  await page
    .locator('#pageTree [data-action="open-page"]')
    .filter({ hasText: 'Legacy breaks' })
    .click();

  const quote = page.locator('#blockEditor [data-type="quote"] .block-content');
  const paragraph = page.locator('#blockEditor [data-type="text"] .block-content');
  const cell = (position: string) => page.locator(`#blockEditor [data-table-cell="${position}"]`);
  const checkRestored = async () => {
    await expect
      .poll(() => quote.innerText())
      .toBe('I have a friend. He lives in London.\n→ I have a friend who lives in London.');
    await expect(quote.locator('[data-inline-format="bold"]')).toHaveText('who lives in London');
    await expect.poll(() => cell('1:1').innerText()).toBe('Quien \nQue');
    await expect.poll(() => cell('2:1').innerText()).toBe('A quién\nA que');
    await expect.poll(() => cell('4:1').innerText()).toBe('Que\nEl cual\nLa cual');
    await expect.poll(() => cell('8:1').innerText()).toBe('Uno\nDos');
    await expect
      .poll(() => cell('8:1').locator('[data-inline-format="bold"]').innerText())
      .toBe('Uno\nDos');
    await expect(cell('8:2').locator('[data-inline-format="code"]')).toHaveText('<br>');
    await expect(cell('8:3').locator('[data-inline-format="code"]')).toHaveText('a|b');
  };
  await checkRestored();
  await expect.poll(() => paragraph.innerText()).toBe('Antes\nDespués \nnegrita');
  await expect(paragraph.locator('[data-inline-format="bold"]')).toHaveText('negrita');

  await paragraph.fill('Primera');
  await paragraph.press('End');
  await paragraph.press('Shift+Enter');
  await paragraph.pressSequentially('Segunda');
  await paragraph.press('Shift+Enter');
  await paragraph.press('Shift+Enter');
  await paragraph.pressSequentially('Cuarta');
  await quote.click();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const directory = await navigator.storage.getDirectory();
        return (await (await directory.getFileHandle('Legacy breaks.md')).getFile()).text();
      }),
    )
    .toContain('Primera<br>Segunda<br><br>Cuarta');

  for (let reload = 0; reload < 2; reload++) {
    await page.reload();
    await checkRestored();
    await expect.poll(() => paragraph.innerText()).toBe('Primera\nSegunda\n\nCuarta');
  }
});

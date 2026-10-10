import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.use({ baseURL: 'http://127.0.0.1:4176' });
const source = readFileSync(new URL('../fixtures/list-links.md', import.meta.url), 'utf8');
const urls = [...source.matchAll(/\]\(([^)]+)\)/g)].map((match) => `${match[1]}/`);

for (const kind of ['number', 'bullet'] as const) {
  for (const mode of ['paste', 'open'] as const) {
    test(`${kind} lists preserve Markdown links on ${mode} and reload`, async ({
      page,
      context,
    }) => {
      await context.route(urls[0], (route) => route.fulfill({ body: 'Link destination' }));
      const markdown = kind === 'number' ? source : source.replace(/^\d+\. /gm, '- ');
      await page.addInitScript(() => {
        Object.defineProperty(window, 'showDirectoryPicker', {
          configurable: true,
          value: async () => navigator.storage.getDirectory(),
        });
      });
      await page.goto('/');
      await expect(page.locator('#pageTitle')).toBeVisible();
      await page.evaluate(
        async (text) => {
          const directory = await navigator.storage.getDirectory();
          const file = await directory.getFileHandle('Links.md', { create: true });
          const writer = await file.createWritable();
          await writer.write(text);
          await writer.close();
        },
        mode === 'open' ? markdown : 'Paste here\n',
      );
      await page.locator('#chooseDirectoryBtn').click();
      await page
        .locator('#pageTree [data-action="open-page"]')
        .filter({ hasText: /^Links$/ })
        .click();
      if (mode === 'paste') {
        const content = page.locator('#blockEditor .block-content').last();
        await content.evaluate((node, text) => {
          (node as HTMLElement).focus();
          const range = document.createRange();
          range.selectNodeContents(node);
          window.getSelection()!.removeAllRanges();
          window.getSelection()!.addRange(range);
          const data = new DataTransfer();
          data.setData('text/plain', text);
          const escape = (value: string) =>
            value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          data.setData(
            'text/html',
            text
              .trimEnd()
              .split('\n')
              .map((line) => `<p>${escape(line)}</p>`)
              .join(''),
          );
          node.dispatchEvent(
            new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
          );
        }, markdown);
      }
      const rows = page.locator(`#blockEditor [data-type="${kind}"]`);
      const check = async () => {
        await expect(rows).toHaveCount(8);
        await expect(rows.locator('a[data-inline-link]')).toHaveCount(8);
        expect(
          await rows
            .locator('a[data-inline-link]')
            .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
        ).toEqual(urls);
        await expect(page.locator('#blockEditor')).not.toContainText('&#x20;');
        if (kind === 'number')
          await expect(rows.locator('.list-prefix')).toHaveText([
            '1.',
            '2.',
            '3.',
            '4.',
            '5.',
            '6.',
            '7.',
            '8.',
          ]);
      };
      await check();
      await rows.last().locator('.block-content').press('End');
      await rows.last().locator('.block-content').press('Space');
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const root = await navigator.storage.getDirectory();
            return (await (await root.getFileHandle('Links.md')).getFile()).text();
          }),
        )
        .toContain('[http://60fps.design](http://60fps.design/)');
      await page.reload();
      await check();
      const popup = page.waitForEvent('popup');
      await rows.first().locator('a[data-inline-link]').click();
      const opened = await popup;
      await expect.poll(() => opened.url()).toBe(urls[0]);
      await opened.close();
    });
  }
}

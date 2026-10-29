import { expect, test } from '@playwright/test';

for (const docked of [false, true]) {
  for (const mode of ['native', 'drag', 'rectangle']) {
    for (const rich of [false, true]) {
      test(`paste replaces ${mode} selection with ${rich ? 'rich' : 'plain'} text (${docked ? 'split' : 'main'})`, async ({
        page,
        context,
      }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.setViewportSize({ width: 1600, height: 1000 });
        await page.goto('/laplace/');
        await expect(page.locator('#newPageBtn')).toBeVisible();
        await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
        await page.locator('#newPageBtn').click();
        await expect(page.locator('#pageTitle')).toBeVisible();
        await page
          .locator('#blockEditor .block-content')
          .first()
          .evaluate((content) => {
            const data = new DataTransfer();
            data.setData(
              'text/markdown',
              'Outside before\n\n**First** selected\n\n---\n\nLast [selected](https://example.com)\n\nOutside after',
            );
            (content as HTMLElement).focus();
            content.dispatchEvent(
              new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
            );
          });
        if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
        const editor = page.locator(
          docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor',
        );
        const rows = editor.locator(':scope > .block-row');
        await expect(rows).toHaveCount(5);
        const original = await rows.evaluateAll((rows) => rows.map((row) => row.outerHTML));
        if (mode === 'native') {
          await editor.evaluate((root) => {
            const contents = root.querySelectorAll<HTMLElement>('.block-content');
            const first = contents[1],
              last = contents[2];
            first.focus();
            const point = (content: HTMLElement, offset: number) => {
              const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
              while (walker.nextNode()) {
                if (offset <= walker.currentNode.textContent!.length)
                  return { node: walker.currentNode, offset };
                offset -= walker.currentNode.textContent!.length;
              }
              throw new Error('Missing selection point');
            };
            const start = point(first, 6),
              end = point(last, 4);
            const range = document.createRange();
            range.setStart(start.node, start.offset);
            range.setEnd(end.node, end.offset);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
          });
        } else {
          const first = (await rows.nth(1).boundingBox())!;
          const last = (await rows.nth(3).boundingBox())!;
          const root = (await editor.boundingBox())!;
          await page.mouse.move(
            mode === 'rectangle' ? root.x - 12 : first.x + 1,
            mode === 'rectangle' ? first.y - 1 : first.y + first.height / 2,
          );
          await page.mouse.down();
          await page.mouse.move(
            root.x + root.width - 5,
            mode === 'rectangle' ? last.y + last.height - 1 : last.y + last.height / 2,
            { steps: 12 },
          );
          await page.mouse.up();
          await expect(
            page.locator('#multiBlockSelectionLayer [data-selected-block-id]'),
          ).not.toHaveCount(0);
        }
        if (!rich) {
          await page.evaluate(() => navigator.clipboard.writeText('replacement'));
          await page.keyboard.press('Control+v');
        } else
          await editor.evaluate((root, rich) => {
            const data = new DataTransfer();
            data.setData('text/plain', 'replacement');
            if (rich) data.setData('text/html', '<p><em>replacement</em></p>');
            const target = root.querySelectorAll('.block-content')[1];
            target.dispatchEvent(
              new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
            );
          }, rich);
        await expect(rows).toHaveCount(3);
        await expect(editor.locator('.block-content')).toHaveText([
          'Outside before',
          mode === 'native' ? 'First replacement selected' : 'replacement',
          'Outside after',
        ]);
        if (mode === 'native') {
          await expect(rows.nth(1).locator('strong,b')).toHaveText('First');
          await expect(rows.nth(1).locator('a')).toHaveText('selected');
        }
        if (rich) await expect(rows.nth(1).locator('em,i')).toHaveText('replacement');
        await page.keyboard.press('Control+z');
        await expect(rows).toHaveCount(5);
        expect(await rows.evaluateAll((rows) => rows.map((row) => row.outerHTML))).toEqual(
          original,
        );
        await page.keyboard.press('Control+Shift+z');
        await expect(rows).toHaveCount(3);
      });
    }
  }
}

for (const docked of [false, true]) {
  for (const payload of ['markdown', 'table', 'image']) {
    test(`paste ${payload} over selected blocks is one undo operation (${docked ? 'split' : 'main'})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.goto('/laplace/');
      await expect(page.locator('#newPageBtn')).toBeVisible();
      await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
      await page.locator('#newPageBtn').click();
      await page
        .locator('#blockEditor .block-content')
        .first()
        .evaluate((content) => {
          const data = new DataTransfer();
          data.setData('text/markdown', 'Before\n\nFirst\n\n---\n\nLast\n\nAfter');
          (content as HTMLElement).focus();
          content.dispatchEvent(
            new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
          );
        });
      if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
      const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
      const rows = editor.locator(':scope > .block-row');
      await expect(rows).toHaveCount(5);
      const root = (await editor.boundingBox())!;
      const first = (await rows.nth(1).boundingBox())!,
        last = (await rows.nth(3).boundingBox())!;
      await page.mouse.move(root.x - 12, first.y - 1);
      await page.mouse.down();
      await page.mouse.move(root.x + root.width - 5, last.y + last.height - 1, { steps: 12 });
      await page.mouse.up();
      await expect(page.locator('#multiBlockSelectionLayer [data-selected-block-id]')).toHaveCount(
        3,
      );
      await editor.evaluate((root, payload) => {
        const data = new DataTransfer();
        if (payload === 'markdown') data.setData('text/markdown', '## Heading\n\n- Item');
        if (payload === 'table') {
          data.setData('text/plain', 'https://example.com');
          data.setData(
            'text/html',
            '<table><tr><td><a href="https://example.com"><b>Cell</b></a></td></tr></table>',
          );
        }
        if (payload === 'image')
          data.items.add(
            new File(
              [
                '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="12"><rect width="24" height="12" fill="blue"/></svg>',
              ],
              'pasted.svg',
              { type: 'image/svg+xml' },
            ),
          );
        root
          .querySelectorAll('.block-content')[1]
          .dispatchEvent(
            new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
          );
      }, payload);
      await expect(rows).toHaveCount(payload === 'markdown' ? 5 : 3);
      await expect(rows.first().locator('.block-content')).toHaveText('Before');
      await expect(rows.last().locator('.block-content')).toHaveText('After');
      if (payload === 'markdown') await expect(rows.nth(1)).toHaveAttribute('data-type', 'h2');
      if (payload === 'table') {
        await expect(rows.nth(1).locator('[data-table-cell] a')).toHaveText('Cell');
        await expect(
          rows.nth(1).locator('[data-table-cell] strong,[data-table-cell] b'),
        ).toHaveText('Cell');
      }
      if (payload === 'image')
        await expect(rows.nth(1).locator('img')).toHaveAttribute('src', /.+/);
      await page.keyboard.press('Control+z');
      await expect(rows).toHaveCount(5);
      await expect(editor.locator('.block-content')).toHaveText([
        'Before',
        'First',
        'Last',
        'After',
      ]);
      await page.keyboard.press('Control+Shift+z');
      await expect(rows).toHaveCount(payload === 'markdown' ? 5 : 3);
    });
  }
}

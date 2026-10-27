import { expect, test } from '@playwright/test';

for (const docked of [false, true]) {
  for (const mode of ['native', 'drag']) {
    test(`delete images and page links within a mixed selection (${mode}, ${docked ? 'split' : 'main'})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
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
          const stream = await (
            await folder.getFileHandle(name, { create: true })
          ).createWritable();
          await stream.write(text);
          await stream.close();
        };
        await write(
          attachments,
          'small.svg',
          '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"><rect width="32" height="16" fill="purple"/></svg>',
        );
        await write(root, 'Target.md', 'Target content stays intact.\n');
        await write(
          root,
          'Mixed.md',
          [
            'Outside before',
            '![[small.svg]]',
            '[[Target]]',
            'First selected',
            '![Selected image](.attachments/small.svg "Selected caption")',
            '<!-- laplace:image: {"width":80,"align":"right"} -->',
            '[[Target]]',
            '---',
            '| Column |',
            '| --- |',
            '| Cell |',
            'Last selected',
            '![[small.svg]]',
            '[[Target]]',
            'Outside after',
            '',
          ].join('\n'),
        );
      });
      await page.locator('#chooseDirectoryBtn').click();
      await page
        .locator('#pageTree [data-action="open-page"]')
        .filter({ hasText: /^Mixed$/ })
        .click();
      if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
      const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
      const rows = editor.locator(':scope > .block-row');
      await expect(rows).toHaveCount(12);
      await expect(editor.locator('[data-page-link-open]')).toHaveCount(3);
      const original = await page.evaluate(async () => {
        const { useWorkspaceStore } = await import(
          new URL('src/store/workspace.store.ts', location.href).href
        );
        const state = useWorkspaceStore.getState().controller.getDocument();
        return state.pages.find((note: { id: string }) => note.id === state.currentPageId).blocks;
      });
      const originalIds = await rows.evaluateAll((rows) =>
        rows.map((row) => row.getAttribute('data-block-id')),
      );
      const first = editor.locator('.block-content').filter({ hasText: /^First selected$/ });
      const last = editor.locator('.block-content').filter({ hasText: /^Last selected$/ });
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
        const start = (await first.boundingBox())!;
        const end = (await last.boundingBox())!;
        await page.mouse.move(end.x + end.width - 1, end.y + end.height / 2);
        await page.mouse.down();
        await page.mouse.move(start.x + 1, start.y + start.height / 2, { steps: 16 });
        await page.mouse.up();
      }
      await page.keyboard.press(mode === 'native' ? 'Delete' : 'Backspace');
      await expect(rows).toHaveCount(6);
      await expect(editor.locator('.image-block')).toHaveCount(2);
      await expect(editor.locator('[data-page-link-open]')).toHaveCount(2);
      await expect(editor.locator('.simple-table-block')).toHaveCount(0);
      await expect(editor.locator('.block-content')).toHaveText([
        'Outside before',
        'Outside after',
      ]);
      expect(
        await rows.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-block-id'))),
      ).toEqual([...originalIds.slice(0, 3), ...originalIds.slice(9)]);
      await page.keyboard.press('Control+z');
      await expect(rows).toHaveCount(12);
      expect(
        await page.evaluate(async () => {
          const { useWorkspaceStore } = await import(
            new URL('src/store/workspace.store.ts', location.href).href
          );
          const state = useWorkspaceStore.getState().controller.getDocument();
          return state.pages.find((note: { id: string }) => note.id === state.currentPageId).blocks;
        }),
      ).toEqual(original);
      await page.keyboard.press('Control+Shift+z');
      await expect(rows).toHaveCount(6);
      await page.evaluate(async () => {
        const { useWorkspaceStore } = await import(
          new URL('src/store/workspace.store.ts', location.href).href
        );
        await useWorkspaceStore.getState().controller.flush();
      });
      expect(
        await page.evaluate(async () => {
          const root = await navigator.storage.getDirectory();
          return {
            target: await (await (await root.getFileHandle('Target.md')).getFile()).text(),
            image: await (
              await (
                await (await root.getDirectoryHandle('.attachments')).getFileHandle('small.svg')
              ).getFile()
            ).text(),
          };
        }),
      ).toEqual({
        target: 'Target content stays intact.\n',
        image:
          '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"><rect width="32" height="16" fill="purple"/></svg>',
      });
    });
  }
}

test('deleting across code preserves formatted text outside partial selection boundaries', async ({
  page,
}) => {
  await page.goto('/laplace/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  await page.locator('#newPageBtn').click();
  const editor = page.locator('#blockEditor');
  await editor
    .locator('.block-content')
    .first()
    .evaluate((content) => {
      const data = new DataTransfer();
      data.setData(
        'text/html',
        '<p><strong>Keep</strong> first</p><pre><code>const selected = true;</code></pre><p>last <em>tail</em></p>',
      );
      content.dispatchEvent(
        new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: data,
        }),
      );
    });
  await expect(editor.locator(':scope > .block-row')).toHaveCount(3);
  await editor.evaluate((root) => {
    const contents = root.querySelectorAll('.block-content');
    (contents[0] as HTMLElement).focus();
    const range = document.createRange();
    range.setStart(contents[0].lastChild!, 1);
    range.setEnd(contents[1].firstChild!, 4);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  });
  await page.keyboard.press('Delete');
  await expect(editor.locator(':scope > .block-row')).toHaveCount(2);
  await expect(editor.locator('.block-content')).toHaveText(['Keep ', ' tail']);
  await expect(editor.locator('[data-inline-format="bold"]')).toHaveText('Keep');
  await expect(editor.locator('[data-inline-format="italic"]')).toHaveText('tail');
  await page.keyboard.press('Control+z');
  await expect(editor.locator(':scope > .block-row')).toHaveCount(3);
  await expect(editor.locator('[data-code-editor]')).toHaveValue('const selected = true;');
  await expect(editor.locator('.block-content')).toHaveText(['Keep first', 'last tail']);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor.locator(':scope > .block-row')).toHaveCount(2);
  await expect(editor.locator('.block-content')).toHaveText(['Keep ', ' tail']);
});

for (const docked of [false, true]) {
  for (const language of ['javascript', 'mermaid']) {
    for (const mode of ['native', 'drag']) {
      test(`delete a selection across ${language} (${mode}, ${docked ? 'split' : 'main'})`, async ({
        page,
      }) => {
        await page.goto('/laplace/');
        await expect(page.locator('#pageTitle')).toBeVisible();
        await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
        await page.locator('#newPageBtn').click();
        await page
          .locator('#blockEditor .block-content')
          .first()
          .evaluate((content, language) => {
            const data = new DataTransfer();
            data.setData(
              'text/plain',
              [
                'Outside before',
                '',
                'First selected',
                '',
                `\`\`\`${language}`,
                language === 'mermaid' ? 'flowchart LR\n A --> B' : 'const selected = true;',
                '```',
                '',
                'Middle selected',
                '',
                'Last selected',
                '',
                '```javascript',
                'const untouched = true;',
                '```',
                '',
                'Outside after',
              ].join('\n'),
            );
            content.dispatchEvent(
              new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
            );
          }, language);
        if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
        const editor = page.locator(
          docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor',
        );
        const rows = editor.locator(':scope > .block-row');
        await expect(rows).toHaveCount(7);
        if (language === 'mermaid')
          await expect(editor.locator('svg.pele-flowchart')).toBeVisible();
        const originalIds = await rows.evaluateAll((rows) =>
          rows.map((row) => row.getAttribute('data-block-id')),
        );
        const first = editor.locator('.block-content').filter({ hasText: /^First selected$/ });
        const last = editor.locator('.block-content').filter({ hasText: /^Last selected$/ });
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
          const start = (await first.boundingBox())!;
          const end = (await last.boundingBox())!;
          await page.mouse.move(start.x + 1, start.y + start.height / 2);
          await page.mouse.down();
          await page.mouse.move(end.x + end.width - 1, end.y + end.height / 2, { steps: 16 });
          await page.mouse.up();
        }
        await page.keyboard.press(mode === 'native' ? 'Delete' : 'Backspace');
        await expect(rows).toHaveCount(3);
        await expect(editor.locator('.block-content')).toHaveText([
          'Outside before',
          'Outside after',
        ]);
        await expect(editor.locator('[data-code-editor]')).toHaveValue('const untouched = true;');
        await page.keyboard.press('Control+z');
        await expect(rows).toHaveCount(7);
        expect(
          await rows.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-block-id'))),
        ).toEqual(originalIds);
        await expect(editor.locator('.block-content')).toHaveText([
          'Outside before',
          'First selected',
          'Middle selected',
          'Last selected',
          'Outside after',
        ]);
        if (language === 'mermaid')
          await expect(editor.locator('svg.pele-flowchart')).toBeVisible();
        await page.keyboard.press('Control+Shift+z');
        await expect(rows).toHaveCount(3);
        await expect(editor.locator('[data-code-editor]')).toHaveValue('const untouched = true;');
      });
    }
  }
}

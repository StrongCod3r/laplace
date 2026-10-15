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
    const url = new URL('src/store/workspace.store.ts', location.href).href;
    const { useWorkspaceStore } = await import(url);
    if (!(await useWorkspaceStore.getState().controller.flush())) throw new Error('Save failed');
  });
  await page.reload();
  await expect(page.locator('#pageTitle:visible, .dock-pane.active [data-dock-title]')).toHaveText(
    'List',
  );
}

for (const docked of [false, true]) {
  for (const kind of ['number', 'bullet']) {
    test(`gutter dragging a nested ${kind} to the start normalizes its indentation in ${docked ? 'a split pane' : 'the main editor'}`, async ({
      page,
    }) => {
      const marker = kind === 'number' ? '1. ' : '- ';
      await openList(page, `${marker}A\n  ${marker}**B**\n${marker}C\n`);
      if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
      const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
      const rows = editor.locator(':scope > .block-row');
      const movedId = await rows.nth(1).getAttribute('data-block-id');
      await expect(rows.nth(1)).toHaveAttribute('data-list-indent', '1');
      await rows.nth(1).hover();
      await rows
        .nth(1)
        .locator('[data-block-action="drag"]')
        .dragTo(rows.first(), { targetPosition: { x: 60, y: 2 } });
      const verify = async () => {
        await expect(rows.locator(':scope > .block-content')).toHaveText(['B', 'A', 'C']);
        await expect(rows).toHaveCount(3);
        for (const row of await rows.all())
          await expect(row).toHaveAttribute('data-list-indent', '0');
        await expect(rows.first()).toHaveAttribute('data-block-id', movedId!);
        await expect(rows.first().locator('strong')).toHaveText('B');
        if (kind === 'number')
          await expect(rows.locator('.list-prefix')).toHaveText(['1.', '2.', '3.']);
      };
      await verify();
      const content = editor.locator(`[data-block-id="${movedId}"] .block-content`);
      await content.click({ position: { x: 3, y: 8 } });
      await content.press('Control+z');
      await expect(rows.locator(':scope > .block-content')).toHaveText(['A', 'B', 'C']);
      await expect(rows.nth(1)).toHaveAttribute('data-list-indent', '1');
      if (kind === 'number')
        await expect(rows.locator('.list-prefix')).toHaveText(['1.', '1.', '2.']);
      await expect(content).toBeFocused();
      await content.press('Control+Shift+z');
      await verify();
      const saved = await page.evaluate(async () => {
        const url = new URL('src/store/workspace.store.ts', location.href).href;
        const { useWorkspaceStore } = await import(url);
        if (!(await useWorkspaceStore.getState().controller.flush()))
          throw new Error('Save failed');
        const root = await navigator.storage.getDirectory();
        return (await (await root.getFileHandle('List.md')).getFile()).text();
      });
      expect(saved).toBe(kind === 'number' ? '1. **B**\n2. A\n3. C\n' : '- **B**\n- A\n- C\n');
      await saveAndReload(page);
      // IDs may be reconstructed from Markdown on reload; formatting and structure must persist.
      await expect(rows.locator(':scope > .block-content')).toHaveText(['B', 'A', 'C']);
      for (const row of await rows.all())
        await expect(row).toHaveAttribute('data-list-indent', '0');
      if (kind === 'number')
        await expect(rows.locator('.list-prefix')).toHaveText(['1.', '2.', '3.']);
    });
  }
}

test('numbered lists continue across images and blank lines through Markdown reloads', async ({
  page,
}) => {
  await openList(
    page,
    '1. First\n\n![Example](https://example.com/image.png)\n\n1. Second\n\n1. Third\n\nParagraph\n\n1. New list\n',
  );
  for (let reload = 0; reload < 2; reload++) {
    await expect(page.locator('#blockEditor .list-prefix')).toHaveText(['1.', '2.', '3.', '1.']);
    await page.locator('#breadcrumbs [data-page-plain-text-toggle]').click();
    const source = await page.locator('#pageEditor [data-plain-text-content]').innerText();
    expect(source).toContain('2. Second');
    expect(source).toContain('3. Third');
    expect(source).toContain('1. New list');
    await page.locator('#breadcrumbs [data-page-plain-text-toggle]').click();
    const content = page.locator('#blockEditor .block-content').first();
    await content.click();
    await content.press('End');
    await page.keyboard.type('!');
    await saveAndReload(page);
    await page
      .locator('#pageTree [data-action="open-page"]')
      .filter({ hasText: /^List$/ })
      .click();
  }
});

test('numbered Markdown and plain text use sequential markers with continuation lines', async ({
  page,
}) => {
  await openList(page, '1. sadsadsa\n   sadsad\n1. asdsadsa\n');
  const first = page.locator('#blockEditor .block-content').first();
  await first.click({ position: { x: 3, y: 8 } });
  await first.press('End');
  await page.keyboard.type('!');
  const expected = '1. sadsadsa!\n   sadsad\n2. asdsadsa\n';
  for (let reload = 0; reload < 2; reload++) {
    const saved = await page.evaluate(async () => {
      const url = new URL('src/store/workspace.store.ts', location.href).href;
      const { useWorkspaceStore } = await import(url);
      if (!(await useWorkspaceStore.getState().controller.flush())) throw new Error('Save failed');
      const root = await navigator.storage.getDirectory();
      return (await (await root.getFileHandle('List.md')).getFile()).text();
    });
    expect(saved).toBe(expected);
    const toggle = page.locator('#breadcrumbs [data-page-plain-text-toggle]');
    await toggle.click();
    await expect(page.locator('#pageEditor [data-plain-text-content]')).toHaveText(expected);
    await toggle.click();
    await saveAndReload(page);
    await page
      .locator('#pageTree [data-action="open-page"]')
      .filter({ hasText: /^List$/ })
      .click();
    await expect(page.locator('#blockEditor .list-prefix')).toHaveText(['1.', '2.']);
    await expect(first).toHaveText('sadsadsa!\nsadsad');
  }
});

for (const docked of [false, true]) {
  for (const kind of ['bullet', 'number']) {
    for (const key of ['Backspace', 'Shift+Tab']) {
      test(`${key} removes a ${kind} marker without merging items in ${docked ? 'a split pane' : 'the main editor'}`, async ({
        page,
      }) => {
        const marker = kind === 'bullet' ? '- ' : '1. ';
        await openList(
          page,
          `${marker}text0\n${marker}text1 **bold** [link](https://example.com) [[Target|wiki]]\n${marker}text2\n`,
        );
        if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
        const editor = page.locator(
          docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor',
        );
        const rows = editor.locator(':scope > .block-row');
        const content = rows.nth(1).locator('.block-content');
        const id = await rows.nth(1).getAttribute('data-block-id');
        await content.click({ position: { x: 3, y: 8 } });
        await content.press('Home');
        await content.press(key);
        const verify = async () => {
          await expect(rows).toHaveCount(3);
          await expect(rows.nth(0)).toHaveAttribute('data-type', kind);
          await expect(rows.nth(0).locator('.block-content')).toHaveText('text0');
          await expect(rows.nth(1)).toHaveAttribute('data-type', 'text');
          await expect(content).toHaveText('text1 bold link wiki');
          await expect(content.locator('strong')).toHaveText('bold');
          await expect(content.locator('.inline-link')).toHaveText('link');
          await expect(content.locator('[data-wiki-page-title]')).toHaveText('wiki');
          await expect(rows.nth(2)).toHaveAttribute('data-type', kind);
          await expect(rows.nth(2).locator('.block-content')).toHaveText('text2');
        };
        await verify();
        await expect(rows.nth(1)).toHaveAttribute('data-block-id', id!);
        await expect(content).toBeFocused();
        await content.press('Control+z');
        await expect(rows.nth(1)).toHaveAttribute('data-type', kind);
        await expect(content).toHaveText('text1 bold link wiki');
        await expect(content).toBeFocused();
        await content.press('Control+Shift+z');
        await verify();
        await expect(content).toBeFocused();
        await saveAndReload(page);
        await verify();
      });
    }
  }
}

for (const docked of [false, true]) {
  for (const kind of ['bullet', 'number']) {
    test(`Tab reattaches normal text as a ${kind} continuation in ${docked ? 'a split pane' : 'the main editor'}`, async ({
      page,
    }) => {
      const marker = kind === 'bullet' ? '- ' : '1. ';
      await openList(
        page,
        `${marker}text0\n${marker}text1 **bold** [link](https://example.com) [[Target|wiki]]\n${marker}text2\n`,
      );
      if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
      const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
      const rows = editor.locator(':scope > .block-row');
      const normal = rows.nth(1).locator('.block-content');
      await normal.click({ position: { x: 3, y: 8 } });
      await normal.press('Home');
      await normal.press('Backspace');
      await expect(rows.nth(1)).toHaveAttribute('data-type', 'text');
      await expect(normal).toBeFocused();
      await normal.press('Tab');
      const first = rows.first().locator('.block-content');
      const verify = async () => {
        await expect(rows).toHaveCount(2);
        await expect(rows.first()).toHaveAttribute('data-type', kind);
        await expect(first).toHaveText('text0\ntext1 bold link wiki');
        await expect(first.locator('strong')).toHaveText('bold');
        await expect(first.locator('.inline-link')).toHaveText('link');
        await expect(first.locator('[data-wiki-page-title]')).toHaveText('wiki');
        await expect(rows.last()).toHaveAttribute('data-type', kind);
        await expect(rows.last().locator('.block-content')).toHaveText('text2');
      };
      await verify();
      await expect(first).toBeFocused();
      const caret = () =>
        first.evaluate((element) => {
          const selection = window.getSelection();
          if (!selection?.focusNode || !element.contains(selection.focusNode)) return -1;
          const range = document.createRange();
          range.selectNodeContents(element);
          range.setEnd(selection.focusNode, selection.focusOffset);
          return range.toString().length;
        });
      await expect.poll(caret).toBe('text0\n'.length);
      await first.press('Control+z');
      await expect(rows).toHaveCount(3);
      await expect(rows.nth(1)).toHaveAttribute('data-type', 'text');
      await expect(normal).toHaveText('text1 bold link wiki');
      await expect(normal).toBeFocused();
      await normal.press('Control+Shift+z');
      await verify();
      await expect(first).toBeFocused();
      await expect.poll(caret).toBe('text0\n'.length);
      await first.press('Shift+Tab');
      await expect(rows).toHaveCount(3);
      await expect(rows.nth(1)).toHaveAttribute('data-type', 'text');
      await expect(normal).toBeFocused();
      await normal.press('Tab');
      await verify();
      await saveAndReload(page);
      await verify();
    });
  }
}

for (const docked of [false, true]) {
  for (const selected of [false, true]) {
    test(`Tab attaches multiple text blocks ${selected ? 'with a selection' : 'from the last line'} in ${docked ? 'a split pane' : 'the main editor'}`, async ({
      page,
    }) => {
      await openList(
        page,
        '1. Reflection\nEl agente evalúa sus propias respuestas.\nEjemplo: **C#** [link](https://example.com) [[Target|wiki]]\n2. Next\n',
      );
      if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
      const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
      const rows = editor.locator(':scope > .block-row');
      await expect(rows).toHaveCount(4);
      const description = rows.nth(1).locator('.block-content');
      const example = rows.nth(2).locator('.block-content');
      await example.click({ position: { x: 3, y: 8 } });
      await example.press('Home');
      if (selected) {
        await editor.evaluate((element) => {
          const contents = element.querySelectorAll('.block-content');
          const range = document.createRange();
          range.setStart(contents[1], 0);
          range.setEnd(contents[2], contents[2].childNodes.length);
          window.getSelection()!.removeAllRanges();
          window.getSelection()!.addRange(range);
        });
      }
      await page.keyboard.press('Tab');
      const first = rows.first().locator('.block-content');
      const verify = async () => {
        await expect(rows).toHaveCount(2);
        await expect(first).toHaveText(
          'Reflection\nEl agente evalúa sus propias respuestas.\nEjemplo: C# link wiki',
        );
        await expect(first.locator('strong')).toHaveText('C#');
        await expect(first.locator('.inline-link')).toHaveText('link');
        await expect(first.locator('[data-wiki-page-title]')).toHaveText('wiki');
        await expect(rows.last().locator('.block-content')).toHaveText('Next');
        await expect(rows.locator('.list-prefix')).toHaveText(['1.', '2.']);
      };
      await verify();
      await first.press('Control+z');
      await expect(rows).toHaveCount(4);
      await expect(description).toHaveText('El agente evalúa sus propias respuestas.');
      await page.keyboard.press('Control+Shift+z');
      await verify();
      await saveAndReload(page);
      await verify();
    });
  }
}

test('Backspace removes the first marker and Shift+Tab removes the last marker', async ({
  page,
}) => {
  await openList(page, '- text0\n- text1\n- text2\n');
  const rows = page.locator('#blockEditor > .block-row');
  const first = rows.first().locator('.block-content');
  await first.click();
  await first.press('Home');
  await first.press('Backspace');
  await expect(rows.first()).toHaveAttribute('data-type', 'text');
  await expect(first).toHaveText('text0');
  const last = rows.last().locator('.block-content');
  await last.click();
  await last.press('End');
  await last.press('Shift+Tab');
  await expect(rows.last()).toHaveAttribute('data-type', 'text');
  await expect(last).toHaveText('text2');
  await expect(rows.nth(1)).toHaveAttribute('data-type', 'bullet');
  await expect(rows).toHaveCount(3);
});

for (const key of ['Backspace', 'Shift+Tab']) {
  test(`${key} reduces a nested list level before removing its marker`, async ({ page }) => {
    await openList(page, '- parent\n  - child\n    - leaf\n- next\n');
    const rows = page.locator('#blockEditor > .block-row');
    const child = rows.nth(1).locator('.block-content');
    await child.click();
    await child.press('Home');
    await child.press(key);
    await expect(rows.nth(1)).toHaveAttribute('data-type', 'bullet');
    await expect(rows.nth(1)).toHaveAttribute('data-list-indent', '0');
    await expect(rows.nth(2)).toHaveAttribute('data-list-indent', '1');
    await expect(child).toBeFocused();
    await child.press('Control+z');
    await expect(rows.nth(1)).toHaveAttribute('data-list-indent', '1');
    await expect(rows.nth(2)).toHaveAttribute('data-list-indent', '2');
    await expect(child).toBeFocused();
    await child.press('Control+Shift+z');
    await expect(rows.nth(1)).toHaveAttribute('data-list-indent', '0');
    await expect(child).toBeFocused();
    await child.press(key);
    await expect(rows.nth(1)).toHaveAttribute('data-type', 'text');
    await expect(child).toHaveText('child');
    await expect(rows.first().locator('.block-content')).toHaveText('parent');
    await expect(rows.last().locator('.block-content')).toHaveText('next');
    await expect(rows).toHaveCount(4);
  });
}

for (const docked of [false, true]) {
  for (const kind of ['bullet', 'number']) {
    for (const key of ['Backspace', 'Shift+Tab']) {
      test(`${key} detaches a ${kind} continuation in ${docked ? 'a split pane' : 'the main editor'}`, async ({
        page,
      }) => {
        const marker = kind === 'bullet' ? '- ' : '1. ';
        const indent = kind === 'bullet' ? '  ' : '\t';
        await openList(
          page,
          `${marker}text1\n${indent}continuation **bold** [link](https://example.com) [[Target|wiki]]\n${marker}text2\n`,
        );
        if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
        const editor = page.locator(
          docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor',
        );
        const rows = editor.locator(':scope > .block-row');
        const first = rows.first().locator('.block-content');
        await first.click();
        await first.evaluate((element) => {
          const range = document.createRange();
          range.setStart(element.firstChild!, 'text1\n'.length);
          range.collapse(true);
          const selection = window.getSelection()!;
          selection.removeAllRanges();
          selection.addRange(range);
        });
        await first.press(key);
        const continuation = rows.nth(1).locator('.block-content');
        const verify = async () => {
          await expect(rows).toHaveCount(3);
          await expect(rows.nth(0)).toHaveAttribute('data-type', kind);
          await expect(first).toHaveText('text1');
          await expect(rows.nth(1)).toHaveAttribute('data-type', 'text');
          await expect(continuation).toHaveText('continuation bold link wiki');
          await expect(continuation.locator('strong')).toHaveText('bold');
          await expect(continuation.locator('.inline-link')).toHaveText('link');
          await expect(continuation.locator('[data-wiki-page-title]')).toHaveText('wiki');
          await expect(rows.nth(2)).toHaveAttribute('data-type', kind);
          await expect(rows.nth(2).locator('.block-content')).toHaveText('text2');
          expect((await continuation.boundingBox())!.x).toBeLessThan(
            (await first.boundingBox())!.x,
          );
        };
        await verify();
        await expect(continuation).toBeFocused();
        await continuation.press('Control+z');
        await expect(rows).toHaveCount(2);
        await expect(first).toHaveText('text1\ncontinuation bold link wiki');
        await expect(first).toBeFocused();
        await first.press('Control+Shift+z');
        await verify();
        await expect(continuation).toBeFocused();
        await saveAndReload(page);
        await verify();
      });
    }
  }
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
    await content.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await content.press('Control+x');
    await expect(content).toHaveText('');
    await expect(rows.locator('.list-prefix')).toHaveText(['1.', '2.', '3.']);
    await expect.poll(async () => (await content.boundingBox())!.height).toBe(before!.height);
    await content.press('Control+z');
    await expect(content).toHaveText('hola2');
    await expect(content).toBeFocused();
    await content.press('Control+Shift+z');
    await expect(content).toHaveText('');
    await expect.poll(async () => (await content.boundingBox())!.height).toBe(before!.height);
    await expect(content).toBeFocused();
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

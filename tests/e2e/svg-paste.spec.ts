import { expect, test } from '@playwright/test';

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80"><rect width="120" height="80" fill="red"/></svg>';

test('existing embedded SVG becomes an attachment without losing its contents', async ({
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
  const source = svg.replace('fill="red"', 'fill="currentColor" style="color:rgb(237, 237, 237)"');
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  const markdown = `![](${uri.replace(/[()]/g, (character) => `\\${character}`)})\n`;
  await page.evaluate(async (markdown) => {
    const root = await navigator.storage.getDirectory();
    const writer = await (await root.getFileHandle('SVG.md', { create: true })).createWritable();
    await writer.write(markdown);
    await writer.close();
  }, markdown);
  await page.locator('#chooseDirectoryBtn').click();
  await page.locator('#pageTree [data-action="open-page"]').filter({ hasText: /^SVG$/ }).click();
  const image = page.locator('#blockEditor .image-block .image-preview img');
  await expect(image).toHaveCount(1);
  await expect
    .poll(() =>
      image.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 120),
    )
    .toBe(true);
  await page.evaluate(async () => {
    const modulePath = '/src/store/workspace.store.ts';
    const { useWorkspaceStore } = await import(modulePath);
    await useWorkspaceStore.getState().controller.flush();
  });
  const saved = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    return (await (await root.getFileHandle('SVG.md')).getFile()).text();
  });
  expect(saved).not.toContain('data:image/svg+xml');
  const attachment = saved.match(/!\[\[(\.attachments\/[^\]]+\.svg)\]\]/)?.[1];
  expect(attachment).toBeTruthy();
  const stored = await page.evaluate(async (path) => {
    const root = await navigator.storage.getDirectory();
    const folder = await root.getDirectoryHandle('.attachments');
    return (await (await folder.getFileHandle(path!.split('/').at(-1)!)).getFile()).text();
  }, attachment);
  expect(stored).toBe(source);
  await page.reload();
  await expect(image).toHaveCount(1);
  await expect
    .poll(() =>
      image.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 120),
    )
    .toBe(true);
});

test('SVG pasted into a local note is written to attachments and referenced from Markdown', async ({
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
    const root = await navigator.storage.getDirectory();
    const stream = await (await root.getFileHandle('Pasted.md', { create: true })).createWritable();
    await stream.write('Before\n');
    await stream.close();
  });
  await page.locator('#chooseDirectoryBtn').click();
  await page
    .locator('#pageTree [data-action="open-page"]')
    .filter({ hasText: /^Pasted$/ })
    .click();
  await page
    .locator('#blockEditor .block-content')
    .first()
    .evaluate((content, svg) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', svg);
      content.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
      );
    }, svg);
  const image = page.locator('.image-preview img');
  await expect
    .poll(() =>
      image.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 120),
    )
    .toBe(true);
  await page.evaluate(async () => {
    const modulePath = '/src/store/workspace.store.ts';
    const { useWorkspaceStore } = await import(modulePath);
    await useWorkspaceStore.getState().controller.flush();
  });
  const saved = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const markdown = await (await (await root.getFileHandle('Pasted.md')).getFile()).text();
    const name = markdown.match(/!\[\[\.attachments\/([^\]]+\.svg)\]\]/)?.[1];
    if (!name) throw new Error('Missing SVG attachment reference');
    const folder = await root.getDirectoryHandle('.attachments');
    const contents = await (await (await folder.getFileHandle(name)).getFile()).text();
    return { markdown, contents };
  });
  expect(saved.markdown).not.toContain('data:image/svg+xml');
  expect(saved.contents).toContain('<rect');
  expect(saved.contents).toContain('xmlns="http://www.w3.org/2000/svg"');
  await page.reload();
  await expect
    .poll(() =>
      image.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 120),
    )
    .toBe(true);
});

for (const format of [
  'file',
  'untyped-file',
  'text/plain',
  'image/svg+xml',
  'text/html',
  'fenced-svg',
  'fenced-xml',
  'text/markdown',
  'html-code',
]) {
  test(`pasting SVG as ${format} creates and persists an image block`, async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
    await page.locator('#newPageBtn').click();
    await page.locator('#blockEditor .block-content').first().fill('Keep this text.');
    const handled = await page.evaluate(
      ({ format, svg }) => {
        const data = new DataTransfer();
        if (format.endsWith('file')) {
          data.items.add(
            new File([svg], 'diagram.svg', {
              type: format === 'file' ? 'image/svg+xml' : 'application/octet-stream',
            }),
          );
        } else if (format.startsWith('fenced-') || format === 'text/markdown') {
          data.setData(
            format === 'text/markdown' ? format : 'text/plain',
            `\`\`\`${format === 'fenced-xml' ? 'xml' : 'svg'}\n${svg}\n\`\`\``,
          );
        } else if (format === 'html-code') {
          data.setData(
            'text/html',
            `<pre><code class="language-svg">${svg.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</code></pre>`,
          );
        } else {
          data.setData(
            format,
            format === 'text/html' ? `<div>${svg}</div>` : `<?xml version="1.0"?>\n${svg}`,
          );
        }
        const content = document.querySelector<HTMLElement>('#blockEditor .block-content')!;
        content.focus();
        const event = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: data,
        });
        content.dispatchEvent(event);
        return event.defaultPrevented;
      },
      { format, svg },
    );
    expect(handled).toBe(true);
    const images = page.locator('#blockEditor .image-block');
    await expect(images).toHaveCount(1);
    const image = images.locator('.image-preview img');
    await expect
      .poll(() =>
        image.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 120),
      )
      .toBe(true);
    await expect(page.locator('#blockEditor .block-content').first()).toHaveText('Keep this text.');
    await page.evaluate(async () => {
      const modulePath = '/src/store/workspace.store.ts';
      const { useWorkspaceStore } = await import(modulePath);
      const controller = useWorkspaceStore.getState().controller;
      await controller.flush();
      const document = controller.getDocument();
      const note = document.pages.find(
        (note: { id: string }) => note.id === document.currentPageId,
      );
      const image = note.blocks.find((block: { type: string }) => block.type === 'image');
      if (!image.src.startsWith('.attachments/') || !image.src.endsWith('.svg'))
        throw new Error('SVG was not saved as an attachment');
      const markdown = controller
        .invoke('serializeMarkdownWorkspace', document)
        .find(
          (file: { path: string }) =>
            file.path === note.filePath || file.path.endsWith(`${note.title}.md`),
        ).content;
      if (!markdown.includes(`![[${image.src}]]`) || markdown.includes('data:image/svg+xml'))
        throw new Error('Missing SVG attachment reference');
    });
    await page.reload();
    await expect(images).toHaveCount(1);
    await expect
      .poll(() =>
        image.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 120),
      )
      .toBe(true);
  });
}

test('SVG source pasted into a code block stays code', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.locator('#newPageBtn').click();
  await page.locator('#blockEditor .block-content').first().pressSequentially('/code');
  await page.locator('.slash-item').filter({ hasText: /^Code/ }).click();
  const handled = await page.locator('[data-code-editor]').evaluate((input, svg) => {
    const data = new DataTransfer();
    data.setData('text/plain', svg);
    const event = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: data,
    });
    input.dispatchEvent(event);
    return event.defaultPrevented;
  }, svg);
  expect(handled).toBe(false);
  await expect(page.locator('#blockEditor .image-block')).toHaveCount(0);
});

test('invalid SVG is not extracted as an image', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.locator('#newPageBtn').click();
  for (const [type, source] of [['text/plain', '<svg><rect></svg>']]) {
    await page
      .locator('#blockEditor .block-content')
      .first()
      .evaluate(
        (content, [type, source]) => {
          const data = new DataTransfer();
          data.setData(type, source);
          content.dispatchEvent(
            new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
          );
        },
        [type, source],
      );
    await expect(page.locator('#blockEditor .image-block')).toHaveCount(0);
  }
});

for (const inline of [false, true]) {
  test(`SVG with surrounding HTML text becomes an image block (${inline ? 'inline' : 'separate'})`, async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await page.locator('#newPageBtn').click();
    await page
      .locator('#blockEditor .block-content')
      .first()
      .evaluate(
        (content, html) => {
          const data = new DataTransfer();
          data.setData('text/html', html);
          content.dispatchEvent(
            new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
          );
        },
        inline
          ? `<p><strong>Before</strong>${svg}<em>After</em></p>`
          : `<p><strong>Before</strong></p>${svg}<p><em>After</em></p>`,
      );
    const blocks = page.locator('#blockEditor > .block-row');
    await expect(blocks).toHaveCount(3);
    await expect(blocks.nth(0)).toContainText('Before');
    await expect(blocks.nth(1)).toHaveAttribute('data-type', 'image');
    await expect(blocks.nth(2)).toContainText('After');
    const image = blocks.nth(1).locator('.image-preview img');
    await expect
      .poll(() =>
        image.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 120),
      )
      .toBe(true);
    await page.evaluate(async () => {
      const modulePath = '/src/store/workspace.store.ts';
      const { useWorkspaceStore } = await import(modulePath);
      await useWorkspaceStore.getState().controller.flush();
    });
    await page.reload();
    await expect(blocks).toHaveCount(3);
    await expect(blocks.nth(1)).toHaveAttribute('data-type', 'image');
    await expect
      .poll(() =>
        image.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 120),
      )
      .toBe(true);
  });
}

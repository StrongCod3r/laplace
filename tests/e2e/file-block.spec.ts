import { expect, test } from '@playwright/test';

for (const docked of [false, true]) {
  test(`File uploads, downloads, replaces and round trips in the ${docked ? 'split' : 'main'} editor`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('#pageTitle')).toBeVisible();
    await page.locator('#newPageBtn').click();
    await page.locator('#pageTitle').fill('File test');
    const content = page.locator('#blockEditor .block-content').first();
    await content.click();
    await page.keyboard.type('/file');
    await page.locator('[data-slash-type="file"]').click();
    await expect(page.locator('#blockEditor [data-type="file"]')).toHaveCount(1);
    if (docked) {
      await page
        .locator('.editor-tab')
        .filter({ hasText: 'Getting Started' })
        .locator('[data-tab-close]')
        .click();
      await page.keyboard.press('Control+Alt+ArrowRight');
    }
    const editor = page.locator(docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor');
    const cards = editor.locator('[data-type="file"]');
    const first = cards.first();
    const originalId = await first.getAttribute('data-block-id');
    const choose = page.waitForEvent('filechooser');
    await first.getByRole('button', { name: 'Upload file', exact: true }).click();
    await (
      await choose
    ).setFiles([
      {
        name: 'report (1).pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('first file bytes'),
      },
      {
        name: 'report (1).pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('second file bytes'),
      },
    ]);
    await expect(cards).toHaveCount(2);
    await expect(first.locator('[data-file-meta]')).toHaveText('PDF · 16 B');
    await expect(first).toHaveAttribute('data-block-id', originalId!);
    await first.locator('summary').click();
    await expect(first.locator('details')).toHaveAttribute('open', '');
    await first.getByRole('textbox', { name: 'File display name' }).click();
    await expect(first.locator('details')).toHaveAttribute('open', '');
    await page.locator(docked ? '.dock-pane.active [data-dock-title]' : '#pageTitle').click();
    await expect(first.locator('details')).not.toHaveAttribute('open');
    await first.locator('summary').click();
    await first.getByRole('textbox', { name: 'File display name' }).fill('Project report');
    await first.getByRole('button', { name: 'Save name', exact: true }).click();
    await expect(first.locator('.file-name')).toHaveText('Project report');
    const downloadEvent = page.waitForEvent('download');
    await first.getByRole('button', { name: 'Download file' }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe('report (1).pdf');
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe('first file bytes');

    const pane = page.locator(docked ? '.dock-pane.active' : '#pageEditor');
    const toggle = page.locator(
      docked
        ? '.dock-pane.active [data-page-plain-text-toggle]'
        : '#breadcrumbs [data-page-plain-text-toggle]',
    );
    await toggle.click();
    await expect(pane.locator('[data-plain-text-content]')).toContainText(
      '[Project report](.attachments/',
    );
    await expect(pane.locator('[data-plain-text-content]')).toContainText(
      '<!-- laplace:file: {"version":1,"name":"report (1).pdf"} -->',
    );
    await toggle.click();
    await first.locator('summary').click();
    const replacement = page.waitForEvent('filechooser');
    await first.getByRole('button', { name: 'Replace file' }).click();
    await (
      await replacement
    ).setFiles({
      name: 'replacement.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('zip data'),
    });
    await expect(first.locator('[data-file-meta]')).toHaveText('ZIP · 8 B');
    await expect(first.locator('.file-name')).toHaveText('Project report');
    await page.keyboard.press('Control+z');
    await expect(first.locator('[data-file-meta]')).toHaveText('PDF · 16 B');
    await first.locator('summary').click();
    await first.getByRole('button', { name: 'Remove block' }).click();
    await expect(cards).toHaveCount(1);
    await page.keyboard.press('Control+z');
    await expect(cards).toHaveCount(2);
    await expect(first.locator('.file-name')).toHaveText('Project report');
    await expect(first.locator('[data-file-meta]')).toHaveText('PDF · 16 B');
    // Wait for the ordinary debounced workspace save before testing a fresh controller.
    await page.waitForTimeout(400);
    await page.reload();
    await expect(
      page.locator('[data-type="file"] .file-name').filter({ hasText: 'Project report' }).first(),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('File persists real Markdown and attachments without overwriting an existing filename', async ({
  page,
}, testInfo) => {
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
    const note = await (await root.getFileHandle('Files.md', { create: true })).createWritable();
    await note.write('Upload here\nKeep this paragraph\n');
    await note.close();
    const folder = await root.getDirectoryHandle('.attachments', { create: true });
    const file = await (
      await folder.getFileHandle('report.pdf', { create: true })
    ).createWritable();
    await file.write('Existing file');
    await file.close();
  });
  await page.locator('#chooseDirectoryBtn').click();
  await page.getByRole('tree').getByRole('button', { name: 'Files', exact: true }).click();
  const content = page.locator('#blockEditor .block-content').first();
  await content.fill('');
  await content.pressSequentially('/file');
  await page.locator('[data-slash-type="file"]').click();
  const choose = page.waitForEvent('filechooser');
  await page
    .locator('#blockEditor')
    .getByRole('button', { name: 'Upload file', exact: true })
    .click();
  await (
    await choose
  ).setFiles({ name: 'report.pdf', mimeType: 'application/pdf', buffer: Buffer.from('New file') });
  const card = page.locator('#blockEditor [data-type="file"]');
  await expect(card.locator('[data-file-meta]')).toHaveText('PDF · 8 B');
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        return (await (await root.getFileHandle('Files.md')).getFile()).text();
      }),
    )
    .toMatch(
      /\[report\.pdf\]\(\.attachments\/[^\n]+\)\n<!-- laplace:file: \{"version":1\} -->\nKeep this paragraph/,
    );
  const existing = await page.evaluate(async () => {
    const folder = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('.attachments');
    return (await (await folder.getFileHandle('report.pdf')).getFile()).text();
  });
  expect(existing).toBe('Existing file');
  await page.screenshot({ path: testInfo.outputPath('file-card.png') });
  await page.reload();
  await expect(page.locator('#blockEditor [data-type="file"] [data-file-meta]')).toHaveText(
    'PDF · 8 B',
  );
  await expect(page.locator('#blockEditor .block-content')).toHaveText('Keep this paragraph');
});

test('File accepts dropped files and preserves missing attachments as replaceable cards', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await page.locator('#newPageBtn').click();
  const content = page.locator('#blockEditor .block-content').first();
  await content.evaluate((element) => {
    const data = new DataTransfer();
    data.setData(
      'text/markdown',
      '[Missing](.attachments/missing.zip)\n<!-- laplace:file: {"version":1} -->',
    );
    (element as HTMLElement).focus();
    element.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
    );
  });
  const card = page.locator('#blockEditor [data-type="file"]');
  await expect(card.locator('[data-file-meta]')).toHaveText('File not found');
  await expect(card.getByRole('button', { name: 'Download file' })).toBeDisabled();
  await card.locator('[data-file-card]').evaluate((element) => {
    const data = new DataTransfer();
    data.items.add(new File(['hello'], 'hello.txt', { type: 'text/plain' }));
    element.dispatchEvent(
      new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }),
    );
  });
  await expect(card.locator('[data-file-meta]')).toHaveText('TXT · 5 B');
  await expect(card.getByRole('button', { name: 'Download file' })).toBeEnabled();
});

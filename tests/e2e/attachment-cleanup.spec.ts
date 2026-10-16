import { expect, test } from '@playwright/test';

type IterableDirectory = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};

test('Attachments cleans only unused files after confirmation, including nested assets', async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => navigator.storage.getDirectory(),
    });
  });
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible({ timeout: 30000 });
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const attachments = await root.getDirectoryHandle('.attachments', { create: true });
    const write = async (folder: FileSystemDirectoryHandle, name: string, contents: string) => {
      const stream = await (await folder.getFileHandle(name, { create: true })).createWritable();
      await stream.write(contents);
      await stream.close();
    };
    await write(
      root,
      'References.md',
      '![[used.svg]]\n[Manual](.attachments/manual.pdf)\n<video src=".attachments/movie.mp4"></video>\n',
    );
    await write(
      attachments,
      'used.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><image href="nested.png"/></svg>',
    );
    await write(attachments, 'nested.png', 'dependency');
    await write(attachments, 'manual.pdf', 'manual');
    await write(attachments, 'movie.mp4', 'video');
    await write(attachments, 'orphan.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const sub = await attachments.getDirectoryHandle('sub', { create: true });
    await write(sub, 'orphan.pdf', 'unused');
  });
  await page.locator('#chooseDirectoryBtn').click();
  await page.getByRole('button', { name: 'Attachments', exact: true }).click();
  const gallery = page.getByRole('region', { name: 'Attachments', exact: true });
  await expect(gallery.getByRole('listitem')).toHaveCount(6);
  for (const name of ['used.svg', 'manual.pdf', 'movie.mp4']) {
    await expect(
      gallery
        .getByRole('listitem')
        .filter({ has: page.locator('b', { hasText: name }) })
        .getByRole('button', { name: `Show references for ${name}`, exact: true }),
    ).toHaveText('Used in 1 page');
  }
  await gallery
    .getByRole('button', { name: 'Show references for manual.pdf', exact: true })
    .click();
  await expect(page.locator('#rightSidebarContent')).toContainText('References');
  await expect(page.locator('#rightSidebarContent')).toContainText('1 reference');
  await gallery.getByRole('list').evaluate((list) => {
    (window as any).attachmentGalleryBeforeCleanup = {
      list,
      cards: [...list.children],
      sources: [...list.querySelectorAll('img')].map((image) => image.src),
    };
  });
  const clean = gallery.getByRole('button', { name: 'Clean unused assets', exact: true });
  await clean.click();
  const confirmation = page.getByRole('alertdialog', { name: 'Delete unused attachments?' });
  await expect(confirmation).toContainText('2 unused files');
  await expect(confirmation).toContainText('orphan.svg');
  await expect(confirmation).toContainText('orphan.pdf');
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(clean).toBeEnabled();
  await expect(gallery.getByRole('listitem')).toHaveCount(6);
  expect(
    await gallery.getByRole('list').evaluate((list) => {
      const previous = (window as any).attachmentGalleryBeforeCleanup;
      return {
        sameList: list === previous.list,
        sameCards: [...list.children].every((card, index) => card === previous.cards[index]),
        sameSources:
          JSON.stringify([...list.querySelectorAll('img')].map((image) => image.src)) ===
          JSON.stringify(previous.sources),
      };
    }),
  ).toEqual({ sameList: true, sameCards: true, sameSources: true });
  await expect(
    gallery.getByRole('button', { name: 'Show references for manual.pdf', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await clean.click();
  await confirmation.getByRole('button', { name: 'Delete unused files', exact: true }).click();
  await expect(gallery.getByRole('listitem')).toHaveCount(4);
  const remaining = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const folder = (await root.getDirectoryHandle('.attachments')) as IterableDirectory;
    const names: string[] = [];
    for await (const [name, entry] of folder.entries()) if (entry.kind === 'file') names.push(name);
    const sub = (await folder.getDirectoryHandle('sub')) as IterableDirectory;
    for await (const [name] of sub.entries()) names.push(`sub/${name}`);
    return names.sort();
  });
  expect(remaining).toEqual(['manual.pdf', 'movie.mp4', 'nested.png', 'used.svg']);
  await clean.click();
  await expect(page.getByRole('alertdialog', { name: 'Delete unused attachments?' })).toBeHidden();
  await expect(page.locator('#toast')).toContainText('No unused attachments found');
  await page.reload();
  await page.getByRole('button', { name: 'Attachments', exact: true }).click();
  await expect(gallery.getByRole('listitem')).toHaveCount(4);
  expect(errors).toEqual([]);
});

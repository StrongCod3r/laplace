import { expect, test } from '@playwright/test';

test('Attachments keeps its header and pagination fixed and filters all pages by file pattern', async ({
  page,
}) => {
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
    const folder = await root.getDirectoryHandle('.attachments', { create: true });
    for (let index = 0; index < 30; index++) {
      const name = `asset-${String(index).padStart(2, '0')}.pdf`;
      const stream = await (await folder.getFileHandle(name, { create: true })).createWritable();
      await stream.write('test attachment');
      await stream.close();
    }
  });
  await page.locator('#chooseDirectoryBtn').click();
  await page.getByRole('button', { name: 'Attachments', exact: true }).click();
  const gallery = page.getByRole('region', { name: 'Attachments', exact: true });
  const content = gallery.locator('.attachments-gallery-content');
  const header = gallery.locator('header');
  const footer = gallery.getByRole('navigation', { name: 'Attachment pages' });
  const filter = gallery.getByRole('searchbox', { name: 'Filter attachments by file pattern' });
  await expect(gallery.getByRole('listitem')).toHaveCount(24);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.body.classList.toggle('dark', value === 'dark');
    }, theme);
    await page.setViewportSize({ width: 900, height: 500 });
    const before = await header.boundingBox();
    const footerBefore = await footer.boundingBox();
    await expect(footer.getByRole('button', { name: 'Next', exact: true })).toBeInViewport();
    await content.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(await content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await header.boundingBox()).toEqual(before);
    expect(await footer.boundingBox()).toEqual(footerBefore);
    expect(
      await content.evaluate((element) =>
        element.contains(document.querySelector('.attachments-pagination')),
      ),
    ).toBe(false);
    await expect(footer.getByRole('button', { name: 'Previous', exact: true })).toBeInViewport();
    await expect(filter).toBeInViewport();
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await gallery.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(gallery.getByRole('listitem')).toHaveCount(6);
  await expect(content).toHaveJSProperty('scrollTop', 0);
  await expect(footer.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await filter.fill('ASSET-2?.PDF');
  await expect(gallery.getByRole('listitem')).toHaveCount(10);
  await expect(gallery.getByRole('listitem').locator('b')).toHaveText([
    ...Array.from({ length: 10 }, (_, index) => `asset-${20 + index}.pdf`),
  ]);
  await expect(gallery.getByRole('navigation', { name: 'Attachment pages' })).toHaveCount(0);
  await expect(content).toHaveJSProperty('scrollTop', 0);
  await filter.fill('asset-00.pdf; asset-29.pdf;');
  await expect(gallery.getByRole('listitem').locator('b')).toHaveText([
    'asset-00.pdf',
    'asset-29.pdf',
  ]);
  await filter.fill('[');
  await expect(filter).toHaveAttribute('aria-invalid', 'false');
  await expect(content).toContainText('No attachments match this pattern.');
  await filter.fill('does-not-exist');
  await expect(filter).toHaveAttribute('aria-invalid', 'false');
  await expect(content).toContainText('No attachments match this pattern.');
  await filter.fill('*.pdf');
  await expect(gallery.getByRole('listitem')).toHaveCount(24);
  await gallery.getByRole('button', { name: 'Clear filter attachments by file pattern' }).click();
  await expect(filter).toHaveValue('');
  await expect(filter).toBeFocused();
  await expect(gallery.getByRole('listitem')).toHaveCount(24);
  await expect(
    gallery.getByRole('button', { name: 'Clear filter attachments by file pattern' }),
  ).toHaveCount(0);
  const filterStyle = await filter.evaluate((input) => {
    const css = getComputedStyle(input);
    return [css.height, css.borderRadius, css.backgroundColor, css.padding, css.fontSize];
  });
  await page.locator('[data-ribbon-action="graph"]').click();
  const graphFilter = page.getByRole('searchbox', { name: 'Filter notes', exact: true });
  expect(
    await graphFilter.evaluate((input) => {
      const css = getComputedStyle(input);
      return [css.height, css.borderRadius, css.backgroundColor, css.padding, css.fontSize];
    }),
  ).toEqual(filterStyle);
  await graphFilter.fill('Example');
  await page.getByRole('button', { name: 'Clear filter notes', exact: true }).click();
  await expect(graphFilter).toHaveValue('');
  await expect(graphFilter).toBeFocused();
  await expect(page.getByRole('button', { name: 'Clear filter notes', exact: true })).toHaveCount(
    0,
  );
});

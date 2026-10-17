import { expect, test } from '@playwright/test';

test('legacy closed toggles become paragraphs without losing nested content or formatting', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  await page.evaluate(async () => {
    const { useWorkspaceStore } = await import(
      new URL('src/store/workspace.store.ts', location.href).href
    );
    await useWorkspaceStore.getState().controller.flush();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('laplace-local-workspace', 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('vaults', 'readwrite');
      const store = transaction.objectStore('vaults');
      const request = store.getAll();
      request.onsuccess = () => {
        const record = request.result.find((record) => record.workspace);
        const note = record.workspace.pages.find(
          (note: { id: string }) => note.id === record.workspace.currentPageId,
        );
        note.blocks = [
          {
            id: 'legacy-parent',
            type: 'toggle',
            text: 'Important',
            open: false,
            inlineFormats: [{ start: 0, end: 9, type: 'bold' }],
            children: [
              { id: 'legacy-quote', type: 'quote', text: 'A preserved quote.', quoteDepth: 2 },
              {
                id: 'legacy-nested',
                type: 'toggle',
                text: 'Nested title',
                open: false,
                children: [
                  { id: 'legacy-child', type: 'text', text: 'Previously hidden content.' },
                ],
              },
            ],
          },
        ];
        store.put(record);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });
  await page.reload();
  const editor = page.locator('#blockEditor');
  await expect(editor.locator('.block-row')).toHaveCount(4);
  await expect(editor.locator('[data-type="toggle"], .toggle-prefix')).toHaveCount(0);
  await expect(editor.locator('[data-block-id="legacy-parent"] strong')).toHaveText('Important');
  await expect(editor.locator('[data-block-id="legacy-quote"]')).toHaveAttribute(
    'data-type',
    'quote',
  );
  await expect(editor.locator('[data-block-id="legacy-child"]')).toContainText(
    'Previously hidden content.',
  );
  await page.locator('[data-page-plain-text-toggle]').click();
  await expect(page.locator('[data-plain-text-content]')).toContainText('Important');
  await expect(page.locator('[data-plain-text-content]')).toContainText('Nested title');
  await expect(page.locator('[data-plain-text-content]')).toContainText(
    'Previously hidden content.',
  );
  await page.reload();
  await expect(editor.locator('.block-row')).toHaveCount(4);
});

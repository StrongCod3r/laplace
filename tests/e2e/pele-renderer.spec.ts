import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

for (const production of [false, true]) {
  test(`bundled Pele renders without a CDN, recovers from errors and exports current code (${production ? 'production' : 'development'})`, async ({
    page,
  }) => {
    await page.route('https://**', (route) => route.abort());
    await page.goto(production ? 'http://127.0.0.1:4176/laplace/' : '/');
    await expect(page.locator('#pageTitle')).toHaveText('Getting Started');
    const row = page.locator('[data-block-id="getting_started_mermaid"]');
    await expect(row.locator('svg.pele-flowchart')).toBeVisible();
    await row.locator('[data-code-mode-toggle]').click();
    await row.locator('[data-code-view-mode="split"]').click();
    const code = row.locator('[data-code-editor]');
    await code.fill('not a diagram');
    await expect(row.locator('[data-mermaid-status]')).toContainText('Diagram error:');
    await expect(row.locator('[data-mermaid-canvas] svg')).toHaveCount(0);
    await code.fill('sequenceDiagram\n Alice->>Bob: Recovered');
    await expect(row.locator('svg.pele-sequence')).toBeVisible();
    await expect(row.locator('[data-mermaid-status]')).toBeHidden();
    await row.locator('[data-code-mode-toggle]').click();
    await row.locator('[data-code-view-mode="code"]').click();
    await code.fill('flowchart LR\n Fresh --> Export');
    const event = page.waitForEvent('download');
    await row.locator('[data-mermaid-download]').click();
    const download = await event;
    const source = await readFile((await download.path())!, 'utf8');
    expect(source).toContain('Fresh');
    expect(source).toContain('Export');
    expect(source).not.toContain('Recovered');
    expect(source).toContain('pele-flowchart');
  });
}

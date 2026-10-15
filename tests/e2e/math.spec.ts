import { expect, test, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function setMathMode(block: Locator, mode: 'code' | 'preview' | 'split') {
  await block.locator('[data-code-mode-toggle]').click();
  await block.locator(`[data-code-view-mode="${mode}"]`).click();
}

async function openMathPage(page: Page, markdown: string) {
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  await page.locator('#newPageBtn').click();
  await page.locator('#pageTitle').fill('Math regression');
  await page.evaluate((source) => {
    const data = new DataTransfer();
    data.setData('text/markdown', source);
    const content = document.querySelector<HTMLElement>('#blockEditor .block-content')!;
    content.focus();
    content.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
    );
  }, markdown);
}

for (const dark of [false, true]) {
  test(`inline math preserves native text, editing, source and reload in ${dark ? 'dark' : 'light'} theme`, async ({
    page,
  }) => {
    const original = String.raw`Before $\frac{x_1}{2}$ after \(\sqrt{y}\).`;
    await openMathPage(page, original + '\n\nOther paragraph');
    await page.evaluate((value) => document.body.classList.toggle('dark', value), dark);
    const content = page.locator('#blockEditor .block-content').first();
    await page.locator('#pageTitle').click();
    const hosts = content.locator('[data-inline-math]');
    await expect(hosts).toHaveCount(2);
    await expect(hosts.first().locator('.katex')).toBeVisible();
    expect(await content.innerText()).toBe(original);
    expect(
      await content.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return { text: element.textContent, selected: range.toString(), html: element.innerHTML };
      }),
    ).toMatchObject({ text: original, selected: original });
    expect(await content.innerHTML()).not.toContain('katex');
    await hosts.first().locator('.katex').click();
    await expect(page.locator('[data-equation-input]')).toHaveValue('\\frac{x_1}{2}');
    await page.locator('[data-equation-input]').press('Escape');
    await expect(content).toBeFocused();
    await content.press('End');
    await page.keyboard.type(' More $z^2$.');
    await page.locator('#pageTitle').click();
    await expect(content.locator('[data-inline-math]')).toHaveCount(3);
    const toggle = page.locator('#breadcrumbs [data-page-plain-text-toggle]');
    await toggle.click();
    await expect(page.locator('#pageEditor [data-plain-text-content]')).toContainText(
      original + ' More $z^2$.',
    );
    await toggle.click();
    // Navigation and a reload exercise persisted source rather than rendered KaTeX text.
    await page.evaluate(async () => {
      const url = new URL('src/store/workspace.store.ts', location.href).href;
      const { useWorkspaceStore } = await import(url);
      await useWorkspaceStore.getState().controller.flush();
    });
    await page.reload();
    await expect(page.locator('#pageTitle')).toHaveText('Math regression');
    await expect(page.locator('#blockEditor [data-inline-math]')).toHaveCount(3);
    expect(await page.locator('#blockEditor .block-content').first().innerText()).toBe(
      original + ' More $z^2$.',
    );
    await expect(
      page.locator('#blockEditor [data-inline-math]').first().locator('.katex'),
    ).toBeVisible();
    await page.screenshot({ path: `test-results/math-${dark ? 'dark' : 'light'}.png` });
  });
}

test('display math previews update, recover from errors and work in both split panes', async ({
  page,
}) => {
  const formula = String.raw`\int_0^1 x^2\,dx = \frac{1}{3}`;
  await openMathPage(
    page,
    '```tex\n' + formula + '\n```\n\n$$\n\\sum_{n=1}^N n\n$$\n\nInline $a^2$',
  );
  await expect(page.locator('#blockEditor [data-math-preview] .katex-display')).toHaveCount(2);
  await expect(page.locator('#blockEditor [data-code-editor]').first()).toBeHidden();
  await setMathMode(page.locator('#blockEditor .code-block').first(), 'split');
  const code = page.locator('#blockEditor [data-code-editor]').first();
  await expect(code).toHaveValue(formula);
  await code.fill('\\frac{');
  await expect(
    page.locator('#blockEditor [data-math-preview]').first().locator('.math-error'),
  ).toHaveText('\\frac{');
  await code.fill('\\sqrt{2}');
  await expect(
    page.locator('#blockEditor [data-math-preview]').first().locator('.katex'),
  ).toBeVisible();
  await page
    .locator('.editor-tab')
    .filter({ hasText: 'Getting Started' })
    .locator('[data-tab-close]')
    .click();
  await page.keyboard.press('Control+Alt+ArrowRight');
  for (const pane of await page.locator('.dock-pane').all()) {
    await expect(pane.locator('[data-math-preview] .katex-display')).toHaveCount(2);
    await expect(pane.locator('[data-inline-math] .katex')).toBeVisible();
  }
  const active = page.locator('.dock-pane.active');
  await active.locator('[data-code-editor]').first().fill('x^3');
  for (const pane of await page.locator('.dock-pane').all()) {
    await expect(pane.locator('[data-code-editor]').first()).toHaveValue('x^3');
  }
});

for (const dark of [false, true]) {
  test(`aligned display math accepts Markdown delimiters in a LaTeX block in ${dark ? 'dark' : 'light'} theme`, async ({
    page,
  }) => {
    const formula = String.raw`\begin{aligned}
(x + y)^2 &= (x + y)(x + y) \\
           &= x^2 + xy + yx + y^2 \\
           &= x^2 + 2xy + y^2
\end{aligned}`;
    const markdown = '$$\n' + formula + '\n$$';
    await openMathPage(page, markdown);
    await page.evaluate((enabled) => document.body.classList.toggle('dark', enabled), dark);
    const code = page.locator('#blockEditor [data-code-editor]');
    const preview = page.locator('#blockEditor [data-math-preview]');
    await expect(code).toHaveValue(formula);
    await expect(preview.locator('.math-error')).toHaveCount(0);
    await expect(preview.locator('mtr')).toHaveCount(3);
    const baseline = await preview.locator('.katex-html').innerHTML();
    await setMathMode(page.locator('#blockEditor .code-block'), 'split');
    await code.fill(markdown);
    await expect(preview.locator('.katex-display')).toBeVisible();
    await expect(preview.locator('.math-error')).toHaveCount(0);
    expect(await preview.locator('.katex-html').innerHTML()).toBe(baseline);
    await expect(code).toHaveValue(markdown);
    await page.screenshot({ path: `test-results/math-aligned-${dark ? 'dark' : 'light'}.png` });
    await code.fill('\\[\n' + formula + '\n\\]');
    await expect(preview.locator('.math-error')).toHaveCount(0);
    expect(await preview.locator('.katex-html').innerHTML()).toBe(baseline);
    await page.locator('#breadcrumbs [data-page-plain-text-toggle]').click();
    await expect(page.locator('#pageEditor [data-plain-text-content]')).toContainText(
      '\\[\n' + formula + '\n\\]',
    );
  });
}

test('math toolbar switches modes, defaults new languages to preview and downloads a standalone SVG', async ({
  page,
  context,
}, testInfo) => {
  await openMathPage(page, '```latex\n\\frac{x^2}{2}\n```\n\n```plain\ny^2\n```');
  const block = page.locator('#blockEditor .code-block').first();
  const code = block.locator('[data-code-editor]');
  const preview = block.locator('[data-math-preview]');
  await expect(block).toHaveClass(/math-mode-preview/);
  await expect(code).toBeHidden();
  await expect(preview).toBeVisible();
  await block.locator('[data-code-mode-toggle]').click();
  await expect(block.locator('[data-code-view-mode="preview"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.locator('#pageTitle').click();
  await expect(block.locator('[data-code-mode-toolbar]')).toBeHidden();
  await setMathMode(block, 'code');
  await expect(code).toBeVisible();
  await expect(preview).toBeHidden();
  await code.fill('\\sum_{n=1}^{N} n');
  await setMathMode(block, 'split');
  await expect(code).toBeVisible();
  await expect(preview).toBeVisible();
  await setMathMode(block, 'preview');
  const downloadEvent = page.waitForEvent('download');
  await block.locator('[data-math-download]').click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('Math regression.svg');
  const path = testInfo.outputPath('formula.svg');
  await download.saveAs(path);
  const svg = await readFile(path, 'utf8');
  expect(svg).toContain('data:font/woff2;base64,');
  expect(svg).not.toContain('/node_modules/');
  expect(svg).not.toContain('/laplace/assets/');
  const exportPage = await context.newPage();
  await exportPage.setContent('<body style="background:white"><img id="formula"></body>');
  const size = await exportPage.evaluate(async (source) => {
    const image = document.querySelector<HTMLImageElement>('#formula')!;
    image.src = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, svg);
  expect(size.width).toBeGreaterThan(40);
  expect(size.height).toBeGreaterThan(40);
  await exportPage.screenshot({ path: 'test-results/math-export.png' });
  await exportPage.close();
  const other = page.locator('#blockEditor .code-block').last();
  await other.locator('[data-code-language]').selectOption('latex');
  await expect(other).toHaveClass(/math-mode-preview/);
  await expect(other.locator('[data-code-editor]')).toBeHidden();
});

for (const docked of [false, true]) {
  test(`math display mode persists in the ${docked ? 'split' : 'main'} editor`, async ({
    page,
  }) => {
    await openMathPage(page, '```latex\nx^2\n```');
    if (docked) {
      await page
        .locator('.editor-tab')
        .filter({ hasText: 'Getting Started' })
        .locator('[data-tab-close]')
        .click();
      await page.keyboard.press('Control+Alt+ArrowRight');
    }
    const editor = docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor';
    const block = page.locator(`${editor} .code-block`);
    await expect(block).toHaveClass(/math-mode-preview/);
    await setMathMode(block, 'split');
    await block.locator('[data-code-editor]').fill('x^3');
    await page.evaluate(async () => {
      const url = new URL('src/store/workspace.store.ts', location.href).href;
      const { useWorkspaceStore } = await import(url);
      await useWorkspaceStore.getState().controller.flush();
    });
    await page.reload();
    await expect(block).toHaveClass(/math-mode-split/);
    await expect(block.locator('[data-code-editor]')).toBeVisible();
    await expect(block.locator('[data-code-editor]')).toHaveValue('x^3');
    await expect(block.locator('[data-math-preview]')).toBeVisible();
    await setMathMode(block, 'code');
    await expect(block.locator('[data-math-preview]')).toBeHidden();
  });
}

test('typing math creates a preview after leaving the paragraph and inline code stays literal', async ({
  page,
}) => {
  await openMathPage(page, '`$x_y$` and literal \\$5\n\nNext');
  const contents = page.locator('#blockEditor .block-content');
  await expect(page.locator('#blockEditor [data-inline-math]')).toHaveCount(0);
  await contents.last().fill('Typed $x_1 + x_2$');
  await page.locator('#pageTitle').click();
  await expect(contents.last().locator('[data-inline-math] .katex')).toBeVisible();
  await contents.last().evaluate((element: HTMLElement) => element.focus());
  await contents.last().press('Control+End');
  await page.keyboard.type(' + $y_1 + y_2$');
  await page.locator('#pageTitle').click();
  await expect(contents.last().locator('[data-inline-math]')).toHaveCount(2);
});

test('table formulas remain editable and preserve cell Markdown', async ({ page }) => {
  await openMathPage(page, '| Formula | Value |\n| --- | --- |\n| $x_1$ | $\\frac{1}{2}$ |');
  await page.locator('#pageTitle').click();
  const cell = page.locator('#blockEditor [data-table-cell="1:0"]');
  await expect(cell.locator('[data-inline-math] .katex')).toBeVisible();
  await cell.locator('[data-inline-math] .katex').click();
  await expect(page.locator('[data-equation-input]')).toHaveValue('x_1');
  await page.locator('[data-equation-input]').fill('y_2');
  await page.locator('[data-equation-input]').press('Enter');
  await expect(cell).toBeFocused();
  await page.locator('#pageTitle').click();
  await expect(cell.locator('[data-inline-math] .katex')).toBeVisible();
  expect(await cell.innerText()).toBe('$y_2$');
  await page.locator('#breadcrumbs [data-page-plain-text-toggle]').click();
  await expect(page.locator('#pageEditor [data-plain-text-content]')).toContainText('$y_2$');
  await expect(page.locator('#pageEditor [data-plain-text-content]')).toContainText(
    '$\\frac{1}{2}$',
  );
});

test.describe('production math', () => {
  test.use({ baseURL: 'http://127.0.0.1:4176', serviceWorkers: 'allow' });

  test('math fonts and the renderer remain available after an offline reload', async ({
    page,
    context,
  }) => {
    await openMathPage(page, 'Inline $x^2$\n\n```latex\n\\frac{1}{2}\\sqrt{x}\n```');
    await page.locator('#pageTitle').click();
    await expect(page.locator('#blockEditor [data-math-preview] .katex')).toBeVisible();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.evaluate(() => document.fonts.ready);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const fontUrls = performance
            .getEntriesByType('resource')
            .map((entry) => entry.name)
            .filter((url) => /KaTeX_.*\.woff2/.test(url));
          if (!fontUrls.length) return false;
          for (const name of await caches.keys()) {
            if (!name.startsWith('laplace-shell-')) continue;
            const cache = await caches.open(name);
            if ((await Promise.all(fontUrls.map((url) => cache.match(url)))).every(Boolean))
              return true;
          }
          return false;
        }),
      )
      .toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#pageTitle')).toBeVisible();
    await page.locator('#newPageBtn').click();
    await page.locator('#blockEditor .block-content').first().fill('Offline $x^2$');
    await page.locator('#pageTitle').click();
    await expect(page.locator('#blockEditor [data-inline-math] .katex')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('16px KaTeX_Math'))).toBe(true);
    await context.setOffline(false);
  });
});

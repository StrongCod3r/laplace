import { expect, test, type Page } from '@playwright/test';

async function start(page: Page) {
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  await page.locator('#newPageBtn').click();
  await page.locator('#pageTitle').fill('Inline equation test');
}

async function flush(page: Page) {
  await page.evaluate(async () => {
    const { useWorkspaceStore } = await import(
      new URL('src/store/workspace.store.ts', location.href).href
    );
    await useWorkspaceStore.getState().controller.flush();
  });
}

for (const dark of [false, true]) {
  test(`slash equations preview, cancel, apply, edit and undo in ${dark ? 'dark' : 'light'} theme`, async ({
    page,
  }) => {
    await start(page);
    await page.evaluate((value) => document.body.classList.toggle('dark', value), dark);
    const content = page.locator('#blockEditor .block-content').first();
    const panel = page.getByRole('dialog', { name: 'Inline equation', exact: true });
    const input = panel.locator('[data-equation-input]');
    await content.fill('/equation');
    await page.locator('[data-slash-type="inline-equation"]').click();
    await expect(panel).toBeVisible();
    await expect(input).toBeFocused();
    await expect(panel.locator('[data-equation-save]')).toBeDisabled();
    await input.fill('\\frac{');
    await expect(panel.locator('[data-equation-error]')).toBeVisible();
    await expect(panel.locator('[data-equation-save]')).toBeDisabled();
    await input.press('Escape');
    await expect(panel).toBeHidden();
    await expect(content).toHaveText('/equation');
    await expect(content).toBeFocused();
    await content.fill('/equation');
    await page.locator('[data-slash-type="inline-equation"]').click();
    await input.fill('\\frac{x^2}{2}');
    await expect(panel.locator('[data-equation-preview] .katex')).toBeVisible();
    await page.screenshot({ path: `test-results/inline-equation-${dark ? 'dark' : 'light'}.png` });
    await input.press('Enter');
    await expect(panel).toBeHidden();
    await expect(content).toHaveText('$\\frac{x^2}{2}$', { useInnerText: true });
    await expect(content.locator('[data-inline-math] .katex')).toBeVisible();
    await content.press('Control+z');
    await expect(content).toHaveText('/equation');
    await content.press('Control+Shift+z');
    await expect(content).toHaveText('$\\frac{x^2}{2}$', { useInnerText: true });
    await content.locator('[data-inline-math]').click();
    await expect(input).toHaveValue('\\frac{x^2}{2}');
    await input.fill('\\sqrt{x}');
    await panel.locator('[data-equation-save]').click();
    await expect(content).toHaveText('$\\sqrt{x}$', { useInnerText: true });
    await content.press('Control+z');
    await expect(content).toHaveText('$\\frac{x^2}{2}$', { useInnerText: true });
    await content.press('Control+Shift+z');
    await expect(content).toHaveText('$\\sqrt{x}$', { useInnerText: true });
    await flush(page);
    await page.reload();
    await expect(content).toHaveText('$\\sqrt{x}$', { useInnerText: true });
    await content.locator('[data-inline-math]').focus();
    await content.locator('[data-inline-math]').press('Enter');
    await expect(panel).toBeVisible();
    await panel.locator('[data-equation-remove]').click();
    await expect(content).toHaveText('');
    await content.press('Control+z');
    await expect(content).toHaveText('$\\sqrt{x}$', { useInnerText: true });
  });
}

test('the format toolbar converts a selected fragment while preserving its neighbors', async ({
  page,
}) => {
  await start(page);
  const content = page.locator('#blockEditor .block-content').first();
  await content.fill('Before x^2 after');
  await content.evaluate((element) => {
    const range = document.createRange();
    range.setStart(element.firstChild!, 7);
    range.setEnd(element.firstChild!, 10);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  });
  await expect(page.locator('[data-format-equation]')).toBeVisible();
  await page.locator('[data-format-equation]').click();
  await expect(page.locator('[data-equation-input]')).toHaveValue('x^2');
  await page.locator('[data-equation-input]').fill('\\sqrt{x}');
  await page.locator('[data-equation-input]').press('Enter');
  await expect(content).toHaveText('Before $\\sqrt{x}$ after', { useInnerText: true });
  await expect(content.locator('[data-inline-math] .katex')).toBeVisible();
});

test('equation edits preserve bold text, neighboring links and wikilink aliases', async ({
  page,
}) => {
  await start(page);
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData(
      'text/markdown',
      'Before **`x^2`** after [link](https://example.com) and [[Target|alias]]',
    );
    const content = document.querySelector<HTMLElement>('#blockEditor .block-content')!;
    content.focus();
    content.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
    );
  });
  const content = page.locator('#blockEditor .block-content').first();
  await content.locator('strong').evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  });
  await page.locator('[data-format-equation]').click();
  await page.locator('[data-equation-input]').fill('\\sqrt{x}');
  await page.locator('[data-equation-input]').press('Enter');
  await expect(content.locator('strong')).toHaveText('$\\sqrt{x}$', { useInnerText: true });
  await expect(content.locator('[data-inline-format="code"]')).toHaveCount(0);
  await expect(content.locator('a[data-inline-link]')).toHaveText('link');
  await expect(content.locator('.wiki-link')).toHaveText('alias');
  await page.locator('#breadcrumbs [data-page-plain-text-toggle]').click();
  const source = page.locator('#pageEditor [data-plain-text-content]');
  await expect(source).toContainText('**$\\sqrt{x}$**');
  await expect(source).toContainText('[link](https://example.com/)');
  await expect(source).toContainText('[[Target|alias]]');
});

test('leaving the equation editor discards its draft', async ({ page }) => {
  await start(page);
  const content = page.locator('#blockEditor .block-content').first();
  await content.fill('/equation');
  await page.locator('[data-slash-type="inline-equation"]').click();
  await page.locator('[data-equation-input]').fill('x^2');
  await page.locator('#newPageBtn').click();
  await expect(page.locator('#inlineEquationPanel')).toBeHidden();
  await expect(content).toHaveText('');
  await page.locator('.editor-tab').filter({ hasText: 'Inline equation test' }).click();
  await expect(content).toHaveText('/equation');
});

test('editing equations activates the correct split pane and preserves other notes', async ({
  page,
}) => {
  await start(page);
  await page.locator('#blockEditor .block-content').first().fill('Other note');
  await page.locator('#newPageBtn').click();
  await page.locator('#pageTitle').fill('Equation pane');
  await page.locator('#blockEditor .block-content').first().fill('Value $x^2$');
  await page.locator('#pageTitle').click();
  await page
    .locator('.editor-tab')
    .filter({ hasText: 'Getting Started' })
    .locator('[data-tab-close]')
    .click();
  await page.keyboard.press('Control+Alt+ArrowRight');
  const panes = page.locator('.dock-pane');
  const left = panes.first();
  const right = panes.last();
  await left.locator('.block-content').first().click();
  await right.locator('[data-inline-math]').click();
  await expect(page.locator('[data-equation-input]')).toHaveValue('x^2');
  await page.locator('[data-equation-input]').fill('x^3');
  await page.locator('[data-equation-input]').press('Enter');
  await expect(right.locator('.block-content').first()).toHaveText('Value $x^3$', {
    useInnerText: true,
  });
  await expect(left.locator('.block-content').first()).toHaveText('Other note');
});

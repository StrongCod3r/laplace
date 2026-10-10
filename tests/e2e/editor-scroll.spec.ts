import { expect, test, type Page } from '@playwright/test';

type ScrollProbe = {
  root: HTMLElement;
  image: HTMLImageElement;
  samples: number[];
  frame: number;
};

type ProbeWindow = Window & { scrollProbe?: ScrollProbe };

async function openLongPageWithImage(page: Page) {
  await page.goto('/');
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/workspace-read-only/);
  await page.locator('#newPageBtn').click();
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 720;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#778899';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!)));
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('laplace-local-workspace', 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('attachments', 'readwrite');
      transaction.objectStore('attachments').put({
        key: '.attachments/scroll-regression.png',
        value: blob,
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
    const paragraphs = Array.from(
      { length: 75 },
      (_, index) => `Paragraph ${index}: text before the caret and text after the caret.`,
    );
    const markdown = `![[.attachments/scroll-regression.png]]\n\n${paragraphs.join('\n\n')}`;
    const data = new DataTransfer();
    data.setData('text/markdown', markdown);
    data.setData('text/plain', markdown);
    const content = document.querySelector<HTMLElement>('#blockEditor .block-content')!;
    content.focus();
    content.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
    );
  });
  await expect(page.locator('#blockEditor .block-content').last()).toContainText('Paragraph 74:');
  await page.locator('#blockEditor .image-preview img').scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page
        .locator('#blockEditor .image-preview img')
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
}

for (const docked of [false, true]) {
  test(`Enter keeps the viewport stable below an image in ${docked ? 'a docked' : 'the main'} editor`, async ({
    page,
  }) => {
    await openLongPageWithImage(page);
    if (docked) await page.keyboard.press('Control+Alt+ArrowRight');
    const editor = docked ? '.dock-pane.active [data-dock-blocks]' : '#blockEditor';
    await page.locator(`${editor} .image-preview img`).scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        page
          .locator(`${editor} .image-preview img`)
          .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true);
    const baseline = await page.evaluate(async (selector) => {
      const blocks = document.querySelector<HTMLElement>(selector)!;
      const content = [...blocks.querySelectorAll<HTMLElement>('.block-content')].find((element) =>
        element.textContent?.startsWith('Paragraph 30:'),
      )!;
      const root = (blocks.closest('.dock-scroll') ||
        document.querySelector('#editorView')) as HTMLElement;
      content.focus({ preventScroll: true });
      const range = document.createRange();
      range.setStart(content.firstChild!, 32);
      range.collapse(true);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      root.scrollTop +=
        content.getBoundingClientRect().top -
        root.getBoundingClientRect().top -
        root.clientHeight / 2;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const probe: ScrollProbe = {
        root,
        image: blocks.querySelector<HTMLImageElement>('.image-preview img')!,
        samples: [],
        frame: 0,
      };
      (window as ProbeWindow).scrollProbe = probe;
      const sample = () => {
        probe.samples.push(root.scrollTop);
        probe.frame = requestAnimationFrame(sample);
      };
      probe.frame = requestAnimationFrame(sample);
      return root.scrollTop;
    }, editor);
    expect(baseline).toBeGreaterThan(500);

    await page.keyboard.press('Enter');
    const afterEnter = await page.evaluate(async (selector) => {
      for (let frame = 0; frame < 8; frame++) await new Promise(requestAnimationFrame);
      const probe = (window as ProbeWindow).scrollProbe!;
      const blocks = document.querySelector<HTMLElement>(selector)!;
      return {
        samples: probe.samples,
        sameImage: probe.image === blocks.querySelector('.image-preview img'),
        caretInEditor: blocks.contains(document.activeElement),
        scrollTop: probe.root.scrollTop,
      };
    }, editor);
    expect(afterEnter.sameImage).toBe(true);
    expect(afterEnter.caretInEditor).toBe(true);
    expect(Math.max(...afterEnter.samples.map((value) => Math.abs(value - baseline)))).toBeLessThan(
      3,
    );

    const viewport = await page
      .locator(docked ? '.dock-pane.active .dock-scroll' : '#editorView')
      .boundingBox();
    await page.mouse.move(viewport!.x + viewport!.width / 2, viewport!.y + viewport!.height / 2);
    await page.mouse.wheel(0, 180);
    await expect
      .poll(() => page.evaluate(() => (window as ProbeWindow).scrollProbe!.root.scrollTop))
      .toBeGreaterThan(afterEnter.scrollTop + 100);
    const afterWheel = await page.evaluate(async () => {
      const probe = (window as ProbeWindow).scrollProbe!;
      const top = probe.root.scrollTop;
      for (let frame = 0; frame < 8; frame++) await new Promise(requestAnimationFrame);
      cancelAnimationFrame(probe.frame);
      return { top, settledTop: probe.root.scrollTop };
    });
    expect(Math.abs(afterWheel.settledTop - afterWheel.top)).toBeLessThan(3);
  });
}

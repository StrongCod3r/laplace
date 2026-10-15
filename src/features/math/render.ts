import katex from 'katex';
import 'katex/dist/katex.min.css';
import katexStyles from 'katex/dist/katex.min.css?inline';
import type { ControllerLifecycle } from '@/shared/lib/controller-lifecycle';
import { displayMathSource, inlineMathRanges } from './syntax';

const editableSelector = '.block-content, [data-table-cell]';

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
}

export function renderMathHTML(source: string, displayMode = false): string {
  const formula = displayMode ? displayMathSource(source) : source;
  if (!formula.trim())
    return '<span class="math-placeholder">Write a LaTeX formula to preview it.</span>';
  try {
    return katex.renderToString(formula, {
      displayMode,
      throwOnError: true,
      trust: false,
      strict: 'ignore',
      maxExpand: 1000,
      maxSize: 20,
      output: 'htmlAndMathml',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid LaTeX formula';
    return `<span class="math-error" title="${escapeHtml(message)}">${escapeHtml(source)}</span>`;
  }
}

/** Export the same layout with embedded fonts so the SVG is independent of the app. */
export async function createMathSvg(source: string): Promise<Blob> {
  if (!displayMathSource(source).trim())
    throw new Error('Add LaTeX before downloading the formula');
  const content = document.createElement('div');
  const color = getComputedStyle(document.body).color;
  content.style.cssText = `position:fixed;left:-100000px;top:0;width:max-content;padding:16px;font-size:20px;color:${color};visibility:hidden`;
  content.innerHTML = renderMathHTML(source, true);
  if (content.querySelector('.math-error'))
    throw new Error('Correct the LaTeX formula before downloading it');
  const display = content.querySelector<HTMLElement>('.katex-display')!;
  display.style.margin = '0';
  document.body.appendChild(content);
  let width: number;
  let height: number;
  try {
    await document.fonts.ready;
    const rect = content.getBoundingClientRect();
    width = Math.ceil(rect.width);
    height = Math.ceil(rect.height);
  } finally {
    content.remove();
  }
  const loadedFamilies = new Set(
    [...document.fonts]
      .filter((font) => font.status === 'loaded')
      .map((font) => font.family.replace(/["']/g, '')),
  );
  const stylesheet = new CSSStyleSheet();
  stylesheet.replaceSync(katexStyles);
  const rules = await Promise.all(
    [...stylesheet.cssRules].map(async (rule) => {
      if (!(rule instanceof CSSFontFaceRule)) return rule.cssText;
      const family = rule.style.getPropertyValue('font-family').replace(/["']/g, '');
      if (!loadedFamilies.has(family)) return '';
      const url = rule.style
        .getPropertyValue('src')
        .match(/url\(["']?([^"')]+\.woff2)["']?\)/)?.[1];
      if (!url) throw new Error('Could not embed the formula fonts');
      const response = await fetch(new URL(url, location.href));
      if (!response.ok) throw new Error('Could not load the formula fonts');
      const font = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not embed the formula fonts'));
        reader.readAsDataURL(font);
      });
      return `@font-face{font-family:${rule.style.getPropertyValue('font-family')};font-style:${rule.style.fontStyle};font-weight:${rule.style.fontWeight};src:url("${dataUrl}") format("woff2")}`;
    }),
  );
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const style = document.createElementNS(svg.namespaceURI, 'style');
  style.textContent = rules.join('\n');
  const object = document.createElementNS(svg.namespaceURI, 'foreignObject');
  object.setAttribute('width', '100%');
  object.setAttribute('height', '100%');
  content.style.cssText = `display:inline-block;padding:16px;font-size:20px;color:${color}`;
  object.appendChild(content);
  svg.append(style, object);
  return new Blob([new XMLSerializer().serializeToString(svg)], {
    type: 'image/svg+xml;charset=utf-8',
  });
}

let inlineStyles: CSSStyleSheet | undefined;

export function hydrateInlineMath(root: ParentNode): void {
  for (const host of root.querySelectorAll<HTMLElement>('[data-inline-math]')) {
    if (host.shadowRoot) continue;
    const source = host.textContent || '';
    const formula = inlineMathRanges(source)[0];
    if (!formula || formula.end !== source.length) continue;
    const shadow = host.attachShadow({ mode: 'open' });
    if (!inlineStyles) {
      inlineStyles = new CSSStyleSheet();
      inlineStyles.replaceSync(`${katexStyles}
        :host { display: inline; }
        slot { font-size: 0; }
        :host([data-math-editing]) slot { font-size: inherit; }
        :host([data-math-editing]) .rendered { display: none; }
        .rendered { cursor: text; }
        .math-error { color: var(--code-error, currentColor); text-decoration: underline dotted; }
      `);
    }
    shadow.adoptedStyleSheets = [inlineStyles];
    // Only the original source lives in the editable DOM. Range offsets, clipboard
    // HTML, textContent and innerText cannot acquire generated KaTeX text.
    shadow.innerHTML = `<slot></slot><span class="rendered" contenteditable="false">${renderMathHTML(formula.source)}</span>`;
    host.title = source;
    const content = host.closest(editableSelector);
    host.toggleAttribute('data-math-editing', content === document.activeElement);
  }
}

/** Refresh on leaving a block, after native selection and toolbar operations finish. */
export function bindMathEditing(
  lifecycle: ControllerLifecycle,
  renderContent: (content: HTMLElement) => void,
): void {
  const pending = new Set<HTMLElement>();
  const dirty = new WeakSet<HTMLElement>();
  const editing = (content: HTMLElement, enabled: boolean) => {
    content
      .querySelectorAll('[data-inline-math]')
      .forEach((host) => host.toggleAttribute('data-math-editing', enabled));
  };
  const flush = () => {
    const selection = window.getSelection();
    for (const content of pending) {
      if (!content.isConnected) {
        pending.delete(content);
        continue;
      }
      if (document.activeElement === content) continue;
      if (selection?.rangeCount && selection.getRangeAt(0).intersectsNode(content)) continue;
      if (dirty.has(content)) {
        renderContent(content);
        hydrateInlineMath(content);
        dirty.delete(content);
      }
      editing(content, false);
      pending.delete(content);
    }
  };
  lifecycle.listen(
    document,
    'pointerdown',
    (event) => {
      if ((event as PointerEvent).button !== 0) return;
      const host = (event.target as Element)?.closest<HTMLElement>('[data-inline-math]');
      const content = host?.closest<HTMLElement>(editableSelector);
      if (!host || !content?.isContentEditable || document.activeElement === content) return;
      // A rendered formula is outside the editable tree. Enter its original source
      // explicitly instead of letting the browser select text inside its shadow root.
      event.preventDefault();
      editing(content, true);
      content.focus({ preventScroll: true });
      const range = document.createRange();
      range.selectNodeContents(host);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    },
    true,
  );
  lifecycle.listen(document, 'focusin', (event) => {
    const content = (event.target as Element)?.closest<HTMLElement>(editableSelector);
    if (content) {
      pending.add(content);
      editing(content, true);
    }
    flush();
  });
  lifecycle.listen(document, 'input', (event) => {
    const content = (event.target as Element)?.closest<HTMLElement>(editableSelector);
    if (
      content &&
      (content.querySelector('[data-inline-math]') ||
        inlineMathRanges(content.textContent || '').length)
    ) {
      dirty.add(content);
      pending.add(content);
    }
  });
  lifecycle.listen(document, 'focusout', () => lifecycle.frame(flush));
  lifecycle.listen(document, 'selectionchange', flush);
}

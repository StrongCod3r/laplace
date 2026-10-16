// @ts-nocheck
// Existing editor algorithms, isolated behind the typed controller boundary.
import type { EditorRuntime } from '@/features/editor/types';
import { quoteDepth } from '@/features/markdown/services/quote-depth';
import { inlineMathRanges } from '@/features/math/syntax';
import { hydrateInlineMath } from '@/features/math/render';

export function registerEditor(runtime: EditorRuntime) {
  let inlineSelectionScrollPending = false;

  function inlineSelectionViewportRect(selection = runtime.inlineSelectionState) {
    if (selection?.segments) {
      const rects = selection.segments
        .map((segment) => runtime.inlineSelectionViewportRect(segment))
        .filter(Boolean);
      if (!rects.length) return null;
      const left = Math.min(...rects.map((rect) => rect.left));
      const right = Math.max(...rects.map((rect) => rect.right));
      const top = Math.min(...rects.map((rect) => rect.top));
      const bottom = Math.max(...rects.map((rect) => rect.bottom));
      return { left, right, top, bottom, width: right - left, height: bottom - top };
    }
    const content = selection?.content;
    if (!content?.isConnected) return null;
    const range = document.createRange();
    const start = runtime.textNodePointForOffset(content, selection.start);
    const end = runtime.textNodePointForOffset(content, selection.end);
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const clip = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    for (let parent = content.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const rect = parent.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
        clip.left = Math.max(clip.left, rect.left + parent.clientLeft);
        clip.right = Math.min(clip.right, rect.left + parent.clientLeft + parent.clientWidth);
      }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
        clip.top = Math.max(clip.top, rect.top + parent.clientTop);
        clip.bottom = Math.min(clip.bottom, rect.top + parent.clientTop + parent.clientHeight);
      }
    }
    const visible = [...range.getClientRects()]
      .map((rect) => ({
        left: Math.max(rect.left, clip.left),
        right: Math.min(rect.right, clip.right),
        top: Math.max(rect.top, clip.top),
        bottom: Math.min(rect.bottom, clip.bottom),
      }))
      .filter((rect) => rect.right > rect.left && rect.bottom > rect.top);
    if (!visible.length) return null;
    const rect = {
      left: Math.min(...visible.map((rect) => rect.left)),
      right: Math.max(...visible.map((rect) => rect.right)),
      top: Math.min(...visible.map((rect) => rect.top)),
      bottom: Math.max(...visible.map((rect) => rect.bottom)),
    };
    return { ...rect, width: rect.right - rect.left, height: rect.bottom - rect.top };
  }

  function onInlineSelectionScroll(event) {
    const selection = runtime.inlineSelectionState;
    if (
      !selection ||
      inlineSelectionScrollPending ||
      (event.target !== document && !event.target?.contains?.(selection.content))
    )
      return;
    inlineSelectionScrollPending = true;
    runtime.lifecycle.frame(() => {
      inlineSelectionScrollPending = false;
      const rect = runtime.inlineSelectionViewportRect();
      const panel = runtime.standaloneLinkEditorOpen
        ? runtime.els.linkEditPanel
        : runtime.els.textFormatToolbar;
      if (!panel || !runtime.inlineSelectionState) return;
      panel.classList.toggle('hidden', !rect);
      if (!rect) return;
      runtime.inlineSelectionState.rect = rect;
      if (runtime.standaloneLinkEditorOpen) runtime.positionLinkEditPanel(rect);
      else runtime.positionTextFormatToolbar(rect);
    });
  }
  function renderPage() {
    runtime.els.editorDock?.classList.add('hidden');
    runtime.bindEditorElements(null);
    runtime.els.graphView?.classList.add('hidden');
    runtime.els.attachmentsView?.classList.add('hidden');
    runtime.closeAttachmentPreview();
    runtime.els.pageEditor?.classList.remove('hidden');
    const page = runtime.currentPage();
    if (!page) return;
    runtime.els.homeView.classList.add('hidden');
    runtime.els.editorView.classList.remove('hidden');
    runtime.renderBreadcrumbs(page);
    runtime.els.pageTitle.textContent = page.title || '';
    const icon = runtime.state.showCustomPageIcons === false ? '' : runtime.pageIconFor(page);
    runtime.els.pageIcon.innerHTML = icon ? runtime.pageIconMarkup(icon, '') : '';
    runtime.els.pageIcon.classList.toggle('hidden', !icon);
    runtime.els.pageComments.classList.add('hidden');
    runtime.renderBlocks(page);
    runtime.restoreEditorScrollPosition(runtime.state.activeTabId, runtime.els.editorView);
  }

  function replaceRenderedBlockMarkup(root, blocks) {
    const scroller = root.closest('.dock-scroll, #editorView');
    const scrollTop = scroller?.scrollTop;
    const scrollLeft = scroller?.scrollLeft;
    const minHeight = root.style.minHeight;
    // Moving live media into the template must not shrink the scrollable page mid-render.
    root.style.minHeight = `${root.getBoundingClientRect().height}px`;
    const previousImages = new Map(
      [...root.querySelectorAll('.image-block[data-block-id]')].flatMap((row) => {
        const image = row.querySelector('.image-preview img');
        return image ? [[row.dataset.blockId, image]] : [];
      }),
    );
    const previousMermaidPreviews = new Map(
      [...root.querySelectorAll('.code-block[data-block-id]')].flatMap((row) => {
        const preview = row.querySelector('[data-mermaid-preview]');
        const block = runtime.findBlock(row.dataset.blockId);
        return preview && runtime.mermaidPreviewIsCurrent(preview, block)
          ? [[row.dataset.blockId, preview]]
          : [];
      }),
    );
    const template = document.createElement('template');
    template.innerHTML = blocks
      .map((block, index) => runtime.blockHTML(block, index, blocks))
      .join('');
    template.content.querySelectorAll('.image-block[data-block-id]').forEach((row) => {
      const previous = previousImages.get(row.dataset.blockId);
      const next = row.querySelector('.image-preview img');
      if (!previous || !next) return;
      const previousSource = previous.getAttribute('src');
      const nextSource = next.getAttribute('src');
      const previousPath = previous.dataset.attachmentPath || previousSource;
      const nextPath = next.dataset.attachmentPath || nextSource;
      if (!previousSource || previousSource !== nextSource || previousPath !== nextPath) return;

      for (const attribute of [...previous.attributes])
        if (attribute.name !== 'src' && !next.hasAttribute(attribute.name))
          previous.removeAttribute(attribute.name);
      for (const attribute of [...next.attributes])
        if (attribute.name !== 'src') previous.setAttribute(attribute.name, attribute.value);
      next.replaceWith(previous);
    });
    template.content.querySelectorAll('.code-block[data-block-id]').forEach((row) => {
      const previous = previousMermaidPreviews.get(row.dataset.blockId);
      const next = row.querySelector('[data-mermaid-preview]');
      if (previous && next) next.replaceWith(previous);
    });
    root.replaceChildren(template.content);
    hydrateInlineMath(root);
    root.style.minHeight = minHeight;
    if (scroller) scroller.scrollTo({ top: scrollTop, left: scrollLeft, behavior: 'instant' });
  }

  function renderBlocks(page) {
    if (!page.blocks.length) page.blocks.push(runtime.newTextBlock());
    replaceRenderedBlockMarkup(runtime.els.blockEditor, page.blocks);
    runtime.syncSpellcheckElements(runtime.els.blockEditor);
    runtime.hydrateAttachmentImages(runtime.els.blockEditor);
    runtime.syncImageCropAspectChecks(runtime.els.blockEditor);
    runtime.els.emptyHint.style.display = 'none';
    runtime.scheduleMermaidPreviews(runtime.els.blockEditor);
    if (runtime.els.editorDock && !runtime.els.editorDock.classList.contains('hidden'))
      runtime.refreshOtherDockPages(page.id);
    runtime.lifecycle.frame(runtime.syncAllSimpleTableHandles);
    if (page.id === runtime.state.currentPageId) runtime.renderRightSidebar();
    runtime.syncWorkspaceEditorAccess();
    runtime.syncPlainTextView(runtime.els.blockEditor.closest('.page'), page);
  }

  function syncImageCropAspectChecks(root) {
    root?.querySelectorAll('.image-crop-aspect-menu button').forEach((button) => {
      const active = button.classList.contains('active');
      let check = button.querySelector('.crop-option-check');
      if (active && !check) {
        button.insertAdjacentHTML(
          'beforeend',
          runtime.iconMarkup('check', '14px', 'crop-option-check'),
        );
        check = button.querySelector('.crop-option-check');
      }
      if (!active) check?.remove();
    });
  }

  function refreshOtherDockPages(pageId) {
    const page = runtime.pageById(pageId);
    if (!page) return;
    runtime.els.editorDock.querySelectorAll('[data-dock-page]').forEach((root) => {
      if (
        root.dataset.pageId !== pageId ||
        root.dataset.editorGroup === runtime.state.activeEditorGroupId
      )
        return;
      const blocks = root.querySelector('[data-dock-blocks]');
      runtime.syncPlainTextView(root, page, root.dataset.tabId);
      if (blocks) {
        replaceRenderedBlockMarkup(blocks, page.blocks);
        runtime.syncSpellcheckElements(blocks);
        runtime.hydrateAttachmentImages(blocks);
        runtime.syncImageCropAspectChecks(blocks);
      }
    });
  }

  function toggleBlockHTML(block, gutter) {
    if (!Array.isArray(block.children)) block.children = [];
    const children = block.open
      ? runtime.htmlWithStyles(
          `<div class="toggle-children" data-toggle-children="${block.id}">${block.children.map((child, i) => runtime.blockHTML(child, i, block.children)).join('')}</div>`,
        )
      : '';
    const placeholder = "Type '/' for commands";
    const emptyState = block.text ? 'false' : 'true';
    return runtime.htmlWithStyles(
      `<div class="block-row toggle-block" data-block-id="${block.id}" data-type="toggle">${gutter}<div class="toggle-shell"><div class="toggle-header"><div class="toggle-prefix" aria-label="${block.open ? 'Collapse' : 'Expand'}" role="button" tabindex="0">${runtime.chevronSvg(block.open ? 'down' : 'right', 'toggle-chevron')}</div><div class="block-content" contenteditable="true" data-placeholder="${placeholder}" data-empty="${emptyState}">${runtime.inlineTextHTML(block)}</div></div>${children}</div></div>`,
    );
  }

  function blockHTML(block, index, blocks) {
    runtime.normalizeLegacyLinkBlock(block);
    const placeholder = "Type '/' for commands";
    const emptyState = block.text ? 'false' : 'true';
    const gutter = runtime.htmlWithStyles(
      `<div class="block-gutter"><button data-block-action="add" title="Add block">${runtime.iconMarkup('plus', '14px')}</button><button draggable="true" data-block-action="drag" title="Drag / options" aria-label="Drag / options">${runtime.iconMarkup('grip-vertical', '14px', 'block-drag-icon')}</button></div>`,
    );
    if (block.type === 'page') return runtime.pageBlockHTML(block, gutter);
    if (block.type === 'page-link') return runtime.pageLinkBlockHTML(block, gutter);
    if (block.type === 'image') return runtime.imageHTML(block, gutter);
    if (block.type === 'code') return runtime.codeBlockHTML(block, gutter);
    if (block.type === 'table') return runtime.simpleTableHTML(block, gutter);
    if (block.type === 'divider')
      return runtime.htmlWithStyles(
        `<div class="block-row" data-block-id="${block.id}" data-type="divider" draggable="false">${gutter}<div class="divider-line"></div></div>`,
      );
    if (block.type === 'todo')
      return runtime.htmlWithStyles(
        `<div class="block-row ${block.checked ? 'checked' : ''}" data-block-id="${block.id}" data-type="todo">${gutter}<input class="todo-box" type="checkbox" ${block.checked ? 'checked' : ''}><div class="block-content" contenteditable="true" data-placeholder="${placeholder}" data-empty="${emptyState}">${runtime.inlineTextHTML(block)}</div></div>`,
      );
    if (block.type === 'bullet') {
      const indent = runtime.listIndentLevel(block),
        marker = ['•', '◦', '▪'][indent % 3],
        offset = indent * 24;
      return runtime.htmlWithStyles(
        `<div class="block-row" data-block-id="${block.id}" data-type="bullet" data-list-indent="${indent}" style="--list-indent-offset:${offset}px">${gutter}<div class="list-prefix">${marker}</div><div class="block-content" contenteditable="true" data-placeholder="${placeholder}" data-empty="${emptyState}">${runtime.inlineTextHTML(block)}</div></div>`,
      );
    }
    if (block.type === 'number') {
      const indent = runtime.listIndentLevel(block),
        offset = indent * 24;
      return runtime.htmlWithStyles(
        `<div class="block-row" data-block-id="${block.id}" data-type="number" data-list-indent="${indent}" style="--list-indent-offset:${offset}px">${gutter}<div class="list-prefix">${runtime.numberForBlock(block.id, blocks)}.</div><div class="block-content" contenteditable="true" data-placeholder="${placeholder}" data-empty="${emptyState}">${runtime.inlineTextHTML(block)}</div></div>`,
      );
    }
    if (block.type === 'toggle') return runtime.toggleBlockHTML(block, gutter);
    const quoteStyle =
      block.type === 'quote'
        ? ` data-quote-depth="${quoteDepth(block)}" style="--quote-indent:${(quoteDepth(block) - 1) * 18}px"`
        : '';
    return runtime.htmlWithStyles(
      `<div class="block-row" data-block-id="${block.id}" data-type="${block.type}"${quoteStyle}>${gutter}${block.type === 'callout' ? `<span class="callout-icon" aria-hidden="true">${runtime.iconMarkup('lightbulb', '18px')}</span>` : ''}<div class="block-content" contenteditable="true" spellcheck="true" data-placeholder="${placeholder}" data-empty="${emptyState}">${runtime.inlineTextHTML(block)}</div></div>`,
    );
  }

  function normalizeHyperlinkUrl(value) {
    let raw = String(value || '').trim();
    if (!raw) return '';
    // Vault attachment links must remain local when imported or edited.
    if (/^(?:\.{1,2}\/)*(?:\.attachments|attachments)\//i.test(raw)) return raw;
    if (/^\/\//.test(raw)) raw = 'https:' + raw;
    else if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = 'https://' + raw;
    try {
      const url = new URL(raw);
      if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) return '';
      return url.href;
    } catch {
      return '';
    }
  }

  function inlineLinkTargetKey(link) {
    return link?.pageId ? `page:${link.pageId}` : `url:${link?.url || ''}`;
  }

  function normalizeInlineLinkRanges(links, textLength) {
    const max = Math.max(0, Number(textLength) || 0),
      out = [];
    const source = Array.isArray(links) ? links : [];
    for (const item of source) {
      const pageId = String(item?.pageId || '').trim();
      const url = pageId ? '' : runtime.normalizeHyperlinkUrl(item?.url);
      if (!pageId && !url) continue;
      const start = Math.max(0, Math.min(max, Number(item?.start) || 0));
      const end = Math.max(start, Math.min(max, Number(item?.end) || 0));
      if (end <= start) continue;
      out.push({ start, end, ...(pageId ? { pageId } : { url }) });
    }
    out.sort((a, b) => a.start - b.start || a.end - b.end);
    const clean = [];
    for (const item of out) {
      const prev = clean.at(-1);
      if (prev && item.start < prev.end) continue;
      if (
        prev &&
        item.start === prev.end &&
        runtime.inlineLinkTargetKey(item) === runtime.inlineLinkTargetKey(prev)
      ) {
        prev.end = item.end;
        continue;
      }
      clean.push(item);
    }
    return clean;
  }

  function inlineLinksForBlock(block) {
    const text = String(block?.text || '');
    const links = runtime.normalizeInlineLinkRanges(block?.inlineLinks, text.length);
    if (block) {
      if (links.length) block.inlineLinks = links;
      else delete block.inlineLinks;
    }
    return links;
  }

  function normalizeLegacyLinkBlock(block) {
    if (block?.type !== 'link') return;
    block.text = String(block.text || block.url || '');
    const href = runtime.normalizeHyperlinkUrl(block.url);
    if (!runtime.inlineLinksForBlock(block).length && href && block.text.length)
      block.inlineLinks = [{ start: 0, end: block.text.length, url: href }];
    block.type = 'text';
    delete block.url;
  }

  function normalizeInlineFormatRanges(formats, textLength) {
    const max = Math.max(0, Number(textLength) || 0),
      source = Array.isArray(formats) ? formats : [],
      out = [];
    for (const item of source) {
      const type = String(item?.type || '');
      if (!runtime.INLINE_FORMAT_TYPES.has(type)) continue;
      let value = item?.value == null ? '' : String(item.value);
      if ((type === 'color' || type === 'background') && !runtime.INLINE_COLOR_NAMES.has(value))
        continue;
      if (type !== 'color' && type !== 'background') value = '';
      const start = Math.max(0, Math.min(max, Number(item?.start) || 0));
      const end = Math.max(start, Math.min(max, Number(item?.end) || 0));
      if (end <= start) continue;
      out.push({ start, end, type, ...(value ? { value } : {}) });
    }
    out.sort(
      (a, b) =>
        a.type.localeCompare(b.type) ||
        (a.value || '').localeCompare(b.value || '') ||
        a.start - b.start ||
        a.end - b.end,
    );
    const merged = [];
    for (const item of out) {
      const prev = merged.at(-1);
      if (
        prev &&
        prev.type === item.type &&
        (prev.value || '') === (item.value || '') &&
        item.start <= prev.end
      ) {
        prev.end = Math.max(prev.end, item.end);
        continue;
      }
      merged.push({ ...item });
    }
    return merged;
  }

  function inlineFormatsForBlock(block) {
    const text = String(block?.text || '');
    const formats = runtime.normalizeInlineFormatRanges(block?.inlineFormats, text.length);
    if (block) {
      if (formats.length) block.inlineFormats = formats;
      else delete block.inlineFormats;
    }
    return formats;
  }

  function inlineFormatsFromContent(content, text) {
    const formats = [];
    for (const el of content?.querySelectorAll?.('[data-inline-format]') || []) {
      const type = el.dataset.inlineFormat;
      if (!runtime.INLINE_FORMAT_TYPES.has(type)) continue;
      const value = el.dataset.inlineValue || '';
      try {
        const before = document.createRange();
        before.selectNodeContents(content);
        before.setEndBefore(el);
        const start = before.toString().length,
          end = start + (el.innerText || el.textContent || '').length;
        if (end > start) formats.push({ start, end, type, ...(value ? { value } : {}) });
      } catch {}
    }
    return runtime.normalizeInlineFormatRanges(formats, String(text || '').length);
  }

  function splitInlineFormatsAt(block, offset) {
    const point = Math.max(0, Number(offset) || 0),
      left = [],
      right = [];
    for (const format of runtime.inlineFormatsForBlock(block)) {
      if (format.end <= point) left.push({ ...format });
      else if (format.start >= point)
        right.push({ ...format, start: format.start - point, end: format.end - point });
      else {
        if (format.start < point) left.push({ ...format, end: point });
        if (format.end > point) right.push({ ...format, start: 0, end: format.end - point });
      }
    }
    return { left: runtime.normalizeInlineFormatRanges(left, point), right };
  }

  function inlineFormatsAroundRange(block, start, end) {
    const text = String(block?.text || ''),
      safeStart = Math.max(0, Math.min(text.length, start)),
      safeEnd = Math.max(safeStart, Math.min(text.length, end));
    const left = [],
      right = [];
    for (const format of runtime.inlineFormatsForBlock(block)) {
      if (format.end <= safeStart) left.push({ ...format });
      else if (format.start < safeStart) left.push({ ...format, end: safeStart });
      if (format.start >= safeEnd)
        right.push({ ...format, start: format.start - safeEnd, end: format.end - safeEnd });
      else if (format.end > safeEnd) right.push({ ...format, start: 0, end: format.end - safeEnd });
    }
    return { left: runtime.normalizeInlineFormatRanges(left, safeStart), right };
  }

  function subtractInlineFormatRange(format, start, end) {
    if (format.end <= start || format.start >= end) return [{ ...format }];
    const pieces = [];
    if (format.start < start) pieces.push({ ...format, end: start });
    if (format.end > end) pieces.push({ ...format, start: end });
    return pieces;
  }

  function selectionFullyFormatted(block, start, end, type, value = '') {
    if (end <= start) return false;
    const matching = runtime
      .inlineFormatsForBlock(block)
      .filter((f) => f.type === type && (!value || (f.value || '') === value))
      .sort((a, b) => a.start - b.start);
    let cursor = start;
    for (const format of matching) {
      if (format.end <= cursor) continue;
      if (format.start > cursor) return false;
      cursor = Math.max(cursor, format.end);
      if (cursor >= end) return true;
    }
    return false;
  }

  function setInlineFormatRange(block, start, end, type, value = '', mode = 'toggle') {
    const text = String(block?.text || ''),
      safeStart = Math.max(0, Math.min(text.length, start)),
      safeEnd = Math.max(safeStart, Math.min(text.length, end));
    if (safeEnd <= safeStart || !runtime.INLINE_FORMAT_TYPES.has(type)) return false;
    const current = runtime.inlineFormatsForBlock(block),
      output = [];
    const isChoice = type === 'color' || type === 'background';
    const targetValue = isChoice ? String(value || '') : '';
    const removeTarget =
      mode === 'remove' ||
      (!isChoice &&
        mode === 'toggle' &&
        runtime.selectionFullyFormatted(block, safeStart, safeEnd, type));
    for (const format of current) {
      const sameType = format.type === type;
      if (!sameType) {
        output.push({ ...format });
        continue;
      }
      if (isChoice || removeTarget) {
        output.push(...runtime.subtractInlineFormatRange(format, safeStart, safeEnd));
      } else output.push({ ...format });
    }
    if (!removeTarget && mode !== 'remove') {
      if (isChoice) {
        if (targetValue && runtime.INLINE_COLOR_NAMES.has(targetValue))
          output.push({ start: safeStart, end: safeEnd, type, value: targetValue });
      } else output.push({ start: safeStart, end: safeEnd, type });
    }
    block.inlineFormats = runtime.normalizeInlineFormatRanges(output, text.length);
    if (!block.inlineFormats.length) delete block.inlineFormats;
    return true;
  }

  function clearInlineFormattingRange(block, start, end, { links = true } = {}) {
    const text = String(block?.text || ''),
      safeStart = Math.max(0, Math.min(text.length, start)),
      safeEnd = Math.max(safeStart, Math.min(text.length, end));
    if (safeEnd <= safeStart) return false;
    const formats = [];
    for (const format of runtime.inlineFormatsForBlock(block))
      formats.push(...runtime.subtractInlineFormatRange(format, safeStart, safeEnd));
    block.inlineFormats = runtime.normalizeInlineFormatRanges(formats, text.length);
    if (!block.inlineFormats.length) delete block.inlineFormats;
    if (links) {
      const kept = [];
      for (const link of runtime.inlineLinksForBlock(block)) {
        if (link.end <= safeStart || link.start >= safeEnd) kept.push({ ...link });
        else {
          if (link.start < safeStart) kept.push({ ...link, end: safeStart });
          if (link.end > safeEnd) kept.push({ ...link, start: safeEnd });
        }
      }
      block.inlineLinks = runtime.normalizeInlineLinkRanges(kept, text.length);
      if (!block.inlineLinks.length) delete block.inlineLinks;
    }
    return true;
  }

  function formatClassName(format) {
    if (format.type === 'color') return `inline-color-${format.value}`;
    if (format.type === 'background') return `inline-bg-${format.value}`;
    return '';
  }

  function wrapInlineSegment(html, formats) {
    const byType = (type) => formats.find((f) => f.type === type);
    if (byType('code'))
      html = runtime.htmlWithStyles(
        `<code class="inline-code" data-inline-format="code">${html}</code>`,
      );
    if (byType('strike')) html = `<s data-inline-format="strike">${html}</s>`;
    if (byType('underline'))
      html = `<span data-inline-format="underline" style="text-decoration:underline">${html}</span>`;
    if (byType('italic')) html = `<em data-inline-format="italic">${html}</em>`;
    if (byType('bold')) html = `<strong data-inline-format="bold">${html}</strong>`;
    const color = byType('color');
    if (color)
      html = runtime.htmlWithStyles(
        `<span data-inline-format="color" data-inline-value="${runtime.escapeHtml(color.value)}" class="${runtime.formatClassName(color)}">${html}</span>`,
      );
    const bg = byType('background');
    if (bg)
      html = runtime.htmlWithStyles(
        `<span data-inline-format="background" data-inline-value="${runtime.escapeHtml(bg.value)}" class="${runtime.formatClassName(bg)}">${html}</span>`,
      );
    return html;
  }

  function inlineTextHTML(block) {
    const text = String(block?.text || ''),
      links = runtime.inlineLinksForBlock(block),
      formats = runtime.inlineFormatsForBlock(block);
    const tokens = links.map((link) => ({ ...link, kind: link.pageId ? 'page' : 'external' }));
    for (const math of inlineMathRanges(text)) {
      if (
        formats.some(
          (format) => format.type === 'code' && format.start < math.end && format.end > math.start,
        )
      )
        continue;
      if (tokens.some((token) => token.start < math.end && token.end > math.start)) continue;
      if (
        formats.some(
          (format) =>
            (format.start > math.start && format.start < math.end) ||
            (format.end > math.start && format.end < math.end),
        )
      )
        continue;
      tokens.push({ ...math, kind: 'math' });
    }
    const wikiLinks = Array.isArray(block.wikiLinks)
      ? block.wikiLinks.map((wiki) => ({
          ...wiki,
          title: text.slice(wiki.start, wiki.end),
        }))
      : runtime.wikiLinksInText(text);
    for (const wiki of wikiLinks) {
      if (
        tokens.some(
          (token) => token.kind === 'math' && wiki.start < token.end && wiki.end > token.start,
        )
      )
        continue;
      if (links.some((link) => wiki.start < link.end && wiki.end > link.start)) continue;
      tokens.push({ ...wiki, kind: 'wiki' });
    }
    const boundaries = new Set([0, text.length]);
    for (const token of tokens) {
      boundaries.add(token.start);
      boundaries.add(token.end);
    }
    for (const format of formats) {
      boundaries.add(format.start);
      boundaries.add(format.end);
    }
    const points = [...boundaries].filter((n) => n >= 0 && n <= text.length).sort((a, b) => a - b);
    // A final editable line needs a real DOM anchor for both layout and native typing.
    const caretPlaceholder =
      runtime.isListBlock(block) && text.endsWith('\n') ? '<br data-caret-placeholder>' : '';
    if (points.length <= 2 && !tokens.length && !formats.length)
      return runtime.escapeHtml(text) + caretPlaceholder;
    let html = '';
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i],
        end = points[i + 1];
      if (end <= start) continue;
      const piece = text.slice(start, end);
      if (!piece) continue;
      const activeFormats = formats.filter((format) => format.start <= start && format.end >= end);
      let segment = runtime.wrapInlineSegment(runtime.escapeHtml(piece), activeFormats);
      const token = tokens.find((item) => item.start <= start && item.end >= end);
      if (token?.kind === 'math')
        segment = `<span data-inline-math contenteditable="false" role="button" tabindex="0" aria-label="Edit inline equation">${segment}</span>`;
      else if (token?.kind === 'external')
        segment = runtime.htmlWithStyles(
          `<a class="inline-link" data-inline-link href="${runtime.escapeHtml(token.url)}" target="_blank" rel="noopener noreferrer">${segment}</a>`,
        );
      else if (token?.kind === 'page') {
        const target = runtime.pageById(token.pageId),
          missing = !target;
        segment = runtime.htmlWithStyles(
          `<span class="inline-link inline-page-link ${missing ? 'unresolved' : ''}" data-inline-page="${runtime.escapeHtml(token.pageId)}">${segment}</span>`,
        );
      } else if (token?.kind === 'wiki') {
        const resolved = !!token.pageId;
        segment = runtime.htmlWithStyles(
          `<span class="wiki-link ${resolved ? '' : 'unresolved'}" data-wiki-page-title="${runtime.escapeHtml(token.title)}" ${resolved ? `data-wiki-page="${token.pageId}"` : ''}>${segment}</span>`,
        );
      }
      html += segment;
    }
    return html + caretPlaceholder;
  }

  function inlineLinksFromContent(content, text) {
    const links = [];
    for (const el of content?.querySelectorAll?.('a[data-inline-link],[data-inline-page]') || []) {
      const pageId = String(el.dataset.inlinePage || '').trim();
      const href = pageId ? '' : runtime.normalizeHyperlinkUrl(el.getAttribute('href') || '');
      if (!pageId && !href) continue;
      try {
        const before = document.createRange();
        before.selectNodeContents(content);
        before.setEndBefore(el);
        const start = before.toString().length,
          end = start + (el.innerText || el.textContent || '').length;
        if (end > start) links.push({ start, end, ...(pageId ? { pageId } : { url: href }) });
      } catch {}
    }
    return runtime.normalizeInlineLinkRanges(links, String(text || '').length);
  }

  function splitInlineLinksAt(block, offset) {
    const links = runtime.inlineLinksForBlock(block),
      point = Math.max(0, Number(offset) || 0),
      left = [],
      right = [];
    for (const link of links) {
      if (link.end <= point) left.push({ ...link });
      else if (link.start >= point)
        right.push({ ...link, start: link.start - point, end: link.end - point });
      else {
        if (link.start < point) left.push({ ...link, end: point });
        if (link.end > point) right.push({ ...link, start: 0, end: link.end - point });
      }
    }
    return { left, right };
  }

  function inlineLinksAroundRange(block, start, end) {
    const links = runtime.inlineLinksForBlock(block),
      left = [],
      right = [];
    for (const link of links) {
      if (link.end <= start) left.push({ ...link });
      else if (link.start < start) left.push({ ...link, end: start });
      if (link.start >= end) right.push({ ...link, start: link.start - end, end: link.end - end });
      else if (link.end > end) right.push({ ...link, start: 0, end: link.end - end });
    }
    return { left: runtime.normalizeInlineLinkRanges(left, start), right };
  }

  function replaceBlockRangeWithInlineLink(block, start, end, label, target) {
    const original = String(block?.text || ''),
      safeStart = Math.max(0, Math.min(original.length, start)),
      safeEnd = Math.max(safeStart, Math.min(original.length, end));
    const inserted = String(label || ''),
      delta = inserted.length - (safeEnd - safeStart),
      adjusted = [];
    for (const link of runtime.inlineLinksForBlock(block)) {
      if (link.end <= safeStart) adjusted.push({ ...link });
      else if (link.start >= safeEnd)
        adjusted.push({ ...link, start: link.start + delta, end: link.end + delta });
      else {
        if (link.start < safeStart) adjusted.push({ ...link, end: safeStart });
        if (link.end > safeEnd) {
          const tailStart = safeStart + inserted.length;
          adjusted.push({ ...link, start: tailStart, end: link.end + delta });
        }
      }
    }
    const formats = runtime.inlineFormatsAroundRange(block, safeStart, safeEnd),
      inherited = runtime
        .inlineFormatsForBlock(block)
        .filter((format) => format.start <= safeStart && format.end >= safeEnd);
    block.text = original.slice(0, safeStart) + inserted + original.slice(safeEnd);
    const linkTarget = typeof target === 'string' ? { url: target } : target;
    if (inserted.length && (linkTarget?.pageId || linkTarget?.url))
      adjusted.push({
        start: safeStart,
        end: safeStart + inserted.length,
        ...(linkTarget.pageId ? { pageId: linkTarget.pageId } : { url: linkTarget.url }),
      });
    block.inlineLinks = runtime.normalizeInlineLinkRanges(adjusted, block.text.length);
    if (!block.inlineLinks.length) delete block.inlineLinks;
    const shiftedFormats = formats.right.map((format) => ({
      ...format,
      start: format.start + safeStart + inserted.length,
      end: format.end + safeStart + inserted.length,
    }));
    const inheritedFormats = inserted.length
      ? inherited.map((format) => ({
          ...format,
          start: safeStart,
          end: safeStart + inserted.length,
        }))
      : [];
    block.inlineFormats = runtime.normalizeInlineFormatRanges(
      [...formats.left, ...inheritedFormats, ...shiftedFormats],
      block.text.length,
    );
    if (!block.inlineFormats.length) delete block.inlineFormats;
    return safeStart + inserted.length;
  }

  function applyInlineLinkToSelection(block, start, end, target) {
    if (end <= start) return false;
    const pageId = typeof target === 'object' ? String(target?.pageId || '').trim() : '';
    const url = pageId
      ? ''
      : runtime.normalizeHyperlinkUrl(typeof target === 'string' ? target : target?.url);
    if (!pageId && !url) return false;
    const kept = runtime
      .inlineLinksForBlock(block)
      .filter((link) => link.end <= start || link.start >= end);
    kept.push({ start, end, ...(pageId ? { pageId } : { url }) });
    block.inlineLinks = runtime.normalizeInlineLinkRanges(kept, String(block.text || '').length);
    return true;
  }

  function normalizePastedLinkUrl(value) {
    const raw = String(value || '').trim();
    if (!raw || /\s/.test(raw)) return '';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return `mailto:${raw}`;
    if (/^(?:https?:\/\/|mailto:|tel:|\/\/)/i.test(raw)) return runtime.normalizeHyperlinkUrl(raw);
    if (
      /^www\./i.test(raw) ||
      /^localhost(?::\d+)?(?:[/?#].*)?$/i.test(raw) ||
      /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(raw)
    )
      return runtime.normalizeHyperlinkUrl(raw);
    return '';
  }

  function clipboardLinkPayload(data) {
    const html = String(data?.getData?.('text/html') || '');
    if (html) {
      try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const anchors = [...doc.body.querySelectorAll('a[href]')];
        const visible = (doc.body.innerText || doc.body.textContent || '').trim();
        if (anchors.length === 1) {
          const anchor = anchors[0],
            label = (anchor.innerText || anchor.textContent || '').trim();
          const url =
            runtime.normalizePastedLinkUrl(anchor.getAttribute('href') || '') ||
            runtime.normalizeHyperlinkUrl(anchor.getAttribute('href') || '');
          if (url && label && (!visible || visible === label)) return { url, label };
        }
      } catch {}
    }
    const plain = String(data?.getData?.('text/plain') || '').trim();
    const url = runtime.normalizePastedLinkUrl(plain);
    return url ? { url, label: plain } : null;
  }

  function pasteLinkIntoBlock(content, payload) {
    const row = content?.closest('.block-row'),
      location = runtime.findBlockLocation(row?.dataset.blockId),
      page = runtime.currentPage();
    if (!location || !page || !runtime.isTextLikeBlock(location.block) || !payload?.url)
      return false;
    const block = location.block,
      { start, end } = runtime.selectionOffsetsWithin(content);
    let caret = end;
    if (end > start) {
      if (!runtime.applyInlineLinkToSelection(block, start, end, payload.url)) return false;
      caret = end;
    } else {
      caret = runtime.replaceBlockRangeWithInlineLink(
        block,
        start,
        end,
        payload.label || payload.url,
        payload.url,
      );
    }
    runtime.scheduleSave();
    runtime.hideFloatingMenus();
    runtime.renderBlocks(page);
    runtime.focusBlock(block.id, caret);
    runtime.toast(end > start ? 'Linked selected text' : 'Link pasted');
    return true;
  }

  function normalizeToggleBlock(block) {
    block.open = block.open === true;
    if (!Array.isArray(block.children)) block.children = [];
    block.children = runtime.normalizeBlockTree(block.children);
    return block;
  }

  function normalizeBlockTree(blocks) {
    if (!Array.isArray(blocks)) return [];
    // The removed database block type is discarded throughout the document tree.
    blocks = blocks.flatMap((block) => {
      if (block?.type === 'database') return [];
      // Convert legacy column layouts to ordinary blocks in reading order.
      if (block?.type === 'columns')
        return runtime.normalizeBlockTree(
          (Array.isArray(block.columns) ? block.columns : []).flatMap((column) =>
            typeof column === 'string'
              ? [{ type: 'text', text: column }]
              : Array.isArray(column?.blocks)
                ? column.blocks
                : [],
          ),
        );
      return [block];
    });
    for (const block of blocks) {
      if (!block || typeof block !== 'object') continue;
      if (!block.id) block.id = runtime.uid('b');
      if (block.type === 'table') runtime.normalizeSimpleTableBlock(block);
      if (block.type === 'toggle') runtime.normalizeToggleBlock(block);
      runtime.normalizeLegacyLinkBlock(block);
      if (block.type === 'page-link' && typeof block.pageId !== 'string') block.pageId = '';
      if (
        [
          'text',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'bullet',
          'number',
          'todo',
          'toggle',
          'quote',
          'callout',
        ].includes(block.type)
      ) {
        runtime.inlineLinksForBlock(block);
        runtime.inlineFormatsForBlock(block);
      }
      if (runtime.isListBlock(block))
        runtime.setListIndentLevel(block, runtime.listIndentLevel(block));
      else if ('indent' in block) delete block.indent;
    }
    return blocks.filter(Boolean);
  }

  function flattenBlocks(blocks, out = []) {
    for (const block of blocks || []) {
      out.push(block);
      if (block?.type === 'toggle') runtime.flattenBlocks(block.children, out);
    }
    return out;
  }

  function pageBlockHTML(block, gutter) {
    const target = runtime.pageById(block.pageId);
    if (!target) {
      return runtime.htmlWithStyles(
        `<div class="block-row page-block missing" data-block-id="${block.id}" data-type="page">${gutter}<div class="page-block-link disabled"><span class="page-block-icon">${runtime.iconMarkup('circle-alert', '16px')}</span><span class="page-block-title">Missing page</span></div></div>`,
      );
    }
    return runtime.htmlWithStyles(
      `<div class="block-row page-block" data-block-id="${block.id}" data-type="page">${gutter}<button class="page-block-link" data-page-block-open="${target.id}" title="Open page · Middle-click for new tab"><span class="page-block-icon">${runtime.pageIconMarkup(runtime.pageIconFor(target))}</span><span class="page-block-title">${runtime.escapeHtml(target.title || 'Untitled')}</span><span class="page-block-arrow">${runtime.iconMarkup('chevron-right', '14px')}</span></button></div>`,
    );
  }

  function pageLinkBlockHTML(block, gutter) {
    const target = runtime.pageById(block.pageId);
    if (!target) {
      return runtime.htmlWithStyles(
        `<div class="block-row page-link-block" data-block-id="${block.id}" data-type="page-link">${gutter}<button class="page-block-link placeholder" data-page-link-choose title="Choose a page to link"><span class="page-block-icon">${runtime.iconMarkup('link', '16px')}</span><span class="page-block-title">Link to page…</span><span class="page-block-arrow">${runtime.iconMarkup('chevron-right', '14px')}</span></button></div>`,
      );
    }
    return runtime.htmlWithStyles(
      `<div class="block-row page-link-block" data-block-id="${block.id}" data-type="page-link">${gutter}<button class="page-block-link" data-page-link-open="${target.id}" title="Open linked page · Middle-click for new tab"><span class="page-block-icon">${runtime.pageIconMarkup(runtime.pageIconFor(target))}</span><span class="page-block-title">${runtime.escapeHtml(target.title || 'Untitled')}</span><span class="page-block-arrow">${runtime.iconMarkup('chevron-right', '14px')}</span></button></div>`,
    );
  }

  function renderPageLinkPickerResults(query = '') {
    if (!runtime.activePageLinkBlockId) return;
    const list = runtime.els.blockMenu.querySelector('[data-page-link-picker-list]');
    if (!list) return;
    const search = query.trim();
    const inCurrentFolder = search.startsWith('./');
    const key = runtime.wikiTitleKey(inCurrentFolder ? search.slice(2) : search);
    const currentPage = runtime.currentPage();
    const currentId = currentPage?.id;
    const currentFolder = runtime.pageFolderPath(currentPage);
    const pageLocation = (page) => runtime.pageFolderPath(page) || 'Vault root';
    const pages = runtime.state.pages
      .filter((page) => {
        if (page.id === currentId) return false;
        const folder = runtime.pageFolderPath(page);
        if (
          inCurrentFolder &&
          currentFolder &&
          folder !== currentFolder &&
          !folder.startsWith(`${currentFolder}/`)
        )
          return false;
        const relativeFolder =
          folder === currentFolder
            ? ''
            : folder.slice(currentFolder ? currentFolder.length + 1 : 0);
        const searchable = inCurrentFolder
          ? [relativeFolder, page.title || 'Untitled'].filter(Boolean).join('/')
          : `${page.title || 'Untitled'} ${pageLocation(page)}`;
        return !key || runtime.wikiTitleKey(searchable).includes(key);
      })
      .sort(
        (a, b) =>
          pageLocation(a).localeCompare(pageLocation(b)) ||
          String(a.title || '').localeCompare(String(b.title || '')),
      );
    list.innerHTML = pages.length
      ? pages
          .map((page) =>
            runtime.htmlWithStyles(
              `<button class="page-link-picker-item" data-page-link-pick="${page.id}"><span class="page-link-picker-icon">${runtime.pageIconMarkup(runtime.pageIconFor(page))}</span><span class="page-link-picker-copy"><span class="page-link-picker-title">${runtime.escapeHtml(page.title || 'Untitled')}</span><small class="page-link-picker-path">${runtime.escapeHtml(pageLocation(page))}</small></span></button>`,
            ),
          )
          .join('')
      : runtime.htmlWithStyles(`<div class="page-link-picker-empty">No matching pages.</div>`);
    runtime.renderPageLinkPickerSelection();
  }

  function renderPageLinkPickerSelection() {
    const items = [...runtime.els.blockMenu.querySelectorAll('[data-page-link-pick]')];
    if (!items.length) {
      runtime.pageLinkPickerIndex = 0;
      return;
    }
    runtime.pageLinkPickerIndex = Math.max(
      0,
      Math.min(runtime.pageLinkPickerIndex, items.length - 1),
    );
    items.forEach((item, index) => {
      const selected = index === runtime.pageLinkPickerIndex;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-selected', String(selected));
    });
    items[runtime.pageLinkPickerIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function showPageLinkPicker(row, id) {
    if (!row || !runtime.findBlock(id)) return;
    runtime.hideFloatingMenus();
    runtime.activePageLinkBlockId = id;
    runtime.pageLinkPickerIndex = 0;
    const r = row.getBoundingClientRect(),
      width = 300;
    runtime.els.blockMenu.style.width = `${width}px`;
    runtime.els.blockMenu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - width - 8))}px`;
    runtime.els.blockMenu.style.top = `${Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 360))}px`;
    runtime.els.blockMenu.innerHTML = runtime.htmlWithStyles(
      `<div class="page-link-picker"><div class="page-link-picker-search-wrap"><input class="page-link-picker-search" data-page-link-search type="search" placeholder="Search pages or paths…" autocomplete="off"></div><div class="page-link-picker-list" data-page-link-picker-list></div></div>`,
    );
    runtime.renderPageLinkPickerResults('');
    runtime.els.blockMenu.classList.remove('hidden');
    runtime.lifecycle.frame(() =>
      runtime.els.blockMenu.querySelector('[data-page-link-search]')?.focus(),
    );
  }

  function setPageLinkTarget(blockId, pageId) {
    const location = runtime.findBlockLocation(blockId),
      block = location?.block,
      target = runtime.pageById(pageId);
    if (!block || block.type !== 'page-link' || !target) return;
    block.pageId = target.id;
    const next = runtime.newTextBlock();
    location.blocks.splice(location.index + 1, 0, next);
    runtime.scheduleSave();
    runtime.hideFloatingMenus();
    runtime.renderBlocks(runtime.currentPage());
    runtime.focusBlock(next.id, 0, runtime.els.blockEditor);
  }

  function isListBlock(block) {
    return !!block && (block.type === 'bullet' || block.type === 'number');
  }

  function listIndentLevel(block) {
    return runtime.isListBlock(block)
      ? Math.max(0, Math.min(8, Math.floor(Number(block.indent) || 0)))
      : 0;
  }

  function setListIndentLevel(block, level) {
    if (!runtime.isListBlock(block)) return;
    const next = Math.max(0, Math.min(8, Math.floor(Number(level) || 0)));
    if (next) block.indent = next;
    else delete block.indent;
  }

  function listSubtreeEnd(blocks, index) {
    const root = blocks[index],
      base = runtime.listIndentLevel(root);
    let end = index + 1;
    while (
      end < blocks.length &&
      runtime.isListBlock(blocks[end]) &&
      runtime.listIndentLevel(blocks[end]) > base
    )
      end++;
    return end;
  }

  function changeListIndent(blocks, index, direction) {
    const block = blocks[index];
    if (!runtime.isListBlock(block)) return false;
    const current = runtime.listIndentLevel(block);
    let target = current;
    if (direction > 0) {
      if (index <= 0 || !runtime.isListBlock(blocks[index - 1])) return false;
      const maxAllowed = Math.min(8, runtime.listIndentLevel(blocks[index - 1]) + 1);
      target = Math.min(current + 1, maxAllowed);
      if (target <= current) return false;
    } else {
      if (current <= 0) return false;
      target = current - 1;
    }
    const delta = target - current,
      end = runtime.listSubtreeEnd(blocks, index);
    for (let i = index; i < end; i++)
      runtime.setListIndentLevel(blocks[i], runtime.listIndentLevel(blocks[i]) + delta);
    return true;
  }

  function numberForBlock(id, blocks) {
    const index = blocks.findIndex((block) => block?.id === id);
    if (index < 0) return 1;
    const target = blocks[index],
      indent = runtime.listIndentLevel(target);
    let n = 1;
    for (let i = index - 1; i >= 0; i--) {
      const block = blocks[i];
      if (!runtime.isListBlock(block)) {
        if (block.type === 'image' || (block.type === 'text' && !String(block.text || '').trim()))
          continue;
        break;
      }
      const level = runtime.listIndentLevel(block);
      if (level < indent) break;
      if (level > indent) continue;
      if (block.type !== 'number') break;
      n++;
    }
    return n;
  }

  function blockTypeLabel(type) {
    return (
      {
        text: 'Normal text',
        h1: 'Heading 1',
        h2: 'Heading 2',
        h3: 'Heading 3',
        h4: 'Heading 4',
        h5: 'Heading 5',
        h6: 'Heading 6',
        bullet: 'Bulleted list',
        number: 'Numbered list',
        todo: 'To-do list',
        toggle: 'Toggle list',
        quote: 'Quote',
        callout: 'Callout',
      }[type] || 'Normal text'
    );
  }

  function textNodePointForOffset(root, offset) {
    const target = Math.max(0, Number(offset) || 0),
      walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node,
      seen = 0,
      last = null;
    while ((node = walker.nextNode())) {
      last = node;
      const next = seen + (node.nodeValue || '').length;
      if (target <= next) return { node, offset: Math.max(0, target - seen) };
      seen = next;
    }
    return last ? { node: last, offset: (last.nodeValue || '').length } : { node: root, offset: 0 };
  }

  function selectTextOffsets(root, start, end) {
    if (!root) return false;
    const a = runtime.textNodePointForOffset(root, start),
      b = runtime.textNodePointForOffset(root, end);
    if (!a || !b) return false;
    try {
      const range = document.createRange();
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    } catch {
      return false;
    }
  }

  function captureMultiInlineSelection(range = null) {
    const segments = runtime.multiBlockSelection?.active
      ? runtime
          .multiSelectionSegments()
          .map(({ block, content, start, end }) => ({ blockId: block.id, content, start, end }))
      : [
          ...runtime.els.blockEditor.querySelectorAll('.block-content[contenteditable="true"]'),
        ].flatMap((content) => {
          if (!range?.intersectsNode(content)) return [];
          const blockId = content.closest('.block-row').dataset.blockId;
          if (!runtime.isTextLikeBlock(runtime.findBlock(blockId))) return [];
          const part = range.cloneRange();
          if (!content.contains(range.startContainer)) part.setStart(content, 0);
          if (!content.contains(range.endContainer))
            part.setEnd(content, content.childNodes.length);
          const start = runtime.localTextOffset(content, part.startContainer, part.startOffset);
          const end = runtime.localTextOffset(content, part.endContainer, part.endOffset);
          return end > start ? [{ blockId, content, start, end }] : [];
        });
    if (segments.length < 2) return null;
    const selection = { ...segments[0], segments };
    selection.rect =
      runtime.inlineSelectionViewportRect(selection) || segments[0].content.getBoundingClientRect();
    return selection;
  }

  function captureInlineSelection() {
    if (runtime.multiBlockSelection?.active) return captureMultiInlineSelection();
    const sel = window.getSelection();
    if (!sel?.rangeCount || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const startEl =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer
        : range.startContainer.parentElement;
    const endEl =
      range.endContainer.nodeType === Node.ELEMENT_NODE
        ? range.endContainer
        : range.endContainer.parentElement;
    const content = startEl?.closest?.(
      '.block-content[contenteditable="true"],[data-table-cell][contenteditable="true"]',
    );
    const endContent = endEl?.closest?.(
      '.block-content[contenteditable="true"],[data-table-cell][contenteditable="true"]',
    );
    if (
      content &&
      endContent &&
      content !== endContent &&
      runtime.els.blockEditor?.contains(content) &&
      runtime.els.blockEditor?.contains(endContent)
    )
      return captureMultiInlineSelection(range);
    if (!content || content !== endContent || !runtime.els.blockEditor?.contains(content))
      return null;
    const row = content.closest('.block-row[data-block-id]'),
      block = runtime.findBlock(row?.dataset.blockId);
    const cellPosition = content.matches('[data-table-cell]')
      ? runtime.tableCellCoordinates(content)
      : null;
    if (!row || !block || (cellPosition ? block.type !== 'table' : !runtime.isTextLikeBlock(block)))
      return null;
    const cellBlock = cellPosition
      ? runtime.tableCellInlineBlock(block, cellPosition.row, cellPosition.col, content.innerText)
      : null;
    const start = runtime.localTextOffset(content, range.startContainer, range.startOffset),
      end = runtime.localTextOffset(content, range.endContainer, range.endOffset);
    if (end <= start) return null;
    const rect = range.getBoundingClientRect();
    return {
      blockId: block.id,
      ...(cellPosition ? { cellPosition, cellBlock } : {}),
      start,
      end,
      content,
      rect: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
    };
  }

  function inlineSelectionBlock(selection = runtime.inlineSelectionState) {
    if (!selection) return null;
    return selection.cellPosition ? selection.cellBlock : runtime.findBlock(selection.blockId);
  }

  function activeSelectionLink(block, start, end) {
    return (
      runtime.inlineLinksForBlock(block).find((link) => link.start <= start && link.end >= end) ||
      null
    );
  }

  function closeTextFormatPopovers(except = '') {
    const toolbar = runtime.els.textFormatToolbar;
    if (!toolbar) return;
    const map = {
      type: '[data-format-type-menu]',
      color: '[data-format-color-menu]',
      link: '[data-format-link-popover]',
    };
    for (const [key, selector] of Object.entries(map))
      if (key !== except) toolbar.querySelector(selector)?.classList.add('hidden');
  }

  function activeLinkEditorRoot() {
    return runtime.standaloneLinkEditorOpen
      ? runtime.els.linkEditPanel
      : runtime.els.textFormatToolbar;
  }

  function positionLinkEditPanel(rect = runtime.inlineSelectionState?.rect) {
    const panel = runtime.els.linkEditPanel;
    if (!panel || !rect) return;
    const box = panel.getBoundingClientRect(),
      margin = 8;
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - box.width - margin));
    const below = rect.bottom + 8,
      top =
        below + box.height <= window.innerHeight - margin
          ? below
          : Math.max(margin, rect.top - box.height - 8);
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  }

  function closeStandaloneLinkEditor() {
    if (!runtime.standaloneLinkEditorOpen) return;
    runtime.standaloneLinkEditorOpen = false;
    runtime.els.linkEditPanel?.classList.add('hidden');
  }

  function cancelStandaloneLinkEditor() {
    if (!runtime.standaloneLinkEditorOpen) return;
    const selection = runtime.inlineSelectionState;
    runtime.closeStandaloneLinkEditor();
    if (selection?.cellPosition) runtime.restoreInlineSelection(selection);
    else if (selection) runtime.focusBlock(selection.blockId, selection.end);
  }

  function positionTextFormatToolbar(rect = runtime.inlineSelectionState?.rect) {
    const toolbar = runtime.els.textFormatToolbar;
    if (!toolbar || !rect || toolbar.classList.contains('hidden')) return;
    rect = runtime.inlineSelectionViewportRect();
    if (!rect) {
      toolbar.classList.add('hidden');
      return;
    }
    const box = toolbar.getBoundingClientRect(),
      margin = 8;
    let left = rect.left + (rect.width - box.width) / 2;
    left = Math.max(margin, Math.min(window.innerWidth - box.width - margin, left));
    let top = rect.top - box.height - 8;
    if (top < margin) top = rect.bottom + 8;
    top = Math.max(margin, Math.min(window.innerHeight - box.height - margin, top));
    toolbar.style.left = `${Math.round(left)}px`;
    toolbar.style.top = `${Math.round(top)}px`;
  }

  function updateTextFormatToolbarState() {
    const toolbar = runtime.els.textFormatToolbar,
      selection = runtime.inlineSelectionState;
    if (!toolbar || !selection) return;
    const block = runtime.inlineSelectionBlock(selection);
    if (!block) return;
    const segments = selection.segments || [selection];
    toolbar
      .querySelector('[data-format-equation]')
      ?.classList.toggle('hidden', Boolean(selection.segments));
    const label = toolbar.querySelector('[data-format-type-label]');
    if (label)
      label.textContent = selection.segments
        ? 'Multiple blocks'
        : selection.cellPosition
          ? 'Table cell'
          : runtime.blockTypeLabel(block.type);
    const hideTypeControl = Boolean(selection.cellPosition);
    const typeControl = toolbar.querySelector('[data-format-type-control]');
    if (typeControl) typeControl.hidden = hideTypeControl;
    const typeSeparator = toolbar.querySelector('[data-format-type-separator]');
    if (typeSeparator) typeSeparator.hidden = hideTypeControl;
    toolbar.querySelectorAll('[data-format-block-type]').forEach((btn) => {
      const active = segments.every(
        (segment) => runtime.inlineSelectionBlock(segment)?.type === btn.dataset.formatBlockType,
      );
      btn.classList.toggle('active', active);
      let check = btn.querySelector('.format-type-check');
      if (active && !check) {
        btn.insertAdjacentHTML(
          'beforeend',
          runtime.iconMarkup('check', '14px', 'format-type-check'),
        );
        check = btn.querySelector('.format-type-check');
      }
      if (!active) check?.remove();
    });
    toolbar.querySelectorAll('[data-format-inline]').forEach((btn) =>
      btn.classList.toggle(
        'active',
        segments.every((segment) =>
          runtime.selectionFullyFormatted(
            runtime.inlineSelectionBlock(segment),
            segment.start,
            segment.end,
            btn.dataset.formatInline,
          ),
        ),
      ),
    );
    toolbar
      .querySelector('[data-format-link-toggle]')
      ?.classList.toggle('hidden', Boolean(selection.segments));
    toolbar
      .querySelector('[data-format-link-toggle]')
      ?.classList.toggle(
        'active',
        !!runtime.activeSelectionLink(block, selection.start, selection.end),
      );
  }

  function showTextFormatToolbar(selection = runtime.captureInlineSelection()) {
    if (runtime.standaloneLinkEditorOpen) return;
    if (!selection) {
      runtime.hideTextFormatToolbar();
      return;
    }
    runtime.inlineSelectionState = selection;
    const toolbar = runtime.els.textFormatToolbar;
    if (!toolbar) return;
    toolbar.classList.remove('hidden');
    runtime.closeTextFormatPopovers();
    runtime.updateTextFormatToolbarState();
    runtime.lifecycle.frame(() => runtime.positionTextFormatToolbar(selection.rect));
  }

  function hideTextFormatToolbar({ clear = true } = {}) {
    const toolbar = runtime.els.textFormatToolbar;
    if (toolbar) {
      toolbar.classList.add('hidden');
      runtime.closeTextFormatPopovers();
    }
    if (clear) runtime.inlineSelectionState = null;
  }

  function onInlineSelectionPointerDown(event) {
    if (event.target.closest?.('#textFormatToolbar,#linkEditPanel,[data-link-hover-menu]')) {
      runtime.lifecycle.clearTimeout(runtime.inlineSelectionUpdateTimer);
      runtime.lifecycle.clearTimeout(runtime.linkHoverHideTimer);
      runtime.linkHoverHideTimer = null;
      return;
    }
    if (
      event.button !== 0 ||
      !event.target.closest?.(
        '.block-content[contenteditable="true"],[data-table-cell][contenteditable="true"]',
      )
    )
      return;
    runtime.inlinePointerSelectionActive = true;
    runtime.lifecycle.clearTimeout(runtime.inlineSelectionUpdateTimer);
    runtime.hideTextFormatToolbar();
  }

  function onLinkEditOutsidePointerDown(event) {
    if (
      event.button !== 0 ||
      !runtime.standaloneLinkEditorOpen ||
      runtime.els.linkEditPanel?.contains(event.target)
    )
      return;
    if (!runtime.applyInlineSelectionLink(null, { restoreCaret: false })) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function onInlineSelectionPointerEnd() {
    if (!runtime.inlinePointerSelectionActive) return;
    runtime.inlinePointerSelectionActive = false;
    runtime.scheduleTextFormatToolbarFromSelection();
  }

  function onInlineSelectionKeyDown(event) {
    if (
      !event.shiftKey ||
      !event.target.closest?.(
        '.block-content[contenteditable="true"],[data-table-cell][contenteditable="true"]',
      ) ||
      ![
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
        'PageUp',
        'PageDown',
      ].includes(event.key)
    )
      return;
    runtime.inlineKeyboardSelectionActive = true;
    runtime.lifecycle.clearTimeout(runtime.inlineSelectionUpdateTimer);
    runtime.hideTextFormatToolbar();
  }

  function onInlineSelectionKeyUp(event) {
    if (!runtime.inlineKeyboardSelectionActive || (event.key !== 'Shift' && event.shiftKey)) return;
    runtime.inlineKeyboardSelectionActive = false;
    runtime.scheduleTextFormatToolbarFromSelection();
  }

  function onInlineSelectionInteractionBlur() {
    runtime.inlinePointerSelectionActive = false;
    runtime.inlineKeyboardSelectionActive = false;
    runtime.scheduleTextFormatToolbarFromSelection();
  }

  function scheduleTextFormatToolbarFromSelection() {
    runtime.lifecycle.clearTimeout(runtime.inlineSelectionUpdateTimer);
    if (runtime.inlinePointerSelectionActive || runtime.inlineKeyboardSelectionActive) return;
    runtime.inlineSelectionUpdateTimer = runtime.lifecycle.timeout(() => {
      runtime.inlineSelectionUpdateTimer = null;
      if (runtime.inlinePointerSelectionActive || runtime.inlineKeyboardSelectionActive) return;
      if (runtime.standaloneLinkEditorOpen) return;
      if (runtime.els.textFormatToolbar?.contains(document.activeElement)) return;
      const selection = runtime.captureInlineSelection();
      if (selection) {
        const previous = runtime.inlineSelectionState;
        if (
          previous &&
          previous.blockId === selection.blockId &&
          previous.cellPosition?.row === selection.cellPosition?.row &&
          previous.cellPosition?.col === selection.cellPosition?.col &&
          previous.start === selection.start &&
          previous.end === selection.end &&
          !runtime.els.textFormatToolbar?.classList.contains('hidden')
        ) {
          runtime.inlineSelectionState = selection;
          runtime.updateTextFormatToolbarState();
          runtime.positionTextFormatToolbar(selection.rect);
        } else runtime.showTextFormatToolbar(selection);
      } else runtime.hideTextFormatToolbar();
    }, 100);
  }

  function restoreInlineSelection(selection = runtime.inlineSelectionState, { show = true } = {}) {
    if (!selection) return;
    runtime.lifecycle.frame(() => {
      if (selection.segments) {
        const segments = selection.segments
          .map((segment) => ({
            ...segment,
            content: runtime.els.blockEditor.querySelector(
              `.block-row[data-block-id="${segment.blockId}"] .block-content`,
            ),
          }))
          .filter((segment) => segment.content);
        if (segments.length < 2) return;
        const first = segments[0],
          last = segments.at(-1);
        runtime.clearMultiBlockSelection();
        runtime.multiBlockSelection = {
          anchor: {
            content: first.content,
            ...runtime.textNodePointForOffset(first.content, first.start),
          },
          focus: {
            content: last.content,
            ...runtime.textNodePointForOffset(last.content, last.end),
          },
          active: true,
          dragging: false,
        };
        runtime.renderMultiBlockSelection();
        const restored = { ...selection, ...first, segments };
        restored.rect = runtime.inlineSelectionViewportRect(restored) || selection.rect;
        if (show) runtime.showTextFormatToolbar(restored);
        return;
      }
      const content = selection.cellPosition
        ? document.querySelector(
            `.block-row[data-block-id="${selection.blockId}"] [data-table-cell="${selection.cellPosition.row}:${selection.cellPosition.col}"]`,
          )
        : document.querySelector(
            `.block-row[data-block-id="${selection.blockId}"] .block-content[contenteditable="true"]`,
          );
      if (!content) return;
      content.focus({ preventScroll: true });
      runtime.selectTextOffsets(content, selection.start, selection.end);
      const range = window.getSelection()?.rangeCount ? window.getSelection().getRangeAt(0) : null;
      if (range) {
        const rect = range.getBoundingClientRect();
        selection.content = content;
        selection.rect = {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      }
      if (show) runtime.showTextFormatToolbar(selection);
    });
  }

  function commitInlineFormatting(
    selection = runtime.inlineSelectionState,
    { restore = true } = {},
  ) {
    if (!selection) return;
    if (selection.cellPosition) {
      const table = runtime.findBlock(selection.blockId);
      if (!table || table.type !== 'table') return;
      table.tableRows[selection.cellPosition.row][selection.cellPosition.col] =
        selection.cellBlock.text;
      runtime.setTableCellInline(
        table,
        selection.cellPosition.row,
        selection.cellPosition.col,
        selection.cellBlock,
      );
    }
    runtime.scheduleSave();
    runtime.renderBlocks(runtime.currentPage());
    if (restore) runtime.restoreInlineSelection({ ...selection });
  }

  function applyInlineToolbarFormat(type) {
    const selection = runtime.inlineSelectionState,
      block = runtime.inlineSelectionBlock(selection);
    if (!selection || !block) return;
    if (selection.segments) {
      const remove = selection.segments.every((segment) =>
        runtime.selectionFullyFormatted(
          runtime.inlineSelectionBlock(segment),
          segment.start,
          segment.end,
          type,
        ),
      );
      for (const segment of selection.segments)
        runtime.setInlineFormatRange(
          runtime.inlineSelectionBlock(segment),
          segment.start,
          segment.end,
          type,
          '',
          remove ? 'remove' : 'set',
        );
      runtime.commitInlineFormatting(selection);
      return;
    }
    if (runtime.setInlineFormatRange(block, selection.start, selection.end, type, '', 'toggle'))
      runtime.commitInlineFormatting(selection);
  }

  function applyInlineToolbarChoice(type, value) {
    const selection = runtime.inlineSelectionState,
      block = runtime.inlineSelectionBlock(selection);
    if (!selection || !block) return;
    if (selection.segments) {
      for (const segment of selection.segments)
        runtime.setInlineFormatRange(
          runtime.inlineSelectionBlock(segment),
          segment.start,
          segment.end,
          type,
          value,
          value === 'default' ? 'remove' : 'set',
        );
      runtime.closeTextFormatPopovers();
      runtime.commitInlineFormatting(selection);
      return;
    }
    runtime.setInlineFormatRange(
      block,
      selection.start,
      selection.end,
      type,
      value,
      value === 'default' ? 'remove' : 'set',
    );
    runtime.closeTextFormatPopovers();
    runtime.commitInlineFormatting(selection);
  }

  function transformInlineSelectionBlock(type) {
    const selection = runtime.inlineSelectionState,
      location = runtime.findBlockLocation(selection?.blockId),
      block = location?.block;
    if (!selection || !block || selection.cellPosition) return;
    const allowed = new Set([
      'text',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'bullet',
      'number',
      'todo',
      'toggle',
      'quote',
      'callout',
    ]);
    if (!allowed.has(type)) return;
    for (const segment of selection.segments || [selection]) {
      const block = runtime.inlineSelectionBlock(segment);
      block.type = type;
      if (type === 'todo' && typeof block.checked !== 'boolean') block.checked = false;
      else if (type !== 'todo') delete block.checked;
      if (type === 'toggle' && typeof block.open !== 'boolean') block.open = false;
      else if (type !== 'toggle') delete block.open;
      if (runtime.isListBlock(block))
        runtime.setListIndentLevel(block, runtime.listIndentLevel(block));
      else delete block.indent;
    }
    runtime.closeTextFormatPopovers();
    runtime.commitInlineFormatting(selection);
  }

  function selectionLinkTarget(selection = runtime.inlineSelectionState) {
    const block = runtime.inlineSelectionBlock(selection);
    if (!selection || !block) return null;
    return runtime.activeSelectionLink(block, selection.start, selection.end) || null;
  }

  function selectionLinkUrl(selection = runtime.inlineSelectionState) {
    return runtime.selectionLinkTarget(selection)?.url || '';
  }

  function renderInlineLinkResults(query = '') {
    const root = runtime.activeLinkEditorRoot(),
      results = root?.querySelector('[data-format-link-results]'),
      apply = root?.querySelector('[data-format-link-apply]');
    if (!results) return;
    const q = String(query || '').trim(),
      key = q.toLocaleLowerCase();
    const pages = runtime.state.pages
      .filter(
        (page) =>
          !key ||
          String(page.title || 'Untitled')
            .toLocaleLowerCase()
            .includes(key),
      )
      .slice(0, 8);
    const external = runtime.normalizePastedLinkUrl(q);
    let html = '';
    if (pages.length) {
      html += runtime.htmlWithStyles(`<div class="format-link-section-title">Pages</div>`);
      html += pages
        .map((page) =>
          runtime.htmlWithStyles(
            `<button type="button" class="format-link-result" data-format-link-page="${page.id}"><span class="format-link-result-icon">${runtime.pageIconMarkup(runtime.pageIconFor(page))}</span><span class="format-link-result-copy"><b>${runtime.escapeHtml(page.title || 'Untitled')}</b><small>Link to page</small></span></button>`,
          ),
        )
        .join('');
    }
    if (external) {
      html += runtime.htmlWithStyles(
        `<div class="format-link-section-title">External link</div><button type="button" class="format-link-result" data-format-link-external="${runtime.escapeHtml(external)}"><span class="format-link-result-icon">${runtime.iconMarkup('external-link', '16px')}</span><span class="format-link-result-copy"><b>${runtime.escapeHtml(q)}</b><small>${runtime.escapeHtml(external)}</small></span></button>`,
      );
    }
    if (!html)
      html = runtime.htmlWithStyles(
        `<div class="format-link-empty">Type a page name or paste an external URL.</div>`,
      );
    results.innerHTML = html;
    if (apply) {
      apply.disabled = !external;
      apply.title = external
        ? 'Link selected text to this URL'
        : 'Enter an external URL or choose a page';
    }
  }

  function openInlineLinkPopover({ focusTitle = false, standalone = false } = {}) {
    if (runtime.inlineSelectionState?.segments) return;
    runtime.hideLinkHoverMenu();
    const toolbar = runtime.els.textFormatToolbar,
      selection = runtime.inlineSelectionState;
    if (!toolbar || !selection) return;
    runtime.closeTextFormatPopovers('link');
    runtime.standaloneLinkEditorOpen = standalone;
    if (standalone) runtime.hideTextFormatToolbar({ clear: false });
    const root = runtime.activeLinkEditorRoot(),
      pop = root?.querySelector('[data-format-link-popover]') || root,
      input = root?.querySelector('[data-format-link-input]'),
      title = root?.querySelector('[data-format-link-title]'),
      remove = root?.querySelector('[data-format-link-remove]');
    pop?.classList.remove('hidden');
    const existing = runtime.selectionLinkTarget(selection);
    const block = runtime.inlineSelectionBlock(selection),
      selectedText = String(block?.text || '').slice(selection.start, selection.end);
    if (input) {
      if (existing?.pageId) input.value = runtime.pageById(existing.pageId)?.title || '';
      else input.value = existing?.url || '';
    }
    if (title) title.value = selectedText;
    remove?.classList.toggle('hidden', !existing);
    runtime.renderInlineLinkResults(input?.value || '');
    runtime.lifecycle.frame(() => {
      const focusTarget = focusTitle ? title : input;
      focusTarget?.focus({ preventScroll: true });
      focusTarget?.select();
      if (standalone) runtime.positionLinkEditPanel(selection.rect);
      else runtime.positionTextFormatToolbar(selection.rect);
    });
  }

  function applyInlineSelectionLink(targetOverride = null, { restoreCaret = true } = {}) {
    const root = runtime.activeLinkEditorRoot(),
      selection = runtime.inlineSelectionState,
      block = runtime.inlineSelectionBlock(selection),
      input = root?.querySelector('[data-format-link-input]');
    if (!selection || !block || !input) return false;
    const url =
      runtime.normalizePastedLinkUrl(input.value.trim()) ||
      runtime.normalizeHyperlinkUrl(input.value.trim());
    const target = targetOverride || (url ? { url } : null);
    if (!target) {
      runtime.toast('Choose a page or enter a valid URL');
      input.focus();
      return false;
    }
    const title = root?.querySelector('[data-format-link-title]')?.value;
    const originalTitle = String(block.text || '').slice(selection.start, selection.end);
    if (title != null && title !== originalTitle) {
      if (!title.trim()) {
        runtime.toast('Link title cannot be empty');
        root?.querySelector('[data-format-link-title]')?.focus();
        return false;
      }
      selection.end = runtime.replaceBlockRangeWithInlineLink(
        block,
        selection.start,
        selection.end,
        title,
        target,
      );
    } else if (!runtime.applyInlineLinkToSelection(block, selection.start, selection.end, target))
      return false;
    if (runtime.standaloneLinkEditorOpen) {
      runtime.standaloneLinkEditorOpen = false;
      runtime.els.linkEditPanel?.classList.add('hidden');
      runtime.commitInlineFormatting(selection, { restore: restoreCaret });
      if (!restoreCaret) runtime.inlineSelectionState = null;
      return true;
    }
    runtime.closeTextFormatPopovers();
    runtime.commitInlineFormatting(selection);
    return true;
  }

  function applyInlineSelectionPageLink(pageId) {
    const selection = runtime.inlineSelectionState,
      block = runtime.inlineSelectionBlock(selection),
      page = runtime.pageById(pageId);
    if (!selection || !block || !page) return;
    runtime.applyInlineSelectionLink({ pageId: page.id });
  }

  function removeInlineSelectionLink() {
    const selection = runtime.inlineSelectionState,
      block = runtime.inlineSelectionBlock(selection);
    if (!selection || !block) return;
    const kept = [];
    for (const link of runtime.inlineLinksForBlock(block)) {
      if (link.end <= selection.start || link.start >= selection.end) kept.push({ ...link });
      else {
        if (link.start < selection.start) kept.push({ ...link, end: selection.start });
        if (link.end > selection.end) kept.push({ ...link, start: selection.end });
      }
    }
    block.inlineLinks = runtime.normalizeInlineLinkRanges(kept, String(block.text || '').length);
    if (!block.inlineLinks.length) delete block.inlineLinks;
    if (runtime.standaloneLinkEditorOpen) {
      runtime.standaloneLinkEditorOpen = false;
      runtime.els.linkEditPanel?.classList.add('hidden');
      runtime.commitInlineFormatting(selection, { restore: false });
      runtime.inlineSelectionState = null;
      return;
    }
    runtime.closeTextFormatPopovers();
    runtime.commitInlineFormatting(selection);
  }

  function clearInlineSelectionFormatting() {
    const selection = runtime.inlineSelectionState,
      block = runtime.inlineSelectionBlock(selection);
    if (!selection || !block) return;
    for (const segment of selection.segments || [selection])
      runtime.clearInlineFormattingRange(
        runtime.inlineSelectionBlock(segment),
        segment.start,
        segment.end,
        { links: true },
      );
    runtime.closeTextFormatPopovers();
    runtime.commitInlineFormatting(selection);
  }

  function newTextBlock() {
    return { id: runtime.uid('b'), type: 'text', text: '' };
  }

  function findBlockLocation(id, blocks = runtime.currentPage()?.blocks || [], parentBlock = null) {
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (block?.id === id) return { block, blocks, index: i, parentBlock };
      if (block?.type === 'toggle') {
        runtime.normalizeToggleBlock(block);
        const found = runtime.findBlockLocation(id, block.children, block);
        if (found) return found;
      }
    }
    return null;
  }

  function removeBlockOccurrences(id, blocks, holder = { block: null }, emptiedLists = new Set()) {
    if (!Array.isArray(blocks)) return holder.block;
    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i];
      if (block?.id === id) {
        if (!holder.block) holder.block = block;
        blocks.splice(i, 1);
        continue;
      }
      if (block?.type === 'toggle') {
        runtime.normalizeToggleBlock(block);
        runtime.removeBlockOccurrences(id, block.children, holder, emptiedLists);
      }
    }
    if (!blocks.length) emptiedLists.add(blocks);
    return holder.block;
  }

  function findBlock(id) {
    return runtime.findBlockLocation(id)?.block || null;
  }

  function isTextLikeBlock(block) {
    return (
      !!block &&
      [
        'text',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'bullet',
        'number',
        'todo',
        'toggle',
        'quote',
        'callout',
      ].includes(block.type)
    );
  }

  function ensureBlockList(blocks) {
    if (Array.isArray(blocks) && !blocks.length) blocks.push(runtime.newTextBlock());
  }

  function addBlockAfter(id) {
    const page = runtime.currentPage(),
      loc = runtime.findBlockLocation(id);
    if (!loc) return;
    const b = runtime.newTextBlock();
    loc.blocks.splice(loc.index + 1, 0, b);
    runtime.scheduleSave();
    runtime.renderBlocks(page);
    runtime.focusBlock(b.id, 0);
  }

  function addBlockOnBlankPageEndClick(event) {
    if (
      event.button !== 0 ||
      runtime.workspaceAccess !== 'writable' ||
      event.target.closest?.('.block-row,button,input,textarea,select,a,[contenteditable="true"]')
    )
      return false;
    const pageRoot = event.target.closest?.('article.page');
    const editor = pageRoot?.querySelector('.block-editor');
    if (!pageRoot || !editor) return false;
    const page = pageRoot.dataset.pageId
      ? runtime.pageById(pageRoot.dataset.pageId)
      : runtime.currentPage();
    const rows = [...editor.children].filter((child) => child.matches('.block-row'));
    const lastRow = rows.at(-1),
      lastBlock = page?.blocks?.at(-1);
    if (!page || !lastRow || !lastBlock || event.clientY < lastRow.getBoundingClientRect().bottom)
      return false;
    if (runtime.hasBlankTrailingLine(lastBlock)) return false;
    const block = runtime.newTextBlock();
    page.blocks.push(block);
    const markup = runtime.blockHTML(block, page.blocks.length - 1, page.blocks),
      editors = new Set([editor]);
    runtime.els.editorDock?.querySelectorAll('[data-dock-page]').forEach((root) => {
      if (root.dataset.pageId === page.id) {
        const pageEditor = root.querySelector('[data-dock-blocks]');
        if (pageEditor) editors.add(pageEditor);
      }
    });
    for (const pageEditor of editors) {
      pageEditor.insertAdjacentHTML('beforeend', markup);
      runtime.syncSpellcheckElements(pageEditor.lastElementChild);
    }
    runtime.scheduleSave();
    runtime.focusBlock(block.id, 0, editor);
    return true;
  }

  function hasBlankTrailingLine(block) {
    if (block?.type === 'toggle' && block.children?.length)
      return runtime.hasBlankTrailingLine(block.children.at(-1));
    if (
      !block ||
      ![
        'text',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'bullet',
        'number',
        'todo',
        'toggle',
        'quote',
        'callout',
      ].includes(block.type)
    )
      return false;
    const lines = String(block.text || '')
      .replace(/\r\n/g, '\n')
      .split('\n');
    return !String(lines.at(-1) || '').trim();
  }

  function addToggleChild(id) {
    const page = runtime.currentPage(),
      block = runtime.findBlock(id);
    if (!page || block?.type !== 'toggle') return;
    if (!Array.isArray(block.children)) block.children = [];
    block.open = true;
    const child = runtime.newTextBlock();
    block.children.push(child);
    runtime.scheduleSave();
    runtime.renderBlocks(page);
    runtime.focusBlock(child.id, 0);
  }

  function cloneBlockWithNewIds(block) {
    const cp = runtime.clone(block);
    cp.id = runtime.uid('b');
    if (cp.type === 'toggle' && Array.isArray(cp.children))
      cp.children = cp.children.map(runtime.cloneBlockWithNewIds);
    return cp;
  }

  function blockContainsId(block, id) {
    if (!block) return false;
    if (block.id === id) return true;
    if (block.type === 'toggle')
      return (block.children || []).some((child) => runtime.blockContainsId(child, id));
    return false;
  }

  function blockTextFallback(block) {
    if (!block) return '';
    if (block.type === 'table') return (block.tableRows || []).flat().filter(Boolean).join(' ');
    if (block.type === 'toggle')
      return [
        block.text,
        ...runtime
          .flattenBlocks(block.children || [])
          .map((child) => runtime.blockTextFallback(child)),
      ]
        .filter(Boolean)
        .join(' ');
    const linked = block.pageId ? runtime.pageById(block.pageId) : null;
    return block.text || block.caption || block.title || linked?.title || '';
  }

  function chooseImageFile(id) {
    runtime.activeImageBlockId = id;
    runtime.els.imageFileInput.value = '';
    runtime.els.imageFileInput.click();
  }

  function openImageUrlEditor(id) {
    runtime.activeImageLinkBlockId = id;
    runtime.renderBlocks(runtime.currentPage());
    runtime.lifecycle.frame(() => {
      const input = document.querySelector(
        `.block-row[data-block-id="${id}"] [data-image-url-input]`,
      );
      input?.focus();
      input?.select();
    });
  }

  function commitImageUrl(id, input) {
    const b = runtime.findBlock(id);
    if (!b || !input) return;
    const operationEpoch = runtime.pageOperationEpoch,
      pageId = runtime.state.currentPageId;
    const editor = input.closest('[data-image-url-editor]');
    const error = editor?.querySelector('[data-image-url-error]');
    const url = runtime.normalizeImageUrl(input.value);
    if (!url) {
      if (error) error.textContent = 'Enter a valid http:// or https:// image URL.';
      input.focus();
      return;
    }
    if (error) error.textContent = '';
    editor?.classList.add('loading');
    const probe = new Image();
    let finished = false;
    const done = async (ok) => {
      if (finished) return;
      finished = true;
      runtime.lifecycle.clearTimeout(timer);
      if (operationEpoch !== runtime.pageOperationEpoch || runtime.state.currentPageId !== pageId)
        return;
      if (!ok) {
        editor?.classList.remove('loading');
        if (error)
          error.textContent =
            'This URL could not be loaded as an image. Try a direct public .jpg, .png, .webp, .gif, or other image URL.';
        input.focus();
        return;
      }
      const current = runtime.findBlock(id);
      if (!current) return;
      let source = url;
      try {
        const response = await fetch(url, { mode: 'cors' });
        if (response.ok) {
          const blob = await response.blob();
          const canStore =
            blob.type.startsWith('image/') &&
            (runtime.localStorageGateway.hasDirectory?.() || blob.size <= 2.5 * 1024 * 1024);
          if (
            canStore &&
            operationEpoch === runtime.pageOperationEpoch &&
            runtime.state.currentPageId === pageId
          )
            source = await runtime.saveImageBlobAttachment(blob, runtime.imageAltFromUrl(url));
        }
      } catch {
        /* Keep a remote link when the source does not allow downloading it. */
      }
      editor?.classList.remove('loading');
      if (operationEpoch !== runtime.pageOperationEpoch || runtime.state.currentPageId !== pageId)
        return;
      const latest = runtime.findBlock(id);
      if (!latest) return;
      latest.src = source;
      latest.alt = latest.alt || runtime.imageAltFromUrl(url);
      runtime.activeImageLinkBlockId = null;
      runtime.scheduleSave();
      runtime.renderBlocks(runtime.currentPage());
      runtime.toast(source === url ? 'Image linked' : 'Image saved to attachments');
    };
    probe.onload = () => done(true);
    probe.onerror = () => done(false);
    const timer = runtime.lifecycle.timeout(() => done(false), 10000);
    probe.src = url;
  }

  function normalizeImageUrl(value) {
    let raw = String(value || '').trim();
    if (!raw) return '';
    if (/^data:image\//i.test(raw)) return raw;
    if (/^\/\//.test(raw)) raw = 'https:' + raw;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(raw) && /^[^\s/]+\.[^\s/]+/.test(raw)) raw = 'https://' + raw;
    try {
      const u = new URL(raw);
      if (!['http:', 'https:'].includes(u.protocol)) return '';
      // Common share-link forms that otherwise return an HTML page instead of image bytes.
      if (u.hostname === 'www.dropbox.com' || u.hostname === 'dropbox.com') {
        u.searchParams.delete('dl');
        u.searchParams.set('raw', '1');
      }
      const drive = u.hostname === 'drive.google.com' && u.pathname.match(/^\/file\/d\/([^/]+)/);
      if (drive)
        return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(drive[1])}`;
      return u.href;
    } catch {}
    return '';
  }

  function normalizeVaultAssetPath(value) {
    let raw = String(value || '').trim();
    if (!raw || raw.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return '';
    raw = raw.replace(/^<|>$/g, '');
    try {
      raw = decodeURIComponent(raw);
    } catch {}
    raw = raw.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
    const parts = raw.split('/');
    if (!raw || parts.some((part) => !part || part === '.' || part === '..')) return '';
    return parts.join('/');
  }

  function pasteMarkdownIntoBlock(content, markdown, sourceLabel = 'Markdown') {
    return runtime.pasteParsedBlocksIntoBlock(
      content,
      runtime.parseMarkdownBlocks(markdown, { preserveInline: true }),
      sourceLabel,
    );
  }

  function pasteRichHtmlIntoBlock(content, html) {
    const parsed = runtime.parseRichHtmlBlocks(html);
    const block = runtime.findBlock(content?.closest('.block-row')?.dataset.blockId);
    if (
      runtime.workspaceAccess === 'writable' &&
      ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(block?.type) &&
      parsed.length &&
      parsed.every((item) => ['text', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(item.type))
    ) {
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (!range || !content.contains(range.commonAncestorContainer)) return false;
      const root = new DOMParser().parseFromString(html, 'text/html').body;
      const payload = runtime.richHtmlInlinePayload(root, { tableCell: true });
      if (!payload.text) return false;
      const fragment = range.createContextualFragment(
        runtime.inlineTextHTML({
          id: block.id,
          type: block.type,
          text: payload.text,
          inlineLinks: payload.links,
          inlineFormats: payload.formats,
        }),
      );
      const last = fragment.lastChild;
      runtime.flushHistoryPending();
      runtime.captureHistoryBeforeInput({ inputType: 'insertFromPaste' });
      range.deleteContents();
      range.insertNode(fragment);
      range.setStartAfter(last);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      content.dispatchEvent(
        new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }),
      );
      runtime.scheduleSave();
      return true;
    }
    if (!runtime.richHtmlShouldCreateBlocks(html, parsed)) return false;
    return runtime.pasteParsedBlocksIntoBlock(content, parsed, 'Rich text');
  }

  function onBeforeInput(e) {
    runtime.captureHistoryBeforeInput(e);
    if (
      !e.isComposing &&
      e.inputType === 'insertParagraph' &&
      runtime.applyMarkdownBlockShortcut(e.target.closest?.('.block-content'), 'enter')
    ) {
      e.preventDefault();
      return;
    }
    const isTitle = e.target === runtime.els.pageTitle || e.target.matches?.('[data-dock-title]');
    if (
      isTitle &&
      e.inputType.startsWith('insert') &&
      typeof e.data === 'string' &&
      runtime.hasForbiddenFilesystemNameCharacters(e.data)
    ) {
      e.preventDefault();
      runtime.toast('Names cannot contain < > : " / \\ | ? * or control characters.');
      return;
    }
    if (
      (e.target === runtime.els.pageTitle || e.target.matches?.('[data-dock-title]')) &&
      ['insertParagraph', 'insertLineBreak'].includes(e.inputType)
    )
      e.preventDefault();
  }

  function pageForTitleEditor(element) {
    const dockPage = element.matches?.('[data-dock-title]')
      ? element.closest('[data-dock-page]')
      : null;
    return dockPage ? runtime.pageById(dockPage.dataset.pageId) : runtime.currentPage();
  }

  function onFocusOut(e) {
    const target = e.target;
    if (
      runtime.standaloneLinkEditorOpen &&
      runtime.els.linkEditPanel?.contains(target) &&
      !runtime.els.linkEditPanel.contains(e.relatedTarget)
    ) {
      runtime.applyInlineSelectionLink(null, { restoreCaret: false });
      return;
    }
    if (target !== runtime.els.pageTitle && !target.matches?.('[data-dock-title]')) return;
    const page = runtime.pageForTitleEditor(target),
      title = target.innerText.replace(/\n/g, ' '),
      validationError = runtime.validateFilesystemName(title, 3);
    if (validationError) {
      target.textContent = page?.title || 'Untitled';
      delete target.dataset.filenameError;
      delete target.dataset.folderNotePath;
      delete target.dataset.folderNoteTitle;
      runtime.toast(validationError);
      return;
    }
    const conflict = runtime.pageTitleConflict(page, title),
      uniqueTitle = conflict ? runtime.uniquePageTitle(page, title) : title;
    if (conflict && !uniqueTitle) {
      target.textContent = page?.title || 'Untitled';
      delete target.dataset.filenameError;
      delete target.dataset.folderNotePath;
      delete target.dataset.folderNoteTitle;
      runtime.toast('Could not add a counter within the filesystem name limit.');
      return;
    }
    const wasRenamed = Boolean(conflict && uniqueTitle !== title);
    if (wasRenamed && page) {
      page.title = uniqueTitle;
      target.textContent = uniqueTitle;
    }
    delete target.dataset.filenameError;
    const oldPath = target.dataset.folderNotePath,
      oldTitle = target.dataset.folderNoteTitle;
    delete target.dataset.folderNotePath;
    delete target.dataset.folderNoteTitle;
    if (page && oldPath && oldTitle && oldTitle !== page.title) {
      if (wasRenamed) runtime.toast(`That name is already in use. Renamed to "${uniqueTitle}".`);
      void runtime.renameFolderForFolderNote(page.id, oldPath, oldTitle, page.title);
      return;
    }
    if (wasRenamed && page) {
      runtime.scheduleSave('merge');
      runtime.renderSidebar();
      runtime.renderTabs();
      if (page.id === runtime.state.currentPageId) {
        runtime.renderBreadcrumbs(page);
        runtime.renderRightSidebar();
      }
      if (runtime.els.editorDock && !runtime.els.editorDock.classList.contains('hidden'))
        runtime.els.editorDock.querySelectorAll('.dock-tab[data-tab-id]').forEach((tab) => {
          const item = runtime.state.openTabs.find((openTab) => openTab.id === tab.dataset.tabId);
          if (item?.pageId === page.id)
            tab.querySelector('.tab-title').textContent = page.title || 'Untitled';
        });
      runtime.toast(`That name is already in use. Renamed to "${uniqueTitle}".`);
    }
  }

  function clipboardSvgImageFile(data) {
    const parser = new DOMParser();
    const namespace = 'http://www.w3.org/2000/svg';
    const asFile = (svg) => {
      if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', namespace);
      return new File([new XMLSerializer().serializeToString(svg)], 'clipboard-image.svg', {
        type: 'image/svg+xml',
      });
    };
    const parseSource = (value) => {
      let source = String(value || '').trim();
      const fenced = source.match(
        /^(`{3,}|~{3,})[ \t]*(?:svg|xml|html)?[ \t]*\r?\n([\s\S]*?)\r?\n\1[ \t]*$/i,
      );
      if (fenced) source = fenced[2].trim();
      if (!source.startsWith('<')) return null;
      const document = parser.parseFromString(source, 'image/svg+xml');
      const svg = document.documentElement;
      if (
        svg.localName === 'svg' &&
        (!svg.namespaceURI || svg.namespaceURI === namespace) &&
        !document.querySelector('parsererror')
      )
        return asFile(svg);
      return null;
    };
    for (const type of [
      'image/svg+xml',
      'application/xml',
      'text/xml',
      'text/markdown',
      'text/plain',
    ]) {
      const file = parseSource(data?.getData?.(type));
      if (file) return file;
    }
    const html = String(data?.getData?.('text/html') || '');
    if (!html) return null;
    const document = parser.parseFromString(html, 'text/html');
    const code = document.body.querySelector('pre');
    if (code) {
      const file = parseSource(code.textContent);
      const remaining = document.body.cloneNode(true);
      remaining.querySelector('pre')?.remove();
      if (
        file &&
        !remaining.textContent.trim() &&
        !remaining.querySelector('img,svg,video,iframe,table')
      )
        return file;
    }
    const svg = document.body.querySelector('svg');
    if (!svg) return null;
    svg.remove();
    // Do not discard surrounding rich text or other media to extract a diagram.
    if (
      document.body.textContent.trim() ||
      document.body.querySelector('svg,img,video,iframe,table')
    )
      return null;
    return asFile(svg);
  }

  function onPaste(e) {
    if (runtime.externalIconPaneActive()) {
      const file = runtime.transferImageFile(e.clipboardData);
      const targetIsTextField = e.target.matches?.('input,textarea,[contenteditable="true"]');
      if (file) {
        e.preventDefault();
        runtime.loadPageIconFile(file);
        return;
      }
      if (!targetIsTextField && runtime.applyExternalIconTransfer(e.clipboardData)) {
        e.preventDefault();
        return;
      }
    }
    if (runtime.pasteCopiedImageBlock?.(e)) return;
    if (
      runtime.multiBlockSelection?.allPage &&
      runtime.workspaceAccess === 'writable' &&
      !runtime.transferImageFile(e.clipboardData)
    ) {
      const html = String(e.clipboardData?.getData('text/html') || '');
      const explicit = String(e.clipboardData?.getData('text/markdown') || '');
      const text = explicit || String(e.clipboardData?.getData('text/plain') || '');
      let blocks = [];
      if (/<table[\s>]/i.test(html)) blocks = runtime.parseRichHtmlBlocks(html);
      else if (explicit || runtime.looksLikeMarkdown(text))
        blocks = runtime.parseMarkdownBlocks(text, {
          preserveInline: true,
          preserveBlankLines: true,
        });
      else if (html) blocks = runtime.parseRichHtmlBlocks(html);
      if (html || text) {
        e.preventDefault();
        runtime.replaceSelectedPageContents(text, blocks);
        return;
      }
    }
    if (e.target === runtime.els.pageTitle || e.target.matches?.('[data-dock-title]')) {
      e.preventDefault();
      const text = String(e.clipboardData?.getData('text/plain') || '')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s{2,}/g, ' ');
      if (runtime.hasForbiddenFilesystemNameCharacters(text)) {
        runtime.toast('Names cannot contain < > : " / \\ | ? * or control characters.');
        return;
      }
      runtime.insertTextAtSelection(e.target, text);
      e.target.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const tableCell = e.target.closest?.('[data-table-cell]');
    if (tableCell && runtime.pasteTableMatrixIntoCell(tableCell, e.clipboardData)) {
      e.preventDefault();
      return;
    }
    const file =
      runtime.transferImageFile(e.clipboardData) ||
      (e.target.closest?.('.block-content')
        ? runtime.clipboardSvgImageFile(e.clipboardData)
        : null);
    if (file) {
      const row = e.target.closest('.block-row'),
        location = runtime.findBlockLocation(row?.dataset.blockId);
      if (file && location) {
        e.preventDefault();
        const image = { id: runtime.uid('b'), type: 'image', src: '', caption: '', alt: '' };
        location.blocks.splice(location.index + 1, 0, image);
        runtime.renderBlocks(runtime.currentPage());
        runtime.loadImageFileIntoBlock(file, image.id);
        return;
      }
    }

    const content = e.target.closest?.('.block-content');
    if (content) {
      const richHtml = String(e.clipboardData?.getData('text/html') || '');
      // Preserve table structure and cell formatting before interpreting fallback text or links.
      if (/<table[\s>]/i.test(richHtml) && runtime.pasteRichHtmlIntoBlock(content, richHtml)) {
        e.preventDefault();
        return;
      }
      const linkPayload = runtime.clipboardLinkPayload(e.clipboardData);
      if (linkPayload && runtime.pasteLinkIntoBlock(content, linkPayload)) {
        e.preventDefault();
        return;
      }
      const explicitMarkdown = String(e.clipboardData?.getData('text/markdown') || '');
      const plainText = String(e.clipboardData?.getData('text/plain') || '');
      const markdown = explicitMarkdown || plainText;
      const markdownLike = !!explicitMarkdown || runtime.looksLikeMarkdown(markdown);
      // HTML wrappers around Markdown source must not discard list markers or links.
      if (
        markdownLike &&
        (explicitMarkdown || /\[[^\]]+\]\([^)]+\)/.test(plainText)) &&
        runtime.pasteMarkdownIntoBlock(content, markdown, 'Markdown')
      ) {
        e.preventDefault();
        return;
      }
      if (richHtml && runtime.pasteRichHtmlIntoBlock(content, richHtml)) {
        e.preventDefault();
        return;
      }
      const hasParagraphBreaks = !explicitMarkdown && /(?:\r?\n)[ \t]*(?:\r?\n)/.test(plainText);
      if (
        markdown &&
        (markdownLike || hasParagraphBreaks) &&
        runtime.pasteMarkdownIntoBlock(content, markdown, markdownLike ? 'Markdown' : 'Text')
      ) {
        e.preventDefault();
        return;
      }
    }
  }

  function focusBlock(id, offset = 0, root = document) {
    runtime.lifecycle.frame(() => {
      const el = root?.querySelector?.(`.block-row[data-block-id="${id}"] .block-content`);
      if (!el) return;
      el.focus({ preventScroll: true });
      runtime.setCaretOffset(el, offset);
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    });
  }

  function getCaretOffset(el) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return 0;
    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(el);
    range.setEnd(sel.anchorNode, sel.anchorOffset);
    return range.toString().length;
  }

  function setCaretOffset(el, offset) {
    const range = document.createRange(),
      sel = window.getSelection();
    let remaining = offset,
      node = null,
      pos = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (remaining <= n.textContent.length) {
        node = n;
        pos = remaining;
        break;
      }
      remaining -= n.textContent.length;
    }
    if (!node) {
      node = el;
      pos = el.childNodes.length;
    }
    const placeholder = el.querySelector('[data-caret-placeholder]');
    if (placeholder && offset === el.textContent.length) range.setStartBefore(placeholder);
    else {
      const math = node.parentElement?.closest('[data-inline-math]');
      if (math) {
        if (pos === 0) range.setStartBefore(math);
        else range.setStartAfter(math);
      } else range.setStart(node, pos);
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function selectAllContent(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function renderCurrentBlocksKeepFocus() {
    runtime.renderBlocks(runtime.currentPage());
  }

  function hideFloatingMenus() {
    runtime.els.slashMenu.classList.add('hidden');
    runtime.hideEmojiMenu();
    runtime.els.blockMenu.classList.add('hidden');
    runtime.hideLinkHoverMenu();
    runtime.closeStandaloneLinkEditor();
    runtime.closeCodeModeToolbars();
    document
      .querySelectorAll('[data-page-menu-trigger][aria-expanded="true"]')
      .forEach((button) => button.setAttribute('aria-expanded', 'false'));
    runtime.els.pageMetaMenu?.classList.add('hidden');
    runtime.activeSlashBlockId = null;
    runtime.activePageLinkBlockId = null;
  }

  function cancelPageOperations() {
    runtime.pageOperationEpoch += 1;
    runtime.clearMultiBlockSelection();
    runtime.clearSelectedTable();
    runtime.clearSelectedImageBlock?.();
    runtime.hideFloatingMenus();
    runtime.hideTextFormatToolbar();
    runtime.clearExternalIconDropState();
    runtime.activeImageBlockId = null;
    runtime.activeImageLinkBlockId = null;
    runtime.activeImageCropBlockId = null;
    runtime.imageCropSession = null;
    if (runtime.els.imageFileInput) runtime.els.imageFileInput.value = '';
    if (runtime.els.pageIconFileInput) runtime.els.pageIconFileInput.value = '';
    if (runtime.els.pageComments) {
      runtime.els.pageComments.classList.add('hidden');
      runtime.els.pageComments.innerHTML = '';
    }
    runtime.els.commandPalette?.classList.add('hidden');
    runtime.els.shareModal?.classList.add('hidden');
    runtime.els.settingsModal?.classList.add('hidden');
    if (runtime.els.vaultDialog && !runtime.els.vaultDialog.classList.contains('hidden'))
      runtime.closeVaultDialog();
    if (runtime.els.newFolderDialog && !runtime.els.newFolderDialog.classList.contains('hidden')) {
      runtime.newFolderDialogSubmitting = false;
      runtime.closeNewFolderDialog();
    }
    runtime.clearDragState();
    const active = document.activeElement;
    if (active && active !== document.body && typeof active.blur === 'function') active.blur();
    try {
      window.getSelection()?.removeAllRanges();
    } catch {}
  }

  function toast(msg) {
    runtime.els.toast.textContent = msg;
    runtime.els.toast.classList.remove('hidden');
    runtime.lifecycle.clearTimeout(runtime.toast._t);
    runtime.toast._t = runtime.lifecycle.timeout(
      () => runtime.els.toast.classList.add('hidden'),
      1700,
    );
  }

  function dayPart() {
    const h = new Date().getHours();
    return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  }

  function countWords(page) {
    return runtime
      .flattenBlocks(page.blocks || [])
      .reduce(
        (n, b) =>
          n + `${b.text || ''} ${b.caption || ''}`.trim().split(/\s+/).filter(Boolean).length,
        0,
      );
  }

  function chevronSvg(direction = 'down', extraClass = '') {
    const cls = `ui-chevron${extraClass ? ' ' + extraClass : ''}`;
    return runtime.iconMarkup(
      direction === 'right' ? 'chevron-right' : 'chevron-down',
      '14px',
      cls,
    );
  }

  function escapeHtml(s = '') {
    return String(s).replace(
      /[&<>'"]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c],
    );
  }

  async function bootstrap() {
    runtime.hydrateStaticIcons();
    await runtime.init();
  }

  Object.assign(runtime, {
    inlineSelectionViewportRect,
    onInlineSelectionScroll,
    renderPage,
    renderBlocks,
    syncImageCropAspectChecks,
    refreshOtherDockPages,
    toggleBlockHTML,
    blockHTML,
    normalizeHyperlinkUrl,
    inlineLinkTargetKey,
    normalizeInlineLinkRanges,
    inlineLinksForBlock,
    normalizeLegacyLinkBlock,
    normalizeInlineFormatRanges,
    inlineFormatsForBlock,
    inlineFormatsFromContent,
    splitInlineFormatsAt,
    inlineFormatsAroundRange,
    subtractInlineFormatRange,
    selectionFullyFormatted,
    setInlineFormatRange,
    clearInlineFormattingRange,
    formatClassName,
    wrapInlineSegment,
    inlineTextHTML,
    inlineLinksFromContent,
    splitInlineLinksAt,
    inlineLinksAroundRange,
    replaceBlockRangeWithInlineLink,
    applyInlineLinkToSelection,
    normalizePastedLinkUrl,
    clipboardLinkPayload,
    pasteLinkIntoBlock,
    normalizeToggleBlock,
    normalizeBlockTree,
    flattenBlocks,
    pageBlockHTML,
    pageLinkBlockHTML,
    renderPageLinkPickerResults,
    renderPageLinkPickerSelection,
    showPageLinkPicker,
    setPageLinkTarget,
    isListBlock,
    listIndentLevel,
    setListIndentLevel,
    listSubtreeEnd,
    changeListIndent,
    numberForBlock,
    blockTypeLabel,
    textNodePointForOffset,
    selectTextOffsets,
    captureInlineSelection,
    inlineSelectionBlock,
    activeSelectionLink,
    closeTextFormatPopovers,
    activeLinkEditorRoot,
    positionLinkEditPanel,
    closeStandaloneLinkEditor,
    cancelStandaloneLinkEditor,
    positionTextFormatToolbar,
    updateTextFormatToolbarState,
    showTextFormatToolbar,
    hideTextFormatToolbar,
    onInlineSelectionPointerDown,
    onLinkEditOutsidePointerDown,
    onInlineSelectionPointerEnd,
    onInlineSelectionKeyDown,
    onInlineSelectionKeyUp,
    onInlineSelectionInteractionBlur,
    scheduleTextFormatToolbarFromSelection,
    restoreInlineSelection,
    commitInlineFormatting,
    applyInlineToolbarFormat,
    applyInlineToolbarChoice,
    transformInlineSelectionBlock,
    selectionLinkTarget,
    selectionLinkUrl,
    renderInlineLinkResults,
    openInlineLinkPopover,
    applyInlineSelectionLink,
    applyInlineSelectionPageLink,
    removeInlineSelectionLink,
    clearInlineSelectionFormatting,
    newTextBlock,
    findBlockLocation,
    removeBlockOccurrences,
    findBlock,
    isTextLikeBlock,
    ensureBlockList,
    addBlockAfter,
    addBlockOnBlankPageEndClick,
    hasBlankTrailingLine,
    addToggleChild,
    cloneBlockWithNewIds,
    blockContainsId,
    blockTextFallback,
    chooseImageFile,
    openImageUrlEditor,
    commitImageUrl,
    normalizeImageUrl,
    normalizeVaultAssetPath,
    pasteMarkdownIntoBlock,
    pasteRichHtmlIntoBlock,
    onBeforeInput,
    pageForTitleEditor,
    onFocusOut,
    onPaste,
    clipboardSvgImageFile,
    focusBlock,
    getCaretOffset,
    setCaretOffset,
    selectAllContent,
    renderCurrentBlocksKeepFocus,
    hideFloatingMenus,
    cancelPageOperations,
    toast,
    dayPart,
    countWords,
    chevronSvg,
    escapeHtml,
    bootstrap,
  });
}

// @ts-nocheck
import { APP_FRONTMATTER_PATTERN, APP_FRONTMATTER_VALUE_PATTERN } from './../../../app-identity';
// Existing editor algorithms, isolated behind the typed controller boundary.
import type { EditorRuntime } from '@/features/editor/types';
import {
  markdownBlockShortcut,
  markdownInlineShortcut,
  markdownShortcutOffset,
} from './typing-shortcuts';

export function registerMarkdown(runtime: EditorRuntime) {
  function markdownTypingContext(content) {
    if (!content) return null;
    const row = content?.closest('.block-row');
    const location = runtime.findBlockLocation(row?.dataset.blockId);
    const selection = window.getSelection();
    if (
      runtime.workspaceAccess !== 'writable' ||
      !location ||
      !selection?.rangeCount ||
      !selection.isCollapsed ||
      !content.contains(selection.anchorNode)
    )
      return null;
    return {
      ...location,
      caret: runtime.getCaretOffset(content),
      root: content.closest('.block-editor'),
    };
  }

  function rememberMarkdownSource(block, text) {
    block.text = text;
    runtime.recordHistory('merge');
    runtime.flushHistoryPending();
  }

  function finishMarkdownTyping(block, root, caret, target = 'text') {
    runtime.hideFloatingMenus();
    runtime.scheduleSave();
    runtime.renderBlocks(runtime.currentPage());
    if (target === 'text') runtime.focusBlock(block.id, caret, root);
    else
      runtime.lifecycle.frame(() => {
        const row = root?.querySelector(`.block-row[data-block-id="${block.id}"]`);
        const editor = row?.querySelector(
          target === 'code' ? '[data-code-editor]' : '[data-table-cell="1:0"]',
        );
        editor?.focus({ preventScroll: true });
        if (target === 'code' && editor) editor.selectionStart = editor.selectionEnd = caret;
      });
  }

  function applyMarkdownBlockShortcut(content, trigger = 'input') {
    const context = markdownTypingContext(content);
    if (!context) return false;
    const { block, blocks, index, caret, root } = context;
    const text = content.innerText.replace(/\n$/, '');
    // Let the browser insert a space inside existing text before inspecting its prefix.
    if (trigger !== 'input' && caret !== text.length) return false;
    const source = trigger === 'space' ? text + ' ' : text;
    const shortcut = markdownBlockShortcut(text, block.type, trigger);
    if (shortcut) {
      if (caret !== text.length && caret !== shortcut.prefixLength) return false;
      rememberMarkdownSource(block, source);
      const remaining = source.slice(shortcut.prefixLength);
      const prefix = shortcut.prefixText || '';
      const links = runtime.splitInlineLinksAt(block, shortcut.prefixLength).right;
      const formats = runtime.splitInlineFormatsAt(block, shortcut.prefixLength).right;
      block.type = shortcut.type;
      block.text = prefix + remaining;
      block.inlineLinks = runtime.normalizeInlineLinkRanges(
        links.map((link) => ({
          ...link,
          start: link.start + prefix.length,
          end: link.end + prefix.length,
        })),
        block.text.length,
      );
      block.inlineFormats = runtime.normalizeInlineFormatRanges(
        formats.map((format) => ({
          ...format,
          start: format.start + prefix.length,
          end: format.end + prefix.length,
        })),
        block.text.length,
      );
      if (!block.inlineLinks.length) delete block.inlineLinks;
      if (!block.inlineFormats.length) delete block.inlineFormats;
      delete block.wikiLinks;
      if (shortcut.type === 'todo') block.checked = shortcut.checked;
      if (runtime.isListBlock(block))
        runtime.setListIndentLevel(block, shortcut.indent ?? runtime.listIndentLevel(block));
      else delete block.indent;
      if (shortcut.type === 'code') {
        block.language = runtime.normalizeMarkdownCodeLanguage(shortcut.language);
        block.codeWrap = false;
        block.codeLineNumbers = false;
        block.mermaidPreview = block.language === 'mermaid';
        finishMarkdownTyping(block, root, 0, 'code');
      } else if (shortcut.type === 'divider') {
        delete block.text;
        const next = runtime.newTextBlock();
        blocks.splice(index + 1, 0, next);
        finishMarkdownTyping(next, root, 0);
      } else
        finishMarkdownTyping(
          block,
          root,
          prefix.length +
            Math.max(0, caret + (trigger === 'space' ? 1 : 0) - shortcut.prefixLength),
        );
      return true;
    }
    if (trigger !== 'enter' || block.type !== 'text') return false;
    const previous = blocks[index - 1];
    if (
      previous?.type === 'text' &&
      previous.text?.includes('|') &&
      runtime.isMarkdownTableSeparator(text)
    ) {
      const table = runtime.parseMarkdownBlocks(previous.text + '\n' + text)[0];
      if (table?.type !== 'table') return false;
      rememberMarkdownSource(block, text);
      table.id = previous.id;
      table.tableRows.push(Array(table.tableRows[0].length).fill(''));
      blocks.splice(index - 1, 2, table);
      finishMarkdownTyping(table, root, 0, 'table');
      return true;
    }
    if (!/^\s*(?:!\[|\[\[)/.test(text)) return false;
    const parsed = runtime.parseMarkdownBlocks(text, { preserveInline: true });
    if (parsed.length !== 1 || !['image', 'page-link'].includes(parsed[0].type)) return false;
    const replacement = parsed[0];
    if (replacement.type === 'page-link') {
      const target = runtime.pageByTitle(replacement.wikiTarget.split('#')[0]);
      if (!target) return false;
      replacement.pageId = target.id;
      delete replacement.wikiTarget;
    }
    rememberMarkdownSource(block, text);
    replacement.id = block.id;
    const next = runtime.newTextBlock();
    blocks.splice(index, 1, replacement, next);
    finishMarkdownTyping(next, root, 0);
    return true;
  }

  function applyMarkdownInlineShortcut(content) {
    const context = markdownTypingContext(content);
    if (!context || !runtime.isTextLikeBlock(context.block)) return false;
    const { block, caret, root } = context;
    const shortcut = markdownInlineShortcut(block.text || '', caret);
    if (!shortcut) return false;
    const codeBefore =
      String(block.text)
        .slice(0, shortcut.start)
        .match(/(?<!\\)`/g) || [];
    if (codeBefore.length % 2 === 1) return false;
    const formats = runtime.inlineFormatsForBlock(block);
    if (
      formats.some(
        (format) =>
          format.type === 'code' && format.start < shortcut.end && format.end > shortcut.start,
      )
    )
      return false;
    const url =
      shortcut.url &&
      (runtime.normalizePastedLinkUrl(shortcut.url) || runtime.normalizeHyperlinkUrl(shortcut.url));
    if (shortcut.url && !url) return false;
    const links = runtime.inlineLinksForBlock(block);
    rememberMarkdownSource(block, block.text);
    const remap = (range) => ({
      ...range,
      start: markdownShortcutOffset(range.start, shortcut),
      end: markdownShortcutOffset(range.end, shortcut),
    });
    block.text =
      block.text.slice(0, shortcut.start) + shortcut.text + block.text.slice(shortcut.end);
    const end = shortcut.start + shortcut.text.length;
    block.inlineLinks = runtime.normalizeInlineLinkRanges(
      [...links.map(remap), ...(url ? [{ start: shortcut.start, end, url }] : [])],
      block.text.length,
    );
    block.inlineFormats = runtime.normalizeInlineFormatRanges(
      [
        ...formats.map(remap),
        ...shortcut.formats.map((type) => ({
          start: shortcut.start,
          end,
          type,
          ...(type === 'background' ? { value: 'yellow' } : {}),
        })),
      ],
      block.text.length,
    );
    if (!block.inlineLinks.length) delete block.inlineLinks;
    if (!block.inlineFormats.length) delete block.inlineFormats;
    finishMarkdownTyping(block, root, end);
    return true;
  }

  function normalizeMarkdownImageSource(value) {
    const raw = String(value || '').trim();
    if (/^data:image\//i.test(raw) || /^https?:\/\//i.test(raw) || /^\/\//.test(raw))
      return runtime.normalizeImageUrl(raw);
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return '';
    return runtime.normalizeAttachmentPath(raw);
  }

  function normalizeObsidianAttachmentReference(value) {
    const target = String(value || '')
      .split('|')[0]
      .trim();
    const path = runtime.normalizeAttachmentPath(target);
    if (!path) return '';
    return path.includes('/')
      ? path
      : `${runtime.STORAGE_CONFIG.indexeddb.attachmentsDirectory}/${path}`;
  }

  function normalizeAttachmentPath(value) {
    const path = runtime.normalizeVaultAssetPath(value);
    if (!path) return '';
    const legacyPrefix = 'attachments/';
    return path.toLocaleLowerCase().startsWith(legacyPrefix)
      ? `${runtime.STORAGE_CONFIG.indexeddb.attachmentsDirectory}/${path.slice(legacyPrefix.length)}`
      : path;
  }

  function isVaultAssetPath(value) {
    return !!runtime.normalizeVaultAssetPath(value);
  }

  function markdownAssetPath(path) {
    return runtime.normalizeVaultAssetPath(path).split('/').map(encodeURIComponent).join('/');
  }

  async function saveImageBlobAttachment(blob, filename = 'image') {
    if (!blob?.type?.startsWith('image/')) throw new Error('That resource is not an image.');
    const extensions = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'image/avif': 'avif',
      'image/bmp': 'bmp',
      'image/x-icon': 'ico',
    };
    const original = runtime.safeFileSegment(filename || 'image');
    const suppliedExtension = original.match(/\.([a-z0-9]{1,8})$/i)?.[1];
    const ext = suppliedExtension || extensions[blob.type.split(';')[0]] || 'img';
    const base =
      original
        .replace(/\.[^.]+$/, '')
        .replace(/[|#[\]]/g, '-')
        .slice(0, 100) || 'image';
    const path = `${runtime.STORAGE_CONFIG.indexeddb.attachmentsDirectory}/${runtime.uid('asset')}-${base}.${ext}`;
    const savedPath = await runtime.localStorageGateway.writeAttachment(path, blob);
    runtime.attachmentListLoaded = false;
    if (runtime.state.mainView === 'attachments') void runtime.refreshAttachmentList();
    return savedPath;
  }

  function imageAltFromUrl(url) {
    const path = runtime.normalizeVaultAssetPath(url);
    if (path) {
      const name = path.split('/').at(-1) || 'Image';
      return name.replace(/\.[a-z0-9]+$/i, '') || 'Image';
    }
    try {
      const name = new URL(url).pathname.split('/').filter(Boolean).pop() || 'Image';
      return decodeURIComponent(name).replace(/\.[a-z0-9]+$/i, '') || 'Image';
    } catch {
      return 'Image';
    }
  }

  async function loadImageFileIntoBlock(file, id) {
    if (!file?.type?.startsWith('image/')) {
      runtime.toast('That file is not an image.');
      return;
    }
    if (!runtime.localStorageGateway.hasDirectory?.() && file.size > 2.5 * 1024 * 1024) {
      runtime.toast('Use an image smaller than 2.5 MB without a notes folder.');
      return;
    }
    const operationEpoch = runtime.pageOperationEpoch,
      pageId = runtime.state.currentPageId;
    try {
      const savedPath = await runtime.saveImageBlobAttachment(file, file.name || 'image');
      if (operationEpoch !== runtime.pageOperationEpoch || runtime.state.currentPageId !== pageId)
        return;
      const b = runtime.findBlock(id);
      if (!b) return;
      b.type = 'image';
      b.src = savedPath;
      b.alt = file.name.replace(/\.[^.]+$/, '');
      b.caption = b.caption || '';
      delete b.text;
      runtime.scheduleSave();
      runtime.renderBlocks(runtime.currentPage());
    } catch (error) {
      console.error('Could not save image attachment.', error);
      runtime.toast(error?.message || 'Could not save that image.');
    }
  }

  function normalizeMarkdownCodeLanguage(value) {
    const raw = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/^\{\.?|\}$/g, '');
    const aliases = {
      js: 'javascript',
      jsx: 'javascript',
      node: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      sh: 'bash',
      shell: 'bash',
      zsh: 'bash',
      powershell: 'bash',
      ps1: 'bash',
      py: 'python',
      cs: 'csharp',
      'c#': 'csharp',
      dotnet: 'csharp',
      c: 'cpp',
      'c++': 'cpp',
      cc: 'cpp',
      h: 'cpp',
      hpp: 'cpp',
      rs: 'rust',
      golang: 'go',
      html5: 'html',
      htm: 'html',
      yml: 'yaml',
      md: 'markdown',
      mdown: 'markdown',
      mmd: 'mermaid',
      txt: 'plain',
      text: 'plain',
      plaintext: 'plain',
    };
    const language = aliases[raw] || raw || 'plain';
    return runtime.CODE_LANGUAGES.some(([id]) => id === language) ? language : 'plain';
  }

  function markdownInlineText(value) {
    let text = String(value || '');
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) =>
      alt ? `${alt} (${url})` : url,
    );
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => `${label} (${url})`);
    text = text.replace(/<((?:https?:\/\/|mailto:)[^>]+)>/gi, '$1');
    text = text.replace(/(`{1,2})(.*?)\1/g, '$2');
    text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
    text = text.replace(/~~(.*?)~~/g, '$1');
    text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2');
    text = text.replace(/(^|[^_])_([^_\n]+)_/g, '$1$2');
    text = text.replace(/\\([\\`*_[\]{}()#+\-.!>])/g, '$1');
    return text.trim();
  }

  function markdownTableCellText(value) {
    return runtime.markdownTableCellPayload(value).text;
  }

  function splitMarkdownTableRowRaw(line) {
    let source = String(line || '').trim();
    if (source.startsWith('|')) source = source.slice(1);
    if (source.endsWith('|') && !source.endsWith('\\|')) source = source.slice(0, -1);
    const cells = [];
    let current = '';
    let escaped = false;
    let inWikiLink = false;
    for (let index = 0; index < source.length; index++) {
      if (!inWikiLink && source.startsWith('[[', index)) {
        current += '[[';
        index++;
        inWikiLink = true;
        continue;
      }
      if (inWikiLink && source.startsWith(']]', index)) {
        current += ']]';
        index++;
        inWikiLink = false;
        continue;
      }
      const ch = source[index];
      if (escaped) {
        current += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        current += ch;
        continue;
      }
      if (ch === '|' && !inWikiLink) {
        cells.push(current);
        current = '';
        continue;
      }
      current += ch;
    }
    cells.push(current);
    return cells;
  }

  function splitMarkdownTableRow(line) {
    return runtime.splitMarkdownTableRowRaw(line).map(markdownTableCellText);
  }

  function markdownTableCellPayload(value) {
    const payload = runtime.parseMarkdownInlinePayload(String(value ?? '').trim(), {
      tableCell: true,
    });
    return {
      text: payload.text,
      inlineFormats: payload.formats,
      inlineLinks: payload.links,
      wikiLinks: payload.wikiLinks,
    };
  }

  function isMarkdownTableSeparator(line) {
    const cells = runtime.splitMarkdownTableRow(line);
    return (
      (cells.length > 1 || String(line || '').includes('|')) &&
      cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')))
    );
  }

  function looksLikeMarkdown(text) {
    const source = String(text || '').replace(/\r\n?/g, '\n');
    if (!source.trim()) return false;
    return (
      /(^|\n)\s{0,3}(#{1,6})\s+\S/.test(source) ||
      /(^|\n)\s{0,3}(```|~~~)/.test(source) ||
      /(^|\n)\s{0,3}[-+*]\s+(?:\[[ xX]\]\s+)?\S/.test(source) ||
      /(^|\n)\s{0,3}\d+[.)]\s+\S/.test(source) ||
      /(^|\n)\s{0,3}>\s?\S/.test(source) ||
      /(^|\n)\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*(?:\n|$)/.test(source) ||
      /!\[[^\]]*\]\([^)]+\)/.test(source) ||
      /^\s*\[[^\]]+\]\([^)]+\)\s*$/m.test(source) ||
      /(^|\n)\s*\|?.+\|.+\n\s*\|?\s*:?-{3,}:?\s*\|/.test(source)
    );
  }

  function richHtmlInlinePayload(root, { skipNestedLists = false, tableCell = false } = {}) {
    let value = '';
    const links = [],
      formats = [];
    const appendRaw = (raw, preserveWhitespace = false) => {
      let part = String(raw || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\r\n?/g, '\n');
      if (!preserveWhitespace) part = part.replace(/[\t\n ]+/g, ' ');
      if (!part) return;
      if (!preserveWhitespace && value && /\s$/.test(value) && /^\s/.test(part))
        part = part.replace(/^\s+/, '');
      value += part;
    };
    const inlineFormatForElement = (el) => {
      const tag = el.tagName;
      if (el.dataset.inlineFormat === 'color' || el.dataset.inlineFormat === 'background')
        return { type: el.dataset.inlineFormat, value: el.dataset.inlineValue || '' };
      const className = typeof el.className === 'string' ? el.className : '';
      const cellColor = className.match(/\binline-color-([a-z0-9-]+)/i);
      const cellBackground = className.match(/\binline-bg-([a-z0-9-]+)/i);
      if (cellColor) return { type: 'color', value: cellColor[1] };
      if (cellBackground) return { type: 'background', value: cellBackground[1] };
      if (tag === 'STRONG' || tag === 'B') return { type: 'bold' };
      if (tag === 'EM' || tag === 'I') return { type: 'italic' };
      if (tag === 'U') return { type: 'underline' };
      if (tag === 'S' || tag === 'DEL' || tag === 'STRIKE') return { type: 'strike' };
      if (tag === 'CODE' && el.parentElement?.tagName !== 'PRE') return { type: 'code' };
      return null;
    };
    const walk = (node, preserveWhitespace = false) => {
      if (node.nodeType === Node.TEXT_NODE) {
        appendRaw(node.nodeValue, preserveWhitespace);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node,
        tag = el.tagName;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(tag)) return;
      if (skipNestedLists && (tag === 'UL' || tag === 'OL')) return;
      const blockBoundary = tableCell && /^(P|DIV|LI|H[1-6]|PRE|BLOCKQUOTE)$/.test(tag);
      if (blockBoundary && /^ +$/.test(value)) value = '';
      if (blockBoundary && value && !value.endsWith('\n')) value += '\n';
      const whitespace = el.style.whiteSpace;
      const keepWhitespace =
        tableCell &&
        (whitespace
          ? /^(pre|pre-wrap|pre-line|break-spaces)$/.test(whitespace)
          : preserveWhitespace);
      if (tag === 'BR') {
        value += '\n';
        return;
      }
      if (tag === 'IMG') {
        const alt = String(el.getAttribute('alt') || '').trim();
        if (alt) appendRaw(alt);
        return;
      }
      const format = inlineFormatForElement(el),
        formatStart = value.length;
      if (tag === 'A') {
        const start = value.length;
        for (const child of el.childNodes) walk(child, keepWhitespace);
        const end = value.length;
        const url =
          runtime.normalizePastedLinkUrl(el.getAttribute('href') || '') ||
          runtime.normalizeHyperlinkUrl(el.getAttribute('href') || '');
        if (url && end > start) links.push({ start, end, url });
      } else {
        for (const child of el.childNodes) walk(child, keepWhitespace);
      }
      if (format && value.length > formatStart)
        formats.push({ start: formatStart, end: value.length, ...format });
      let next = el.nextSibling;
      while (next?.nodeType === Node.TEXT_NODE && !next.nodeValue.trim()) next = next.nextSibling;
      if (blockBoundary && next && !value.endsWith('\n')) value += '\n';
    };
    walk(root);
    const clean = tableCell ? value.replace(/^ +| +$/g, '') : value.trim();
    const leading = tableCell
      ? value.length - value.replace(/^ +/, '').length
      : value.length - value.trimStart().length;
    const normalizedLinks = runtime.normalizeInlineLinkRanges(
      links.map((link) => ({
        start: Math.max(0, link.start - leading),
        end: Math.max(0, link.end - leading),
        url: link.url,
      })),
      clean.length,
    );
    const normalizedFormats = runtime.normalizeInlineFormatRanges(
      formats.map((format) => ({
        ...format,
        start: Math.max(0, format.start - leading),
        end: Math.max(0, format.end - leading),
      })),
      clean.length,
    );
    return { text: clean, links: normalizedLinks, formats: normalizedFormats };
  }

  function richHtmlBlockFromElement(el, type, extra = {}) {
    const payload = runtime.richHtmlInlinePayload(el);
    if (!payload.text && type !== 'text') return null;
    const block = { id: runtime.uid('b'), type, text: payload.text, ...extra };
    if (payload.links.length) block.inlineLinks = payload.links;
    if (payload.formats?.length) block.inlineFormats = payload.formats;
    return block;
  }

  function parseRichHtmlBlocks(html) {
    const source = String(html || '');
    if (!source.trim()) return [];
    let doc;
    try {
      doc = new DOMParser().parseFromString(source, 'text/html');
    } catch {
      return [];
    }
    for (const svg of doc.body.querySelectorAll('svg')) {
      if (svg.closest('pre,code')) continue;
      if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const image = doc.createElement('img');
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
      image.alt = svg.getAttribute('aria-label') || svg.querySelector('title')?.textContent || '';
      image.dataset.pastedSvg = 'true';
      svg.replaceWith(image);
    }
    const blocks = [];
    const pushBlock = (block) => {
      if (block) blocks.push(block);
    };

    const processList = (list, indent = 0) => {
      const type = list.tagName === 'OL' ? 'number' : 'bullet';
      for (const li of Array.from(list.children).filter((child) => child.tagName === 'LI')) {
        const payload = runtime.richHtmlInlinePayload(li, { skipNestedLists: true });
        const checkbox = li.querySelector(
          ':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]',
        );
        const block = { id: runtime.uid('b'), type: checkbox ? 'todo' : type, text: payload.text };
        if (indent) block.indent = Math.min(8, indent);
        if (checkbox) block.checked = checkbox.checked || checkbox.hasAttribute('checked');
        if (payload.links.length) block.inlineLinks = payload.links;
        if (payload.formats?.length) block.inlineFormats = payload.formats;
        if (block.text || checkbox) blocks.push(block);
        for (const nested of Array.from(li.children).filter(
          (child) => child.tagName === 'UL' || child.tagName === 'OL',
        ))
          processList(nested, indent + 1);
      }
    };

    const processTable = (table) => {
      const rowEls = [...table.querySelectorAll('tr')];
      if (!rowEls.length) return;
      const rows = rowEls.map((row) =>
        [...row.children]
          .filter((cell) => cell.tagName === 'TH' || cell.tagName === 'TD')
          .map((cell) => ({
            ...runtime.richHtmlInlinePayload(cell, { tableCell: true }),
            alignment: cell.style.textAlign,
          })),
      );
      const width = Math.max(1, ...rows.map((row) => row.length));
      const alignments = [...rowEls[0].children]
        .filter((cell) => cell.tagName === 'TH' || cell.tagName === 'TD')
        .map((cell) => cell.style.textAlign || cell.getAttribute('align'));
      const normalized = rows.map((row) => {
        const next = row.slice(0, width);
        while (next.length < width) next.push({ text: '', links: [], formats: [] });
        return next;
      });
      blocks.push({
        id: runtime.uid('b'),
        type: 'table',
        tableRows: normalized.map((row) => row.map((cell) => cell.text)),
        tableCellInline: normalized.map((row) =>
          row.map((cell) => {
            const inline = {};
            if (cell.formats?.length) inline.inlineFormats = cell.formats;
            if (cell.links?.length) inline.inlineLinks = cell.links;
            return Object.keys(inline).length ? inline : null;
          }),
        ),
        tableColumnAlignments: Array.from({ length: width }, (_, col) =>
          ['center', 'right'].includes(alignments[col]) ? alignments[col] : 'left',
        ),
        tableHeaderRow: !!table.querySelector('th'),
        tableHeaderColumn: false,
      });
    };

    const processContainer = (container) => {
      for (const node of container.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const value = String(node.nodeValue || '').trim();
          if (value) blocks.push({ id: runtime.uid('b'), type: 'text', text: value });
          continue;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node,
          tag = el.tagName;
        if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(tag)) continue;
        if (
          el.querySelector('img[data-pasted-svg]') &&
          !el.querySelector('h1,h2,h3,h4,h5,h6,p,ul,ol,blockquote,pre,table,hr') &&
          !['PRE', 'CODE', 'UL', 'OL', 'TABLE'].includes(tag)
        ) {
          const range = doc.createRange();
          range.setStart(el, 0);
          const pushTextFragment = () => {
            const fragment = el.cloneNode(false);
            fragment.appendChild(range.cloneContents());
            const textBlock = runtime.richHtmlBlockFromElement(
              fragment,
              /^H[1-6]$/.test(tag) ? `h${Math.min(3, Number(tag.slice(1)))}` : 'text',
            );
            if (textBlock?.text) pushBlock(textBlock);
          };
          for (const image of el.querySelectorAll('img[data-pasted-svg]')) {
            range.setEndBefore(image);
            pushTextFragment();
            blocks.push({
              id: runtime.uid('b'),
              type: 'image',
              src: image.src,
              caption: '',
              alt: image.alt,
            });
            range.setStartAfter(image);
          }
          range.setEnd(el, el.childNodes.length);
          pushTextFragment();
          continue;
        }
        if (/^H[1-6]$/.test(tag)) {
          pushBlock(runtime.richHtmlBlockFromElement(el, `h${Math.min(3, Number(tag.slice(1)))}`));
          continue;
        }
        if (tag === 'P') {
          pushBlock(runtime.richHtmlBlockFromElement(el, 'text'));
          continue;
        }
        if (tag === 'UL' || tag === 'OL') {
          processList(el, 0);
          continue;
        }
        if (tag === 'BLOCKQUOTE') {
          const inner = [...el.children].filter((child) => ['P', 'DIV'].includes(child.tagName));
          if (inner.length) {
            for (const child of inner) pushBlock(runtime.richHtmlBlockFromElement(child, 'quote'));
          } else pushBlock(runtime.richHtmlBlockFromElement(el, 'quote'));
          continue;
        }
        if (tag === 'PRE') {
          const code = el.querySelector('code') || el;
          const className = String(code.className || '');
          const langMatch = className.match(/(?:language|lang)-([a-z0-9_+#.-]+)/i);
          const language = runtime.normalizeMarkdownCodeLanguage(langMatch?.[1] || 'plain');
          blocks.push({
            id: runtime.uid('b'),
            type: 'code',
            text: String(code.textContent || '').replace(/\n$/, ''),
            language,
            codeWrap: false,
            codeLineNumbers: false,
            mermaidPreview: language === 'mermaid',
          });
          continue;
        }
        if (tag === 'TABLE') {
          processTable(el);
          continue;
        }
        if (tag === 'HR') {
          blocks.push({ id: runtime.uid('b'), type: 'divider' });
          continue;
        }
        if (tag === 'IMG') {
          const src = runtime.normalizeMarkdownImageSource(el.getAttribute('src') || '');
          if (src)
            blocks.push({
              id: runtime.uid('b'),
              type: 'image',
              src,
              caption: '',
              alt: String(el.getAttribute('alt') || ''),
            });
          continue;
        }
        const structural = el.querySelector(
          'h1,h2,h3,h4,h5,h6,p,ul,ol,blockquote,pre,table,hr,img',
        );
        if (structural) {
          processContainer(el);
          continue;
        }
        pushBlock(runtime.richHtmlBlockFromElement(el, 'text'));
      }
    };

    processContainer(doc.body);
    return blocks;
  }

  function richHtmlShouldCreateBlocks(html, blocks) {
    if (!html || !blocks?.length) return false;
    let doc;
    try {
      doc = new DOMParser().parseFromString(html, 'text/html');
    } catch {
      return false;
    }
    if (doc.body.querySelector('h1,h2,h3,h4,h5,h6,ul,ol,blockquote,pre,table,hr,svg,img'))
      return true;
    return doc.body.querySelectorAll('p').length > 1 || blocks.length > 1;
  }

  function parseMarkdownBlocks(
    markdown,
    { preserveInline = false, preserveBlankLines = false } = {},
  ) {
    const lines = String(markdown || '')
      .replace(/\r\n?/g, '\n')
      .split('\n');
    const blocks = [];
    const pushText = (type, text, extra = {}) => {
      const payload = preserveInline ? runtime.parseMarkdownInlinePayload(text) : null;
      const cleaned = payload?.text ?? runtime.markdownInlineText(text);
      if (!cleaned && type !== 'text' && type !== 'todo') return;
      const block = { id: runtime.uid('b'), type, text: cleaned, ...extra };
      if (payload?.links.length) block.inlineLinks = payload.links;
      if (payload?.formats.length) block.inlineFormats = payload.formats;
      if (payload?.wikiLinks.length) block.wikiLinks = payload.wikiLinks;
      blocks.push(block);
    };
    let i = 0;
    const indentationWidth = (prefix) =>
      [...prefix].reduce((width, char) => (char === '\t' ? width + 4 - (width % 4) : width + 1), 0);
    const listMarker = /^[ \t]*(?:[-+*]|\d+[.)])(?:[ \t]+|$)/;
    const readListText = (firstLine, requiredIndent) => {
      const text = [firstLine];
      const removeIndent = (line) => {
        const prefix = line.match(/^[ \t]*/)[0];
        let width = 0,
          chars = 0;
        while (chars < prefix.length && width < requiredIndent) {
          width += prefix[chars] === '\t' ? 4 - (width % 4) : 1;
          chars++;
        }
        return line.slice(chars);
      };
      i++;
      while (i < lines.length) {
        if (!lines[i].trim() && indentationWidth(lines[i]) >= requiredIndent) {
          text.push(removeIndent(lines[i++]));
          continue;
        }
        let next = i;
        while (next < lines.length && !lines[next].trim()) next++;
        if (next >= lines.length || listMarker.test(lines[next])) break;
        const prefix = lines[next].match(/^[ \t]*/)[0];
        if (indentationWidth(prefix) < requiredIndent) break;
        while (i < next) {
          text.push('');
          i++;
        }
        text.push(removeIndent(lines[i++]));
      }
      return text.join('\n');
    };
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) {
        if (preserveBlankLines) pushText('text', '');
        i++;
        continue;
      }

      const fence = line.match(/^\s{0,3}(```|~~~)\s*([^\s`]*)\s*$/);
      if (fence) {
        const marker = fence[1],
          language = runtime.normalizeMarkdownCodeLanguage(fence[2]);
        const body = [];
        i++;
        while (i < lines.length && !new RegExp(`^\\s{0,3}${marker[0]}{3,}\\s*$`).test(lines[i]))
          body.push(lines[i++]);
        if (i < lines.length) i++;
        blocks.push({
          id: runtime.uid('b'),
          type: 'code',
          text: body.join('\n'),
          language,
          codeWrap: false,
          codeLineNumbers: false,
          mermaidPreview: language === 'mermaid',
        });
        continue;
      }

      if (
        i + 1 < lines.length &&
        line.includes('|') &&
        runtime.isMarkdownTableSeparator(lines[i + 1])
      ) {
        const rawRows = [runtime.splitMarkdownTableRowRaw(line)];
        const alignments = runtime.splitMarkdownTableRow(lines[i + 1]).map((cell) => {
          const marker = cell.trim();
          return marker.endsWith(':') ? (marker.startsWith(':') ? 'center' : 'right') : 'left';
        });
        i += 2;
        while (i < lines.length && lines[i].trim() && lines[i].includes('|'))
          rawRows.push(runtime.splitMarkdownTableRowRaw(lines[i++]));
        const columns = Math.max(1, ...rawRows.map((row) => row.length));
        const normalized = rawRows.map((row) => {
          const cells = row.slice();
          while (cells.length < columns) cells.push('');
          return cells.slice(0, columns).map(runtime.markdownTableCellPayload);
        });
        blocks.push({
          id: runtime.uid('b'),
          type: 'table',
          tableRows: normalized.map((row) => row.map((cell) => cell.text)),
          tableCellInline: normalized.map((row) =>
            row.map((cell) => {
              const inline = {};
              if (cell.inlineFormats.length) inline.inlineFormats = cell.inlineFormats;
              if (cell.inlineLinks.length) inline.inlineLinks = cell.inlineLinks;
              if (cell.wikiLinks.length) inline.wikiLinks = cell.wikiLinks;
              return Object.keys(inline).length ? inline : null;
            }),
          ),
          tableColumnAlignments: Array.from(
            { length: columns },
            (_, col) => alignments[col] || 'left',
          ),
          tableHeaderRow: true,
          tableHeaderColumn: false,
        });
        continue;
      }

      if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        blocks.push({ id: runtime.uid('b'), type: 'divider' });
        i++;
        continue;
      }

      const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        const level = Math.min(3, heading[1].length);
        pushText(`h${level}`, heading[2]);
        i++;
        continue;
      }

      const todo = line.match(/^\s*[-+*][ \t]+\[([ xX])\](?:[ \t]+(.*))?[ \t]*$/);
      if (todo) {
        pushText('todo', todo[2] || '', { checked: todo[1].toLowerCase() === 'x' });
        i++;
        continue;
      }

      const bullet = line.match(/^(\s*)[-+*](?:[ \t]+(.*))?[ \t]*$/);
      if (bullet) {
        const indent = Math.min(8, Math.floor(bullet[1].replace(/\t/g, '  ').length / 2));
        const text = readListText(bullet[2] || '', indentationWidth(bullet[1]) + 2);
        pushText('bullet', text, indent ? { indent } : {});
        continue;
      }

      const number = line.match(/^(\s*)\d+[.)](?:[ \t]+(.*))?[ \t]*$/);
      if (number) {
        const indent = Math.min(8, Math.floor(number[1].replace(/\t/g, '  ').length / 2));
        const markerWidth = line.slice(number[1].length).match(/^\d+[.)]/)[0].length;
        const text = readListText(number[2] || '', indentationWidth(number[1]) + markerWidth + 1);
        pushText('number', text, indent ? { indent } : {});
        continue;
      }

      if (/^\s*>/.test(line)) {
        const quoteLines = [];
        while (i < lines.length) {
          const quoteLine = lines[i];
          if (/^\s*>/.test(quoteLine)) {
            quoteLines.push(quoteLine.replace(/^\s*>\s?/, ''));
            i++;
            continue;
          }
          if (!quoteLine.trim()) {
            let nextQuoteLine = i;
            while (nextQuoteLine < lines.length && !lines[nextQuoteLine].trim()) nextQuoteLine++;
            if (nextQuoteLine < lines.length && /^\s*>/.test(lines[nextQuoteLine])) {
              quoteLines.push(...Array(nextQuoteLine - i).fill(''));
              i = nextQuoteLine;
              continue;
            }
            break;
          }
          // Unprefixed lines belong to the next editor block, even without a blank separator.
          break;
        }
        const first = quoteLines[0]?.match(/^\[!([A-Za-z]+)\]\s*(.*)$/);
        if (first) {
          const body = [first[2], ...quoteLines.slice(1)].join('\n').trim();
          pushText(
            'callout',
            `${first[1][0].toUpperCase() + first[1].slice(1).toLowerCase()}: ${body}`,
          );
        } else pushText('quote', quoteLines.join('\n'));
        continue;
      }

      const image = line.match(
        /^\s*!\[((?:\\.|[^\]])*)\]\(((?:\\.|[^)\s])+)(?:\s+(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'))?\)\s*$/,
      );
      if (image) {
        const src = runtime.normalizeMarkdownImageSource(image[2].replace(/\\([\\()])/g, '$1'));
        if (src) {
          blocks.push({
            id: runtime.uid('b'),
            type: 'image',
            src,
            caption: String(image[3] ?? image[4] ?? '')
              .replace(/\\([\\"'])/g, '$1')
              .replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (entity, value) => {
                const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
                if (value[0] !== '#') return named[value.toLowerCase()] || entity;
                const code =
                  value[1].toLowerCase() === 'x'
                    ? parseInt(value.slice(2), 16)
                    : Number(value.slice(1));
                return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
              }),
            alt: runtime.markdownInlineText(image[1]),
          });
          i++;
          continue;
        }
      }

      const obsidianImage = trimmed.match(/^!\[\[([^\]]+)\]\]$/);
      if (obsidianImage) {
        const [target, alt = ''] = obsidianImage[1].split('|');
        const src = runtime.normalizeObsidianAttachmentReference(target);
        if (src) {
          blocks.push({ id: runtime.uid('b'), type: 'image', src, caption: '', alt: alt.trim() });
          i++;
          continue;
        }
      }

      const standaloneWikiLink = preserveInline ? trimmed.match(/^\[\[([^\n]+)\]\]$/) : null;
      if (standaloneWikiLink && !standaloneWikiLink[1].includes(']]')) {
        const content = standaloneWikiLink[1],
          pipe = content.indexOf('|');
        const target = (pipe >= 0 ? content.slice(0, pipe) : content).trim();
        const alias = (pipe >= 0 ? content.slice(pipe + 1) : '').trim();
        if (target) {
          const fallbackTitle = (target.split('#')[0].split('/').at(-1) || target)
            .replace(/\\\]/g, ']')
            .trim();
          blocks.push({
            id: runtime.uid('b'),
            type: 'page-link',
            pageId: '',
            title: alias || fallbackTitle,
            wikiTarget: target,
          });
          i++;
          continue;
        }
      }

      // Adjacent editor blocks are saved on consecutive Markdown lines.
      // Restore each line as a block so another save preserves those boundaries.
      pushText('text', trimmed);
      i++;
    }
    return blocks;
  }

  function parseMarkdownInlinePayload(source, { tableCell = false } = {}) {
    const entities = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
      '#60': '<',
      '#62': '>',
      '#124': '|',
    };
    const delimiters = [
      ['**', 'bold'],
      ['__', 'bold'],
      ['~~', 'strike'],
      ['`', 'code'],
      ['*', 'italic'],
      ['_', 'italic'],
      ['==', 'background'],
    ];
    const parse = (value, depth = 0) => {
      const result = { text: '', links: [], formats: [], wikiLinks: [] };
      const append = (payload) => {
        const offset = result.text.length;
        result.text += payload.text;
        result.links.push(
          ...payload.links.map((link) => ({
            ...link,
            start: link.start + offset,
            end: link.end + offset,
          })),
        );
        result.formats.push(
          ...payload.formats.map((format) => ({
            ...format,
            start: format.start + offset,
            end: format.end + offset,
          })),
        );
        result.wikiLinks.push(
          ...payload.wikiLinks.map((link) => ({
            ...link,
            start: link.start + offset,
            end: link.end + offset,
          })),
        );
        return { start: offset, end: result.text.length };
      };
      for (let i = 0; i < value.length;) {
        // Older documents escaped breaks as Markdown punctuation or HTML entities.
        const lineBreak = value.slice(i).match(/^(?:<br\s*\/?>|\\<br\s*\/?\\>|&lt;br\s*\/?&gt;)/i);
        if (lineBreak) {
          result.text += '\n';
          i += lineBreak[0].length;
          continue;
        }
        if (value[i] === '\\' && i + 1 < value.length) {
          result.text += value[i + 1];
          i += 2;
          continue;
        }
        const entity = value.slice(i).match(/^&(amp|lt|gt|quot|apos|#60|#62|#124);/i);
        if (entity) {
          result.text += entities[entity[1].toLowerCase()];
          i += entity[0].length;
          continue;
        }
        const numericEntity = value.slice(i).match(/^&#(x[0-9a-f]+|\d+);/i);
        if (numericEntity) {
          const hex = /^x/i.test(numericEntity[1]);
          const codePoint = parseInt(
            hex ? numericEntity[1].slice(1) : numericEntity[1],
            hex ? 16 : 10,
          );
          result.text +=
            codePoint > 0 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
              ? String.fromCodePoint(codePoint)
              : '\ufffd';
          i += numericEntity[0].length;
          continue;
        }
        const wiki = value.slice(i).match(/^\[\[([^\]]+)\]\]/);
        if (wiki) {
          const pipe = wiki[1].indexOf('|'),
            targetSpec = (pipe >= 0 ? wiki[1].slice(0, pipe) : wiki[1]).trim();
          const label = (pipe >= 0 ? wiki[1].slice(pipe + 1) : targetSpec).trim();
          const targetTitle = (targetSpec.split('#')[0].split('/').at(-1) || targetSpec).trim();
          const range = append(parse(label || targetTitle, depth + 1));
          if (range.end > range.start)
            result.wikiLinks.push({
              start: range.start,
              end: range.end,
              target: targetSpec,
              hasAlias: pipe >= 0,
            });
          i += wiki[0].length;
          continue;
        }
        const link = value
          .slice(i)
          .match(/^\[([^\]]+)\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)/);
        if (link) {
          const label = parse(link[1], depth + 1),
            range = append(label),
            url = link[2].replace(/^<|>$/g, '');
          const normalized =
            runtime.normalizePastedLinkUrl(url) || runtime.normalizeHyperlinkUrl(url);
          if (normalized && range.end > range.start)
            result.links.push({ start: range.start, end: range.end, url: normalized });
          i += link[0].length;
          continue;
        }
        if (value.slice(i, i + 3).toLowerCase() === '<u>') {
          const end = value.toLowerCase().indexOf('</u>', i + 3);
          if (end >= 0) {
            const inner = parse(value.slice(i + 3, end), depth + 1),
              range = append(inner);
            if (range.end > range.start)
              result.formats.push({ start: range.start, end: range.end, type: 'underline' });
            i = end + 4;
            continue;
          }
        }
        const styledTag = value.slice(i).match(/^<(span|mark)\b([^>]*)>/i);
        if (styledTag && depth < 8) {
          const color =
            styledTag[1].toLowerCase() === 'span'
              ? styledTag[2].match(/\binline-color-([a-z0-9-]+)/i)
              : null;
          const background =
            styledTag[1].toLowerCase() === 'mark'
              ? styledTag[2].match(/\binline-bg-([a-z0-9-]+)/i)
              : null;
          const format = color
            ? { type: 'color', value: color[1] }
            : background
              ? { type: 'background', value: background[1] }
              : null;
          const closing = `</${styledTag[1].toLowerCase()}>`;
          const end = format ? value.toLowerCase().indexOf(closing, i + styledTag[0].length) : -1;
          if (format && end >= 0) {
            const inner = parse(value.slice(i + styledTag[0].length, end), depth + 1);
            const range = append(inner);
            if (range.end > range.start) result.formats.push({ ...range, ...format });
            i = end + closing.length;
            continue;
          }
        }
        let matched = false;
        if (depth < 8)
          for (const [token, type] of delimiters) {
            if (!value.startsWith(token, i)) continue;
            const end = value.indexOf(token, i + token.length);
            if (end < 0 || end === i + token.length) continue;
            const content = value.slice(i + token.length, end),
              inner =
                type === 'code'
                  ? {
                      text: tableCell ? content.replace(/\\([\\|])/g, '$1') : content,
                      links: [],
                      formats: [],
                      wikiLinks: [],
                    }
                  : parse(content, depth + 1),
              range = append(inner);
            if (range.end > range.start)
              result.formats.push({
                start: range.start,
                end: range.end,
                type,
                ...(type === 'background' ? { value: 'yellow' } : {}),
              });
            i = end + token.length;
            matched = true;
            break;
          }
        if (matched) continue;
        result.text += value[i++];
      }
      return result;
    };
    const parsed = parse(String(source || ''));
    return {
      text: parsed.text,
      links: runtime.normalizeInlineLinkRanges(parsed.links, parsed.text.length),
      formats: runtime.normalizeInlineFormatRanges(parsed.formats, parsed.text.length),
      wikiLinks: parsed.wikiLinks,
    };
  }

  function safeFileSegment(value) {
    const cleaned = String(value || 'Untitled')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .replace(/[. ]+$/g, '');
    return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : 'Untitled';
  }

  function markdownTargetForPage(page, paths) {
    if (!page) return '';
    const path = page && paths?.get(page.id);
    return String(
      path ? runtime.normalizeFolderPath(path).replace(/\.md$/i, '') : page.title || 'Untitled',
    ).replace(/\]/g, '\\]');
  }

  function markdownPageBlockReference(block, workspace, paths) {
    const linked = (workspace.pages || []).find((page) => page.id === block.pageId);
    if (!linked) return `[[${String(block.title || 'Untitled').replace(/\]/g, '\\]')}]]`;
    const alias = String(linked.title || 'Untitled').replace(/\]/g, '\\]');
    return `[[${runtime.markdownTargetForPage(linked, paths)}|${alias}]]`;
  }

  function markdownInlineForBlock(block, workspace, paths, { tableCell = false } = {}) {
    const text = String(block?.text || ''),
      formats = runtime.inlineFormatsForBlock(block),
      events = new Map();
    const add = (at, event) => {
      const list = events.get(at) || [];
      list.push(event);
      events.set(at, list);
    };
    for (const link of runtime.inlineLinksForBlock(block)) {
      const page = link.pageId
        ? (workspace.pages || []).find((item) => item.id === link.pageId)
        : null;
      const opening = page ? `[[${runtime.markdownTargetForPage(page, paths)}|` : '[';
      const closing = page ? ']]' : `](${runtime.markdownEscapeLinkUrl(link.url || '')})`;
      add(link.start, { kind: 'open', rank: 1, value: opening });
      add(link.end, { kind: 'close', rank: 1, value: closing });
    }
    for (const link of Array.isArray(block?.wikiLinks) ? block.wikiLinks : []) {
      const target = String(link?.target || '').trim();
      if (!target) continue;
      const display = text.slice(Math.max(0, link.start), Math.max(0, link.end));
      // The display text is emitted below; emitting the target twice corrupts unaliased links.
      const opening =
        link.hasAlias || display !== target ? `[[${target.replace(/\]/g, '\\]')}|` : '[[';
      add(link.start, { kind: 'open', rank: 1, value: opening });
      add(link.end, { kind: 'close', rank: 1, value: ']]' });
    }
    const wrappers = {
      bold: ['**', '**'],
      italic: ['*', '*'],
      underline: ['<u>', '</u>'],
      strike: ['~~', '~~'],
      code: ['`', '`'],
      color: ['<span>', '</span>'],
      background: ['<mark>', '</mark>'],
    };
    for (const format of formats) {
      const wrapper = wrappers[format.type];
      if (!wrapper) continue;
      const opening =
        format.type === 'color'
          ? runtime.htmlWithStyles(
              `<span class="inline-color-${runtime.escapeHtml(format.value || '')}">`,
            )
          : format.type === 'background'
            ? runtime.htmlWithStyles(
                `<mark class="inline-bg-${runtime.escapeHtml(format.value || '')}">`,
              )
            : wrapper[0];
      // Code delimiters belong inside a link label, never around its Markdown syntax.
      const rank = format.type === 'code' ? 0 : wrapper[0].length;
      add(format.start, { kind: 'open', rank, value: opening });
      add(format.end, { kind: 'close', rank, value: wrapper[1] });
    }
    let out = '';
    for (let i = 0; i <= text.length; i++) {
      const here = (events.get(i) || [])
        .slice()
        .sort((a, b) =>
          a.kind === b.kind
            ? a.kind === 'open'
              ? b.rank - a.rank
              : a.rank - b.rank
            : a.kind === 'close'
              ? -1
              : 1,
        );
      for (const event of here) if (event.kind === 'close') out += event.value;
      for (const event of here) if (event.kind === 'open') out += event.value;
      if (i < text.length) {
        const char = text[i];
        if (formats.some((format) => format.type === 'code' && format.start <= i && format.end > i))
          out += tableCell && /[\\|]/.test(char) ? '\\' + char : char;
        else if (char === '\n') out += '<br>';
        else if (tableCell && char === '|') out += '&#124;';
        else if (char === '&') out += '&amp;';
        // Numeric entities distinguish literal tags from legacy escaped line breaks.
        else if (char === '<') out += '&#60;';
        else if (char === '>') out += '&#62;';
        else if (/[\\`*_{}\[\]<>]/.test(char)) out += `\\${char}`;
        else out += char;
      }
    }
    return out;
  }

  function markdownForBlocks(blocks, workspace, paths) {
    const lines = [];
    let previousType = '';
    for (const block of blocks || []) {
      // Adjacent tables need a separator so their rows do not merge on reload.
      if (block.type === 'table' && previousType === 'table') lines.push('');
      previousType = block.type;
      runtime.normalizeLegacyLinkBlock(block);
      const text = runtime.markdownInlineForBlock(block, workspace, paths);
      if (['text', 'h1', 'h2', 'h3'].includes(block.type))
        lines.push(
          block.type === 'h1'
            ? `# ${text}`
            : block.type === 'h2'
              ? `## ${text}`
              : block.type === 'h3'
                ? `### ${text}`
                : text,
        );
      else if (block.type === 'bullet' || block.type === 'number') {
        const indent = '  '.repeat(runtime.listIndentLevel(block));
        const marker = block.type === 'number' ? '1. ' : '- ';
        const continuation = indent + ' '.repeat(marker.length);
        lines.push(indent + marker + text.replace(/<br>/g, '\n' + continuation));
      } else if (block.type === 'todo') lines.push(`- [${block.checked ? 'x' : ' '}] ${text}`);
      else if (block.type === 'quote')
        lines.push(
          String(text)
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n'),
        );
      else if (block.type === 'callout')
        lines.push(
          String(text)
            .split('\n')
            .map((line, index) => (index === 0 ? `> [!NOTE] ${line}` : `> ${line}`))
            .join('\n'),
        );
      else if (block.type === 'toggle') lines.push(`> [!NOTE] ${text}`);
      else if (block.type === 'code') {
        const value = String(block.text || ''),
          runs = [...value.matchAll(/`{3,}|~{3,}/g)].map((match) => match[0].length),
          fence = '`'.repeat(Math.max(3, ...runs.map((size) => size + 1)));
        lines.push(`${fence}${block.language || ''}\n${value}\n${fence}`);
      } else if (block.type === 'divider') lines.push('---');
      else if (block.type === 'image') {
        const path = runtime.normalizeAttachmentPath(block.src);
        const inlineSvg = /^data:image\/svg\+xml[;,]/i.test(block.src || '');
        const caption = String(block.caption || '');
        const title = caption
          ? ` "${caption.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\/g, '\\\\').replace(/\r/g, '&#13;').replace(/\n/g, '&#10;')}"`
          : '';
        lines.push(
          path && !caption
            ? `![[${runtime.markdownAssetPath(path).replace(/\]/g, '\\]')}]]`
            : `![${runtime.markdownEscapeLinkLabel(block.alt || (inlineSvg ? '' : 'Image'))}](${runtime.markdownEscapeLinkUrl(path ? runtime.markdownAssetPath(path) : block.src || '')}${title})`,
        );
      } else if (block.type === 'page-link' || block.type === 'page')
        lines.push(runtime.markdownPageBlockReference(block, workspace, paths));
      else if (block.type === 'table')
        lines.push(runtime.simpleTableMarkdown(block, workspace, paths));
      else if (block.type === 'columns') {
        const columns = block.columns || [];
        lines.push(
          columns
            .map((column) => runtime.markdownForBlocks(column.blocks || [], workspace, paths))
            .filter(Boolean)
            .join('\n\n---\n\n'),
        );
      } else if (block.text || block.caption) lines.push(String(block.text || block.caption));
    }
    return lines.filter((line) => line !== undefined).join('\n');
  }

  function filePathForWorkspacePage(
    page,
    workspace,
    memo = new Map(),
    visiting = new Set(),
    used = new Set(),
  ) {
    if (memo.has(page.id)) return memo.get(page.id);
    const title = String(page.title || 'Untitled'),
      validationError = runtime.validateFilesystemName(title, 3);
    if (validationError) throw new Error(`Invalid note name "${title}": ${validationError}`);
    const pages = workspace.pages || [],
      folders = workspace.folders || [];
    let directory = folders.find((folder) => folder.id === page.folderId)?.path || '';
    if (page.parentId) {
      const parent = pages.find((item) => item.id === page.parentId);
      if (parent && !visiting.has(parent.id)) {
        visiting.add(page.id);
        const parentPath = runtime.filePathForWorkspacePage(
          parent,
          workspace,
          memo,
          visiting,
          used,
        );
        const parentParts = parentPath.split('/');
        parentParts.pop();
        directory = [...parentParts, runtime.safeFileSegment(parent.title)]
          .filter(Boolean)
          .join('/');
        visiting.delete(page.id);
      }
    }
    const name = runtime.safeFileSegment(page.title || 'Untitled'),
      path = [directory, `${name}.md`].filter(Boolean).join('/');
    if (used.has(path.toLocaleLowerCase()))
      throw new Error(`Two notes cannot have the same name in the same folder: ${path}`);
    used.add(path.toLocaleLowerCase());
    memo.set(page.id, path);
    return path;
  }

  function markdownForPage(page, workspace, paths) {
    const body = runtime.markdownForBlocks(page.blocks || [], workspace, paths);
    const customFrontmatter = Array.isArray(page.frontmatter)
      ? page.frontmatter.filter((line) => !APP_FRONTMATTER_PATTERN.test(line)).join('\n')
      : '';
    const frontmatter = customFrontmatter.trim() ? `---\n${customFrontmatter}\n---\n\n` : '';
    return `${frontmatter}${body}${body ? '\n' : ''}`;
  }

  function serializeMarkdownWorkspace(workspace) {
    const memo = new Map(),
      used = new Set();
    for (const page of workspace.pages || [])
      runtime.filePathForWorkspacePage(page, workspace, memo, new Set(), used);
    return (workspace.pages || []).map((page) => {
      const path = memo.get(page.id);
      page.filePath = path;
      return { path, content: runtime.markdownForPage(page, workspace, memo) };
    });
  }

  function parseMarkdownFile(file) {
    const source = String(file.content || '').replace(/\r\n?/g, '\n');
    let body = source,
      metadata = {},
      userFrontmatter = [];
    const frontmatter = source.match(/^---\n([\s\S]*?)\n---\n?/);
    if (frontmatter) {
      body = source.slice(frontmatter[0].length).replace(/^\n/, '');
      const frontmatterLines = frontmatter[1].split('\n');
      const line = frontmatterLines.find((item) => APP_FRONTMATTER_PATTERN.test(item));
      userFrontmatter = frontmatterLines.filter((item) => !APP_FRONTMATTER_PATTERN.test(item));
      if (line) {
        try {
          metadata = JSON.parse(line.replace(APP_FRONTMATTER_VALUE_PATTERN, ''));
          delete metadata.blocks;
          delete metadata.bodyHash;
        } catch {}
      }
    }
    if (body.endsWith('\n')) body = body.slice(0, -1);
    const blocks = runtime.parseMarkdownBlocks(body, {
      preserveInline: true,
      preserveBlankLines: true,
    });
    const baseName = file.path.split('/').at(-1).replace(/\.md$/i, '');
    return {
      path: runtime.normalizeFolderPath(file.path),
      title: baseName || 'Untitled',
      body,
      metadata,
      frontmatter: userFrontmatter,
      blocks,
    };
  }

  function removeLegacyAppFrontmatter(files) {
    let changed = false;
    const migrated = files.map((file) => {
      const source = String(file.content || '');
      const frontmatter = source.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)(\r?\n)?/);
      if (!frontmatter) return file;
      const newline = frontmatter[1].endsWith('\r\n') ? '\r\n' : '\n';
      const lines = frontmatter[2].split(/\r?\n/);
      if (!lines.some((line) => APP_FRONTMATTER_PATTERN.test(line))) return file;
      changed = true;
      const retained = lines.filter((line) => !APP_FRONTMATTER_PATTERN.test(line));
      const body = source.slice(frontmatter[0].length);
      if (retained.some((line) => line.trim())) {
        return {
          ...file,
          content: `${frontmatter[1]}${retained.join(newline)}${frontmatter[3]}${frontmatter[4] || ''}${body}`,
        };
      }
      return { ...file, content: body.startsWith(newline) ? body.slice(newline.length) : body };
    });
    return changed ? migrated : null;
  }

  function workspaceFromMarkdown(cached, files, directories) {
    const workspace = runtime.clone(cached || runtime.DEFAULT_WORKSPACE),
      previous = workspace.pages || [];
    const pathKey = (path) => runtime.normalizeFolderPath(path).toLocaleLowerCase();
    const byPath = new Map(
      previous.filter((page) => page.filePath).map((page) => [pathKey(page.filePath), page]),
    );
    const previousForFile = (file) =>
      (file.metadata?.id && previous.find((page) => page.id === file.metadata.id)) ||
      byPath.get(pathKey(file.path));
    const parsedFiles = files.map(runtime.parseMarkdownFile).sort((a, b) => {
      const previousOrder = (file) => {
        const page = previousForFile(file);
        return page ? previous.indexOf(page) : Number.MAX_SAFE_INTEGER;
      };
      const orderA = Number.isFinite(Number(a.metadata?.order))
        ? Number(a.metadata.order)
        : previousOrder(a);
      const orderB = Number.isFinite(Number(b.metadata?.order))
        ? Number(b.metadata.order)
        : previousOrder(b);
      return orderA - orderB || a.path.localeCompare(b.path);
    });
    const pages = parsedFiles.map((file) => {
      const metadata = file.metadata || {};
      const previousPage = previousForFile(file);
      const id = String(
        metadata.id || previousPage?.id || `page_${runtime.folderIdForPath(file.path).slice(7)}`,
      );
      const directory = runtime.folderParentPath(file.path);
      const parentId = Object.prototype.hasOwnProperty.call(metadata, 'parentId')
        ? metadata.parentId || null
        : previousPage?.parentId || null;
      const favorite =
        typeof metadata.favorite === 'boolean'
          ? metadata.favorite
          : previousPage?.favorite === true;
      return {
        id,
        parentId,
        folderId: directory ? runtime.folderIdForPath(directory) : null,
        filePath: file.path,
        frontmatter: file.frontmatter,
        title: file.title,
        icon: metadata.icon || previousPage?.icon || runtime.DEFAULT_PAGE_ICON,
        iconIsCustom: metadata.icon ? true : previousPage?.iconIsCustom === true,
        favorite,
        expanded: previousPage?.expanded !== false,
        folderNote:
          typeof metadata.folderNote === 'boolean'
            ? metadata.folderNote
            : previousPage?.folderNote === true,
        blocks: file.blocks,
      };
    });
    const pageByWikiTitle = (title) => {
      const key = runtime.wikiTitleKey(title);
      return key
        ? pages.find((page) => runtime.wikiTitleKey(page.title || 'Untitled') === key) || null
        : null;
    };
    const wikiPathKey = (path) =>
      runtime
        .normalizeFolderPath(path)
        .replace(/^\/+|\.md$/gi, '')
        .toLocaleLowerCase();
    const pageByWikiPath = (path) => {
      const key = wikiPathKey(path);
      return key ? pages.find((page) => wikiPathKey(page.filePath) === key) || null : null;
    };
    const resolveRelativeWikiPath = (sourcePath, targetPath) => {
      const parts = runtime.folderParentPath(sourcePath).split('/').filter(Boolean);
      for (const part of runtime.normalizeFolderPath(targetPath).split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') parts.pop();
        else parts.push(part);
      }
      return parts.join('/');
    };
    for (const page of pages)
      for (const block of runtime.flattenBlocks(page.blocks)) {
        if (block.type === 'page-link' && typeof block.wikiTarget === 'string') {
          const targetSpec = String(block.wikiTarget).split('#')[0].trim();
          const targetTitle = targetSpec.split('/').at(-1) || targetSpec;
          const target =
            pageByWikiPath(targetSpec) ||
            pageByWikiPath(resolveRelativeWikiPath(page.filePath, targetSpec)) ||
            pageByWikiTitle(targetTitle);
          if (target) block.pageId = target.id;
          block.title = String(block.title || targetTitle);
          delete block.wikiTarget;
        }
        if (Array.isArray(block.wikiLinks) && block.wikiLinks.length) {
          const unresolved = [];
          const links = runtime.inlineLinksForBlock(block).slice();
          for (const wiki of block.wikiLinks) {
            const targetSpec = String(wiki.target || '')
              .split('#')[0]
              .trim();
            const targetTitle = targetSpec.split('/').at(-1) || targetSpec;
            const target =
              pageByWikiPath(targetSpec) ||
              pageByWikiPath(resolveRelativeWikiPath(page.filePath, targetSpec)) ||
              pageByWikiTitle(targetTitle);
            if (target) links.push({ start: wiki.start, end: wiki.end, pageId: target.id });
            else unresolved.push(wiki);
          }
          block.inlineLinks = runtime.normalizeInlineLinkRanges(
            links,
            String(block.text || '').length,
          );
          if (!block.inlineLinks.length) delete block.inlineLinks;
          if (unresolved.length) block.wikiLinks = unresolved;
          else delete block.wikiLinks;
        }
        if (block.type === 'table')
          for (let ri = 0; ri < (block.tableCellInline || []).length; ri++)
            for (let ci = 0; ci < (block.tableCellInline[ri] || []).length; ci++) {
              const cell = block.tableCellInline[ri][ci];
              if (!cell?.wikiLinks?.length) continue;
              const text = String(block.tableRows?.[ri]?.[ci] || ''),
                cellUnresolved = [],
                cellLinks = runtime.normalizeInlineLinkRanges(cell.inlineLinks, text.length);
              for (const wiki of cell.wikiLinks) {
                const targetSpec = String(wiki.target || '')
                  .split('#')[0]
                  .trim();
                const targetTitle = targetSpec.split('/').at(-1) || targetSpec;
                const target =
                  pageByWikiPath(targetSpec) ||
                  pageByWikiPath(resolveRelativeWikiPath(page.filePath, targetSpec)) ||
                  pageByWikiTitle(targetTitle);
                if (target) cellLinks.push({ start: wiki.start, end: wiki.end, pageId: target.id });
                else cellUnresolved.push(wiki);
              }
              cell.inlineLinks = runtime.normalizeInlineLinkRanges(cellLinks, text.length);
              if (!cell.inlineLinks.length) delete cell.inlineLinks;
              if (cellUnresolved.length) cell.wikiLinks = cellUnresolved;
              else delete cell.wikiLinks;
            }
      }
    for (const page of pages)
      if (page.parentId && !pages.some((parent) => parent.id === page.parentId))
        page.parentId = null;
    const implicitPaths = new Set();
    for (const page of pages)
      if (pages.some((child) => child.parentId === page.id))
        implicitPaths.add(
          runtime
            .normalizeFolderPath(
              `${runtime.folderParentPath(page.filePath)}/${runtime.safeFileSegment(page.title)}`,
            )
            .toLocaleLowerCase(),
        );
    const directoryPaths = (directories || []).map((path) => runtime.normalizeFolderPath(path));
    const previousFolders = new Map(
      (workspace.folders || []).map((folder) => [
        runtime.normalizeFolderPath(folder.path).toLocaleLowerCase(),
        folder,
      ]),
    );
    const rootPagePaths = new Set(
      pages
        .filter((page) => !page.parentId)
        .map((page) =>
          runtime.normalizeFolderPath(runtime.folderParentPath(page.filePath)).toLocaleLowerCase(),
        ),
    );
    const hasIndependentChildFolder = (path) =>
      directoryPaths.some(
        (child) =>
          runtime.normalizeFolderPath(runtime.folderParentPath(child)).toLocaleLowerCase() ===
            runtime.normalizeFolderPath(path).toLocaleLowerCase() &&
          !implicitPaths.has(runtime.normalizeFolderPath(child).toLocaleLowerCase()),
      );
    const folders = directoryPaths
      .filter((path) => {
        const key = runtime.normalizeFolderPath(path).toLocaleLowerCase(),
          previousFolder = previousFolders.get(key),
          explicit =
            (previousFolder && previousFolder.explicit !== false) ||
            rootPagePaths.has(key) ||
            hasIndependentChildFolder(path);
        return !implicitPaths.has(key) || explicit;
      })
      .map((path) => {
        const key = runtime.normalizeFolderPath(path).toLocaleLowerCase(),
          previousFolder = previousFolders.get(key),
          explicit = Boolean(
            (previousFolder && previousFolder.explicit !== false) ||
            rootPagePaths.has(key) ||
            hasIndependentChildFolder(path) ||
            !implicitPaths.has(key),
          );
        return {
          id: runtime.folderIdForPath(path),
          path,
          name: path.split('/').at(-1) || path,
          icon: previousFolder?.icon || runtime.DEFAULT_FOLDER_ICON,
          expanded: previousFolder?.expanded !== false,
          explicit,
        };
      });
    const knownFolders = new Set(folders.map((folder) => folder.path));
    for (const page of pages) {
      const path = runtime.folderParentPath(page.filePath);
      if (page.parentId || !path) continue;
      if (!knownFolders.has(path)) page.folderId = runtime.folderIdForPath(path);
    }
    workspace.pages = pages;
    workspace.folders = folders;
    if (!knownFolders.has(workspace.activeFolderPath)) workspace.activeFolderPath = '';
    workspace.markdownFilesInitialized = true;
    return workspace;
  }

  function selectionOffsetsWithin(root) {
    const sel = window.getSelection();
    if (!sel?.rangeCount)
      return { start: (root.innerText || '').length, end: (root.innerText || '').length };
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer))
      return { start: (root.innerText || '').length, end: (root.innerText || '').length };
    const before = document.createRange();
    before.selectNodeContents(root);
    before.setEnd(range.startContainer, range.startOffset);
    const through = document.createRange();
    through.selectNodeContents(root);
    through.setEnd(range.endContainer, range.endOffset);
    return { start: before.toString().length, end: through.toString().length };
  }

  function inlineSelectionForAnchor(anchor) {
    const content = anchor?.closest(
        '.block-content[contenteditable="true"],[data-table-cell][contenteditable="true"]',
      ),
      row = content?.closest('.block-row[data-block-id]'),
      block = runtime.findBlock(row?.dataset.blockId);
    const cellPosition = content?.matches('[data-table-cell]')
      ? runtime.tableCellCoordinates(content)
      : null;
    if (
      !content ||
      !block ||
      (cellPosition ? block.type !== 'table' : !runtime.isTextLikeBlock(block))
    )
      return null;
    const cellBlock = cellPosition
      ? runtime.tableCellInlineBlock(block, cellPosition.row, cellPosition.col)
      : null;
    try {
      const range = document.createRange();
      range.selectNodeContents(anchor);
      const before = document.createRange();
      before.selectNodeContents(content);
      before.setEndBefore(anchor);
      const start = before.toString().length,
        end = start + (anchor.innerText || anchor.textContent || '').length,
        rect = range.getBoundingClientRect();
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
    } catch {
      return null;
    }
  }

  function linkHoverMenuElement() {
    let menu = document.getElementById('linkHoverMenu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'linkHoverMenu';
      menu.className = runtime.classWithStyles('link-hover-menu hidden');
      menu.dataset.linkHoverMenu = '';
      menu.setAttribute('role', 'group');
      menu.setAttribute('aria-label', 'Link options');
      document.body.appendChild(menu);
    }
    return menu;
  }

  function linkHoverAnchorFromTarget(target) {
    return target?.closest?.('a[data-inline-link],[data-inline-page]') || null;
  }

  function linkHoverDetails(anchor) {
    if (anchor?.hasAttribute('data-inline-page')) {
      const page = runtime.pageById(anchor.dataset.inlinePage),
        label = String(page?.title || anchor.textContent || 'Missing page').trim();
      return { label, copyValue: page ? `[[${page.title || 'Untitled'}]]` : label };
    }
    const raw = String(anchor?.getAttribute('href') || '').trim();
    const url = runtime.normalizeHyperlinkUrl(raw) || String(anchor?.href || raw);
    return {
      label: url || String(anchor?.textContent || 'Link').trim(),
      copyValue: url || String(anchor?.textContent || '').trim(),
    };
  }

  function positionLinkHoverMenu(anchor) {
    const menu = runtime.linkHoverMenuElement();
    if (!anchor?.isConnected) return runtime.hideLinkHoverMenu();
    const rect = anchor.getBoundingClientRect();
    menu.classList.remove('hidden');
    const menuRect = menu.getBoundingClientRect(),
      margin = 8;
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - menuRect.width - margin));
    const below = rect.bottom + margin,
      top =
        below + menuRect.height <= window.innerHeight - margin
          ? below
          : Math.max(margin, rect.top - menuRect.height - margin);
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  function showLinkHoverMenu(anchor) {
    if (!anchor?.isConnected) return;
    runtime.hoveredLinkAnchor = anchor;
    const details = runtime.linkHoverDetails(anchor),
      menu = runtime.linkHoverMenuElement();
    menu.innerHTML = runtime.htmlWithStyles(
      `<span class="link-hover-globe">${runtime.iconMarkup('globe', '15px')}</span><span class="link-hover-target">${runtime.escapeHtml(details.label)}</span><button type="button" data-link-hover-copy title="Copy link" aria-label="Copy link">${runtime.iconMarkup('copy', '15px')}</button><button type="button" class="link-hover-edit" data-link-hover-edit>Edit</button>`,
    );
    runtime.positionLinkHoverMenu(anchor);
  }

  function hideLinkHoverMenu() {
    runtime.lifecycle.clearTimeout(runtime.linkHoverHideTimer);
    runtime.linkHoverHideTimer = null;
    const menu = document.getElementById('linkHoverMenu');
    menu?.classList.add('hidden');
    runtime.hoveredLinkAnchor = null;
  }

  function onLinkPointerOver(e) {
    if (e.pointerType === 'touch') return;
    const menu = e.target.closest?.('[data-link-hover-menu]');
    if (menu) {
      runtime.lifecycle.clearTimeout(runtime.linkHoverHideTimer);
      runtime.linkHoverHideTimer = null;
      return;
    }
    const anchor = runtime.linkHoverAnchorFromTarget(e.target);
    if (!anchor) return;
    runtime.lifecycle.clearTimeout(runtime.linkHoverHideTimer);
    runtime.linkHoverHideTimer = null;
    if (anchor !== runtime.hoveredLinkAnchor) runtime.showLinkHoverMenu(anchor);
  }

  function onLinkPointerOut(e) {
    const menu = e.target.closest?.('[data-link-hover-menu]'),
      anchor = runtime.linkHoverAnchorFromTarget(e.target);
    if (!menu && anchor !== runtime.hoveredLinkAnchor) return;
    const next = e.relatedTarget;
    if (
      next &&
      (runtime.hoveredLinkAnchor?.contains(next) ||
        document.getElementById('linkHoverMenu')?.contains(next))
    )
      return;
    runtime.lifecycle.clearTimeout(runtime.linkHoverHideTimer);
    runtime.linkHoverHideTimer = runtime.lifecycle.timeout(runtime.hideLinkHoverMenu, 260);
  }

  function copyHoveredLink() {
    const text = runtime.linkHoverDetails(runtime.hoveredLinkAnchor).copyValue;
    if (!text) return;
    const fallback = () => {
      const input = document.createElement('textarea');
      input.value = text;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      try {
        document.execCommand('copy');
        runtime.toast('Link copied');
      } catch {
        runtime.toast('Could not copy link');
      }
      input.remove();
    };
    if (navigator.clipboard?.writeText)
      navigator.clipboard
        .writeText(text)
        .then(() => runtime.toast('Link copied'))
        .catch(fallback);
    else fallback();
  }

  function editHoveredLink() {
    const anchor = runtime.hoveredLinkAnchor;
    const pane = anchor?.closest('.dock-pane[data-editor-group]');
    if (pane) runtime.focusEditorGroup(pane.dataset.editorGroup);
    runtime.hideLinkHoverMenu();
    const selection = runtime.inlineSelectionForAnchor(anchor);
    if (selection) {
      runtime.inlineSelectionState = selection;
      runtime.openInlineLinkPopover({ focusTitle: true, standalone: true });
    }
  }

  function pasteParsedBlocksIntoBlock(content, parsed, sourceLabel = 'Content') {
    const row = content?.closest('.block-row'),
      location = runtime.findBlockLocation(row?.dataset.blockId),
      page = runtime.currentPage();
    if (!location || !page || !runtime.isTextLikeBlock(location.block) || !parsed?.length)
      return false;

    const block = location.block,
      original = String(block.text || ''),
      { start, end } = runtime.selectionOffsetsWithin(content);
    const left = original.slice(0, start),
      right = original.slice(end),
      splitLinks = runtime.inlineLinksAroundRange(block, start, end),
      splitFormats = runtime.inlineFormatsAroundRange(block, start, end);
    const replacement = [];
    if (left) {
      block.text = left;
      block.inlineLinks = runtime.normalizeInlineLinkRanges(splitLinks.left, left.length);
      if (!block.inlineLinks.length) delete block.inlineLinks;
      block.inlineFormats = runtime.normalizeInlineFormatRanges(splitFormats.left, left.length);
      if (!block.inlineFormats.length) delete block.inlineFormats;
      replacement.push(block);
    }
    replacement.push(...parsed);
    let trailing = null;
    if (right) {
      const trailingType = ['bullet', 'number', 'todo', 'toggle'].includes(block.type)
        ? block.type
        : 'text';
      trailing = { id: runtime.uid('b'), type: trailingType, text: right };
      const trailingLinks = runtime.normalizeInlineLinkRanges(splitLinks.right, right.length);
      if (trailingLinks.length) trailing.inlineLinks = trailingLinks;
      const trailingFormats = runtime.normalizeInlineFormatRanges(splitFormats.right, right.length);
      if (trailingFormats.length) trailing.inlineFormats = trailingFormats;
      if (trailingType === 'todo') trailing.checked = false;
      replacement.push(trailing);
    }
    location.blocks.splice(location.index, 1, ...replacement);
    runtime.ensureBlockList(location.blocks);
    runtime.scheduleSave();
    runtime.hideFloatingMenus();
    runtime.renderBlocks(page);

    const focusTarget =
      trailing || [...parsed].reverse().find(runtime.isTextLikeBlock) || (left ? block : null);
    if (focusTarget) runtime.focusBlock(focusTarget.id, (focusTarget.text || '').length);
    runtime.toast(
      `${sourceLabel} pasted as ${parsed.length} block${parsed.length === 1 ? '' : 's'}`,
    );
    return true;
  }

  Object.assign(runtime, {
    applyMarkdownBlockShortcut,
    applyMarkdownInlineShortcut,
    normalizeMarkdownImageSource,
    normalizeObsidianAttachmentReference,
    normalizeAttachmentPath,
    isVaultAssetPath,
    markdownAssetPath,
    saveImageBlobAttachment,
    imageAltFromUrl,
    loadImageFileIntoBlock,
    normalizeMarkdownCodeLanguage,
    markdownInlineText,
    splitMarkdownTableRow,
    splitMarkdownTableRowRaw,
    markdownTableCellPayload,
    isMarkdownTableSeparator,
    looksLikeMarkdown,
    richHtmlInlinePayload,
    richHtmlBlockFromElement,
    parseRichHtmlBlocks,
    richHtmlShouldCreateBlocks,
    parseMarkdownBlocks,
    parseMarkdownInlinePayload,
    safeFileSegment,
    markdownTargetForPage,
    markdownPageBlockReference,
    markdownInlineForBlock,
    markdownForBlocks,
    markdownForPage,
    filePathForWorkspacePage,
    serializeMarkdownWorkspace,
    parseMarkdownFile,
    removeLegacyAppFrontmatter,
    workspaceFromMarkdown,
    selectionOffsetsWithin,
    inlineSelectionForAnchor,
    linkHoverMenuElement,
    linkHoverAnchorFromTarget,
    linkHoverDetails,
    positionLinkHoverMenu,
    showLinkHoverMenu,
    hideLinkHoverMenu,
    onLinkPointerOver,
    onLinkPointerOut,
    copyHoveredLink,
    editHoveredLink,
    pasteParsedBlocksIntoBlock,
  });
}

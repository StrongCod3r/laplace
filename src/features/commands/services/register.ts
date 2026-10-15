// @ts-nocheck
// Existing editor algorithms, isolated behind the typed controller boundary.
import type { EditorRuntime } from '@/features/editor/types';
import { slashTokenAtCaret } from './slash-token';
import { inlineMathRanges } from '@/features/math/syntax';

export function registerCommands(runtime: EditorRuntime) {
  let slashContext: {
    content: HTMLElement;
    start: number;
    end: number;
    original: string;
    inlineOnly: boolean;
  } | null = null;
  function updateEmojiMenu(content, b) {
    if (!runtime.els.emojiMenu || runtime.activeSlashBlockId === b.id) {
      runtime.hideEmojiMenu();
      return;
    }
    const caret = runtime.getCaretOffset(content),
      text = b.text || '',
      before = text.slice(0, caret);
    const colon = before.lastIndexOf(':');
    if (colon < 0) {
      if (runtime.activeEmojiBlockId === b.id) runtime.hideEmojiMenu();
      return;
    }
    const query = before.slice(colon + 1);
    if (!/^[a-z]/i.test(query) || query.length > 28 || /[\s:/\\]/.test(query)) {
      if (runtime.activeEmojiBlockId === b.id) runtime.hideEmojiMenu();
      return;
    }
    // Require a letter after the colon and avoid triggering inside common URL schemes.
    const prefix = before.slice(Math.max(0, colon - 8), colon).toLowerCase();
    if (/https?$/.test(prefix)) {
      runtime.hideEmojiMenu();
      return;
    }
    runtime.activeEmojiBlockId = b.id;
    runtime.emojiTokenStart = colon;
    runtime.emojiTokenEnd = caret;
    runtime.emojiIndex = 0;
    runtime.renderEmojiResults(query);
    runtime.positionEmojiMenu(content);
  }

  function renderEmojiResults(query = '') {
    const q = query.toLowerCase().trim();
    runtime.emojiMatches = runtime.EMOJI_CATALOG.filter(
      (item) => !q || item.name.includes(q),
    ).slice(0, 96);
    const label = q ? `Emoji for :${runtime.escapeHtml(q)}` : 'Emoji';
    runtime.els.emojiResults.innerHTML = runtime.htmlWithStyles(
      `<div class="emoji-menu-label">${label}</div>${runtime.emojiMatches.length ? `<div class="emoji-grid">${runtime.emojiMatches.map((item, i) => `<button class="emoji-choice ${i === runtime.emojiIndex ? 'selected' : ''}" data-emoji-choice="${runtime.escapeHtml(item.emoji)}" title=":${runtime.escapeHtml(item.name.split(' ')[0])}:"><span>${runtime.escapeHtml(item.emoji)}</span></button>`).join('')}</div>` : '<div class="emoji-empty">No emojis found</div>'}`,
    );
    runtime.renderEmojiSelection();
  }

  function renderEmojiSelection() {
    const items = [...runtime.els.emojiResults.querySelectorAll('[data-emoji-choice]')];
    if (!items.length) return;
    runtime.emojiIndex = Math.max(0, Math.min(runtime.emojiIndex, items.length - 1));
    items.forEach((item, i) => item.classList.toggle('selected', i === runtime.emojiIndex));
    items[runtime.emojiIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function positionEmojiMenu(content) {
    const menu = runtime.els.emojiMenu;
    if (!menu) return;
    let rect = null,
      sel = window.getSelection();
    if (sel?.rangeCount && content.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0).cloneRange();
      range.collapse(true);
      rect = range.getBoundingClientRect();
    }
    if (!rect || (!rect.width && !rect.height)) rect = content.getBoundingClientRect();
    const width = 326,
      height = 330;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    let top = rect.bottom + 7;
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 7);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.classList.remove('hidden');
  }

  function chooseEmoji(emoji) {
    const id = runtime.activeEmojiBlockId,
      b = runtime.findBlock(id);
    if (!b) return runtime.hideEmojiMenu();
    const text = b.text || '',
      start = runtime.emojiTokenStart,
      end = runtime.emojiTokenEnd;
    if (start < 0 || end < start || end > text.length) return runtime.hideEmojiMenu();
    b.text = text.slice(0, start) + emoji + text.slice(end);
    const caret = start + emoji.length;
    runtime.scheduleSave();
    runtime.hideEmojiMenu();
    runtime.renderBlocks(runtime.currentPage());
    runtime.focusBlock(id, caret);
  }

  function hideEmojiMenu() {
    if (runtime.els.emojiMenu) runtime.els.emojiMenu.classList.add('hidden');
    runtime.activeEmojiBlockId = null;
    runtime.emojiTokenStart = -1;
    runtime.emojiTokenEnd = -1;
    runtime.emojiMatches = [];
    runtime.emojiIndex = 0;
  }

  function showSlashMenu(row, b, content = row?.querySelector('.block-content')) {
    const text = String(b.text || '');
    const token = content?.isContentEditable
      ? slashTokenAtCaret(text, runtime.getCaretOffset(content))
      : null;
    if (
      !token ||
      inlineMathRanges(text).some((math) => math.start <= token.start && math.end >= token.end) ||
      runtime
        .inlineFormatsForBlock(b)
        .some(
          (format) =>
            format.type === 'code' && format.start <= token.start && format.end >= token.end,
        )
    ) {
      runtime.hideSlashMenu();
      return false;
    }
    slashContext = {
      content,
      start: token.start,
      end: token.end,
      original: text,
      inlineOnly:
        content.matches('[data-table-cell]') ||
        token.start > 0 ||
        token.end < text.length ||
        text.includes('\n'),
    };
    runtime.activeSlashBlockId = row.dataset.blockId;
    runtime.slashIndex = 0;
    runtime.els.slashSearch.value = token.query;
    runtime.renderSlashResults(runtime.els.slashSearch.value);
    const selection = window.getSelection();
    const caret = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    caret?.collapse(true);
    const rect = caret?.getBoundingClientRect();
    const anchor = rect?.height ? rect : content.getBoundingClientRect();
    runtime.els.slashMenu.classList.remove('hidden');
    runtime.els.slashMenu.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - 325))}px`;
    runtime.els.slashMenu.style.top = `${Math.max(8, Math.min(anchor.bottom + 2, window.innerHeight - runtime.els.slashMenu.offsetHeight - 8))}px`;
    return true;
  }

  function hideSlashMenu() {
    slashContext = null;
    runtime.activeSlashBlockId = null;
    runtime.els.slashMenu.classList.add('hidden');
  }

  function renderSlashResults(query = '') {
    const prefixes = {
      h1: '#',
      h2: '##',
      h3: '###',
      h4: '####',
      h5: '#####',
      h6: '######',
      bullet: '-',
      number: '1.',
      todo: '[]',
      toggle: '>',
      quote: '"',
      code: '```',
      divider: '---',
    };
    const items = runtime.BLOCK_TYPES.filter(
      (x) =>
        (!slashContext?.inlineOnly || x.type === 'inline-equation') &&
        runtime.blockTypeMatchesQuery(x, query),
    ).sort((a, b) => runtime.blockTypeSearchRank(a, query) - runtime.blockTypeSearchRank(b, query));
    runtime.slashIndex = 0;
    const groups = [...new Set(items.map((x) => x.group))];
    let html = '';
    groups.forEach((g) => {
      html += runtime.htmlWithStyles(`<div class="slash-group">${g}</div>`);
      html += items
        .filter((x) => x.group === g)
        .map((x) =>
          runtime.htmlWithStyles(
            `<button class="slash-item" data-slash-type="${x.type}" aria-label="${runtime.escapeHtml(x.name)}" title="${runtime.escapeHtml(x.desc)}"><span class="slash-icon">${runtime.iconMarkup(x.icon, '18px')}</span><span class="slash-name">${x.name}</span>${prefixes[x.type] ? `<span class="slash-prefix" aria-hidden="true">${runtime.escapeHtml(prefixes[x.type])}</span>` : ''}</button>`,
          ),
        )
        .join('');
    });
    runtime.els.slashResults.innerHTML = html;
    runtime.renderSlashSelection();
  }

  function renderSlashSelection() {
    const items = [...runtime.els.slashResults.querySelectorAll('.slash-item')];
    items.forEach((x, i) => x.classList.toggle('selected', i === runtime.slashIndex));
    items[runtime.slashIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function applySlashType(type) {
    const context = slashContext;
    const b = runtime.findBlock(runtime.activeSlashBlockId);
    if (!b) return;
    const parent = runtime.currentPage();
    if (type === 'inline-equation') {
      if (!context?.content.isConnected) return runtime.hideSlashMenu();
      const cell = context.content.matches('[data-table-cell]')
        ? runtime.tableCellCoordinates(context.content)
        : null;
      const original = cell ? b.tableRows?.[cell.row]?.[cell.col] : b.text;
      if (String(original || '') !== context.original) return runtime.hideSlashMenu();
      runtime.hideSlashMenu();
      runtime.openInlineEquation(context.content, { start: context.start, end: context.end }, '');
      return;
    }
    if (context?.inlineOnly) return;
    b.type = type;
    b.text = '';
    if (!runtime.isListBlock(b)) delete b.indent;
    if (type === 'todo') b.checked = false;
    if (type === 'page') {
      const child = runtime.createPageForBlock(parent.id);
      b.pageId = child.id;
      delete b.text;
      runtime.hideSlashMenu();
      runtime.replaceActiveTab(child.id);
      runtime.scheduleSave();
      runtime.renderAll();
      runtime.lifecycle.frame(() => {
        runtime.els.pageTitle.focus();
        runtime.selectAllContent(runtime.els.pageTitle);
      });
      return;
    }
    if (type === 'page-link') {
      b.pageId = '';
      delete b.text;
      runtime.scheduleSave();
      runtime.hideSlashMenu();
      runtime.renderBlocks(parent);
      runtime.lifecycle.frame(() => {
        const row = document.querySelector(`.block-row[data-block-id="${b.id}"]`);
        if (row) runtime.showPageLinkPicker(row, b.id);
      });
      return;
    }
    if (type === 'image') {
      b.src = '';
      b.caption = '';
      b.alt = '';
      delete b.text;
    }
    if (type === 'code') {
      b.language = 'bash';
      b.codeWrap = false;
      b.codeLineNumbers = false;
      b.mermaidPreview = true;
      b.text = '';
    }
    if (type === 'toggle') {
      b.open = false;
      if (!Array.isArray(b.children)) b.children = [];
    }
    if (type === 'table') {
      b.tableRows = Array.from({ length: 3 }, () => Array(3).fill(''));
      b.tableColumnAlignments = Array(3).fill('left');
      b.tableCellInline = Array.from({ length: 3 }, () => Array(3).fill(null));
      b.tableHeaderRow = false;
      b.tableHeaderColumn = false;
      delete b.text;
    }
    runtime.scheduleSave();
    runtime.hideSlashMenu();
    runtime.renderBlocks(parent);
    if (type === 'code') runtime.focusCodeBlock(b.id);
    else if (type === 'table')
      runtime.lifecycle.frame(() =>
        document
          .querySelector(`.simple-table-block[data-block-id="${b.id}"] [data-table-cell="0:0"]`)
          ?.focus(),
      );
    else if (!['divider', 'image'].includes(type)) runtime.focusBlock(b.id, 0);
  }

  function showBlockMenu(row, id) {
    const block = runtime.findBlock(id);
    const isTable = block?.type === 'table';
    if (isTable) runtime.normalizeSimpleTableBlock(block);
    const r = row.getBoundingClientRect();
    const menuWidth = 210,
      menuHeight = isTable ? 430 : 230;
    runtime.els.blockMenu.style.left = `${Math.max(8, Math.min(r.left - 40, window.innerWidth - menuWidth - 8))}px`;
    runtime.els.blockMenu.style.top = `${Math.max(8, Math.min(r.top + 28, window.innerHeight - menuHeight - 8))}px`;
    const tableOptions = isTable
      ? runtime.htmlWithStyles(`
      <div class="table-menu-section">
        <div class="table-menu-label">Table</div>
        <button class="block-menu-item" data-block-menu-action="table-add-row" data-block-id="${id}">${runtime.iconMarkup('plus', '14px')} Add row to bottom</button>
        <button class="block-menu-item" data-block-menu-action="table-add-col" data-block-id="${id}">${runtime.iconMarkup('plus', '14px')} Add column to right</button>
        <div class="block-menu-hint">Use the row and column handles on the table to insert, duplicate or delete a specific row or column.</div>
      </div>
      <div class="table-menu-section">
        <button class="block-menu-item" data-block-menu-action="table-header-row" data-block-id="${id}">${runtime.iconMarkup('rows-3', '16px')} Header row<span class="menu-check">${block.tableHeaderRow ? runtime.iconMarkup('check', '14px') : ''}</span></button>
        <button class="block-menu-item" data-block-menu-action="table-header-col" data-block-id="${id}">${runtime.iconMarkup('columns-3', '16px')} Header column<span class="menu-check">${block.tableHeaderColumn ? runtime.iconMarkup('check', '14px') : ''}</span></button>
      </div>`)
      : '';
    runtime.els.blockMenu.style.width = `${menuWidth}px`;
    runtime.els.blockMenu.innerHTML = runtime.htmlWithStyles(`${tableOptions}
      <div class="table-menu-section">
        <button class="block-menu-item" data-block-menu-action="duplicate" data-block-id="${id}">${runtime.iconMarkup('copy', '16px')} Duplicate</button>
        <button class="block-menu-item" data-block-menu-action="turn-text" data-block-id="${id}">${runtime.iconMarkup('text', '16px')} Turn into text</button>
        <button class="block-menu-item" data-block-menu-action="move-up" data-block-id="${id}">${runtime.iconMarkup('arrow-up', '16px')} Move up</button>
        <button class="block-menu-item" data-block-menu-action="move-down" data-block-id="${id}">${runtime.iconMarkup('arrow-down', '16px')} Move down</button>
        ${runtime.blockDeleteMenuItem(id)}
      </div>`);
    runtime.els.blockMenu.classList.remove('hidden');
  }

  function runBlockMenuAction(action, id) {
    const page = runtime.currentPage(),
      loc = runtime.findBlockLocation(id);
    if (!loc) return;
    const i = loc.index,
      blocks = loc.blocks,
      block = blocks[i];
    if (action.startsWith('table-') && block?.type === 'table') {
      runtime.normalizeSimpleTableBlock(block);
      if (action === 'table-add-row')
        block.tableRows.push(Array(block.tableRows[0].length).fill(''));
      if (action === 'table-add-col') block.tableRows.forEach((r) => r.push(''));
      if (action === 'table-header-row') block.tableHeaderRow = !block.tableHeaderRow;
      if (action === 'table-header-col') block.tableHeaderColumn = !block.tableHeaderColumn;
      runtime.scheduleSave();
      runtime.hideFloatingMenus();
      runtime.renderBlocks(page);
      return;
    }
    if (action === 'duplicate') {
      blocks.splice(i + 1, 0, runtime.cloneBlockWithNewIds(blocks[i]));
    }
    if (action === 'turn-text') {
      const b = blocks[i],
        fallback = runtime.blockTextFallback(b);
      b.type = 'text';
      b.text = fallback;
      delete b.indent;
      delete b.pageId;
      delete b.url;
      delete b.tableRows;
      delete b.tableColumnAlignments;
      delete b.tableCellInline;
      delete b.tableHeaderRow;
      delete b.tableHeaderColumn;
    }
    if (action === 'move-up' && i > 0) {
      [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]];
    }
    if (action === 'move-down' && i < blocks.length - 1) {
      [blocks[i + 1], blocks[i]] = [blocks[i], blocks[i + 1]];
    }
    if (action === 'delete') {
      blocks.splice(i, 1);
      runtime.ensureBlockList(blocks);
    }
    runtime.scheduleSave();
    runtime.hideFloatingMenus();
    runtime.renderBlocks(page);
  }

  function showPageMenu(row, id) {
    const page = runtime.pageById(id);
    if (!page) return;
    const canConvertToFolder = !runtime.representedFolderForPage(page);
    const alreadyOpen =
      !runtime.els.blockMenu.classList.contains('hidden') &&
      runtime.els.blockMenu.querySelector('[data-command="delete-page"]')?.dataset.pageId === id;
    runtime.hideFloatingMenus();
    if (alreadyOpen) return;
    const r = row.getBoundingClientRect(),
      width = 200,
      height = canConvertToFolder ? 156 : 120;
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
    const top =
      r.bottom + height + 8 <= window.innerHeight ? r.bottom + 4 : Math.max(8, r.top - height - 4);
    runtime.els.blockMenu.style.left = `${left}px`;
    runtime.els.blockMenu.style.top = `${top}px`;
    runtime.els.blockMenu.style.width = `${width}px`;
    runtime.els.blockMenu.innerHTML = runtime.htmlWithStyles(
      `${canConvertToFolder ? `<button class="block-menu-item" data-command="convert-page-to-folder" data-page-id="${id}">${runtime.contextMenuItemContent('folder', 'Convert to Folder')}</button>` : ''}<button class="block-menu-item" data-command="duplicate-page" data-page-id="${id}">${runtime.contextMenuItemContent('copy', 'Duplicate')}</button><button class="block-menu-item" data-command="toggle-favorite" data-page-id="${id}">${runtime.contextMenuItemContent('star', page.favorite ? 'Remove from favorites' : 'Add to favorites')}</button><button class="block-menu-item danger" data-command="delete-page" data-page-id="${id}">${runtime.contextMenuItemContent('trash', 'Delete')}</button>`,
    );
    runtime.els.blockMenu.classList.remove('hidden');
    row.setAttribute('aria-expanded', 'true');
  }

  function openCommandPalette() {
    runtime.els.commandPalette.classList.remove('hidden');
    runtime.els.commandSearch.value = '';
    runtime.commandIndex = 0;
    runtime.renderCommandResults('');
    runtime.lifecycle.timeout(() => runtime.els.commandSearch.focus(), 0);
  }

  function renderCommandResults(q = '') {
    const query = q.toLowerCase().trim();
    const actions = [
      { cmd: 'new-page', icon: 'file-plus', title: 'New page', desc: 'Create a blank page' },
      {
        cmd: 'graph-view',
        icon: 'network',
        title: 'Open graph view',
        desc: 'Visualize links between pages',
      },
      ...(runtime.state.mainView === 'page' && runtime.currentPage()
        ? [
            {
              cmd: 'change-page-icon',
              icon: 'image',
              title: 'Change page icon',
              desc: 'Choose an icon for this page',
            },
          ]
        : []),
      {
        cmd: 'toggle-theme',
        icon: 'sun-moon',
        title: 'Toggle theme',
        desc: 'Switch light/dark mode',
      },
      { cmd: 'settings', icon: 'settings', title: 'Open settings', desc: 'Workspace preferences' },
    ].filter((x) => !query || `${x.title} ${x.desc}`.toLowerCase().includes(query));
    const pagePath = (page) =>
      page.filePath ||
      [runtime.pageFolderPath(page), `${runtime.safeFileSegment(page.title || 'Untitled')}.md`]
        .filter(Boolean)
        .join('/');
    const pages = runtime.state.pages.filter((page) => {
      const searchable = `${page.title || 'Untitled'} ${pagePath(page)}`.toLowerCase();
      return !query || searchable.includes(query);
    });
    runtime.els.commandResults.innerHTML = runtime.htmlWithStyles(
      `<div class="command-group-title">Actions</div>${actions.map((a) => runtime.commandItemHTML(a)).join('')}<div class="command-group-title">Pages</div>${pages.map((p) => `<button class="command-item" data-command="open-page" data-page-id="${p.id}"><span class="command-item-icon">${runtime.pageIconMarkup(runtime.pageIconFor(p))}</span><span class="command-item-main"><div class="command-item-title">${runtime.escapeHtml(p.title || 'Untitled')}</div><div class="command-item-desc">${runtime.escapeHtml(pagePath(p))}</div></span></button>`).join('')}`,
    );
    runtime.renderCommandSelection();
  }

  function commandItemHTML(a) {
    return runtime.htmlWithStyles(
      `<button class="command-item" data-command="${a.cmd}"><span class="command-item-icon">${runtime.iconMarkup(a.icon, '18px')}</span><span class="command-item-main"><div class="command-item-title">${a.title}</div><div class="command-item-desc">${a.desc}</div></span></button>`,
    );
  }

  function renderCommandSelection() {
    const items = [...runtime.els.commandResults.querySelectorAll('.command-item')];
    items.forEach((x, i) => x.classList.toggle('selected', i === runtime.commandIndex));
    items[runtime.commandIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function runCommand(cmd, pageId) {
    runtime.els.commandPalette.classList.add('hidden');
    runtime.els.blockMenu.classList.add('hidden');
    document
      .querySelectorAll('[data-page-menu-trigger][aria-expanded="true"]')
      .forEach((button) => button.setAttribute('aria-expanded', 'false'));
    if (cmd === 'open-page') runtime.openPage(pageId);
    if (cmd === 'new-page') runtime.createPage();
    if (cmd === 'graph-view') runtime.openGraphTab();
    if (cmd === 'change-page-icon')
      runtime.showIconMenu(
        runtime.els.pageIcon?.classList.contains('hidden')
          ? runtime.els.pageTitle
          : runtime.els.pageIcon,
      );
    if (cmd === 'toggle-theme') runtime.cycleTheme();
    if (cmd === 'settings') runtime.openSettings();
    if (cmd === 'convert-page-to-folder' || cmd === 'new-child')
      runtime.convertPageToFolder(pageId);
    if (cmd === 'duplicate-page') runtime.duplicatePage(pageId);
    if (cmd === 'toggle-favorite') {
      const p = runtime.pageById(pageId);
      p.favorite = !p.favorite;
      runtime.scheduleSave();
      runtime.renderSidebar();
    }
    if (cmd === 'delete-page') runtime.deletePage(pageId);
  }

  function positionPageMetaMenu(anchor, width = 320) {
    const r = anchor.getBoundingClientRect();
    const menu = runtime.els.pageMetaMenu;
    menu.style.width = `${width}px`;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${Math.min(r.bottom + 5, window.innerHeight - 440)}px`;
    menu.classList.remove('hidden');
  }

  function showIconMenu(anchor) {
    const p = runtime.currentPage();
    runtime.hideFloatingMenus();
    const external =
      runtime.state.showCustomPageIcons !== false && runtime.isExternalPageIcon(p.icon);
    const initialTab = external ? 'external' : 'emoji';
    runtime.els.pageMetaMenu.innerHTML =
      runtime.htmlWithStyles(`<div class="meta-menu-head"><span>Page icon</span><button type="button" class="meta-menu-default" data-default-page-icon title="Use the default page icon" ${p.icon ? '' : 'disabled'}>Use default</button></div>
      <div class="icon-picker-tabs" role="tablist" aria-label="Icon source">
        <button type="button" class="icon-picker-tab ${initialTab === 'emoji' ? 'active' : ''}" data-icon-picker-tab="emoji" role="tab" aria-selected="${initialTab === 'emoji'}">Emoji</button>
        <button type="button" class="icon-picker-tab ${initialTab === 'external' ? 'active' : ''}" data-icon-picker-tab="external" role="tab" aria-selected="${initialTab === 'external'}">External</button>
      </div>
      <div class="icon-picker-pane ${initialTab === 'emoji' ? '' : 'hidden'}" data-icon-picker-pane="emoji">
        <div class="icon-picker-search">${runtime.iconMarkup('search', '16px')}<input data-icon-search type="search" placeholder="Search emojis..." autocomplete="off" spellcheck="false"></div>
        <div class="icon-picker-scroll">
          <div data-icon-results></div>
          <div class="meta-custom-row"><input data-custom-icon-input maxlength="12" placeholder="Paste an emoji" value=""><button data-custom-icon-submit>Use</button></div>
        </div>
      </div>
      <div class="icon-picker-pane ${initialTab === 'external' ? '' : 'hidden'}" data-icon-picker-pane="external">
        <div class="external-icon-tab-body">
          ${external ? `<div class="external-icon-current"><span class="external-icon-preview">${runtime.pageIconMarkup(p.icon, '')}</span><span>Current external icon</span></div>` : ''}
          <label class="external-icon-field-label">Image URL</label>
          <div class="external-icon-url-row"><input data-external-icon-url type="url" placeholder="https://.../icon.svg" spellcheck="false"><button data-external-icon-submit>Use URL</button></div>
          <div class="external-icon-divider"><span>or</span></div>
          <div class="external-icon-dropzone" data-external-icon-dropzone tabindex="0" role="button" aria-label="Drop, paste or browse for an external icon">
            <span class="external-icon-drop-glyph" aria-hidden="true">${runtime.iconMarkup('upload', '24px')}</span>
            <span class="external-icon-drop-title">Drop an icon here</span>
            <span class="external-icon-drop-subtitle">or paste an image with Ctrl/Cmd+V</span>
            <button class="external-icon-upload" type="button" data-external-icon-upload>Browse files</button>
          </div>
          <div class="external-icon-help">Accepts SVG, PNG, JPG, WEBP, GIF and ICO. You can also drop an image URL. Local files are stored inside this vault (max 1.5 MB).</div>
        </div>
      </div>`);
    runtime.renderIconPickerResults('');
    runtime.positionPageMetaMenu(anchor, 340);
    runtime.lifecycle.timeout(() => {
      const selector = initialTab === 'emoji' ? '[data-icon-search]' : '[data-external-icon-url]';
      runtime.els.pageMetaMenu.querySelector(selector)?.focus({ preventScroll: true });
    }, 0);
  }

  function switchIconPickerTab(tab) {
    if (!runtime.els.pageMetaMenu || !['emoji', 'external'].includes(tab)) return;
    runtime.els.pageMetaMenu.querySelectorAll('[data-icon-picker-tab]').forEach((btn) => {
      const active = btn.dataset.iconPickerTab === tab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    runtime.els.pageMetaMenu
      .querySelectorAll('[data-icon-picker-pane]')
      .forEach((pane) => pane.classList.toggle('hidden', pane.dataset.iconPickerPane !== tab));
    runtime.lifecycle.frame(() => {
      const selector = tab === 'emoji' ? '[data-icon-search]' : '[data-external-icon-url]';
      runtime.els.pageMetaMenu.querySelector(selector)?.focus({ preventScroll: true });
    });
  }

  function renderIconPickerResults(query = '') {
    const host = runtime.els.pageMetaMenu?.querySelector('[data-icon-results]');
    if (!host) return;
    const p = runtime.currentPage();
    const q = String(query || '')
      .trim()
      .toLowerCase();
    const matches = runtime.EMOJI_CATALOG.filter(
      (item) => !q || item.emoji.includes(q) || item.name.toLowerCase().includes(q),
    );
    host.innerHTML = matches.length
      ? runtime.htmlWithStyles(
          `<div class="icon-picker-grid">${matches.map((item) => `<button class="icon-picker-item ${runtime.state.showCustomPageIcons !== false && p?.icon === item.emoji ? 'selected' : ''}" data-icon-choice="${runtime.escapeHtml(item.emoji)}" title="${runtime.escapeHtml(item.name)}">${runtime.escapeHtml(item.emoji)}</button>`).join('')}</div>`,
        )
      : runtime.htmlWithStyles('<div class="icon-picker-empty">No icons found</div>');
  }

  function setPageIcon(icon, pageId = runtime.state.currentPageId, useDefault = false) {
    const p = runtime.pageById(pageId);
    if (!p || runtime.state.currentPageId !== pageId) return;
    if (useDefault) {
      delete p.icon;
      delete p.iconIsCustom;
    } else {
      p.icon = runtime.normalizePageIcon(icon);
      p.iconIsCustom = true;
    }
    runtime.scheduleSave();
    runtime.els.pageMetaMenu.classList.add('hidden');
    runtime.renderAll();
  }

  function applyExternalIconUrl(value) {
    const url = runtime.normalizeExternalIconUrl(value);
    if (!url) {
      runtime.toast('Enter a valid image URL');
      return;
    }
    const operationEpoch = runtime.pageOperationEpoch,
      pageId = runtime.state.currentPageId;
    const img = new Image();
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (operationEpoch !== runtime.pageOperationEpoch || runtime.state.currentPageId !== pageId)
        return;
      if (ok) runtime.setPageIcon(url, pageId);
      else runtime.toast('Could not load that icon');
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
    runtime.lifecycle.timeout(() => finish(false), 7000);
  }

  function loadPageIconFile(file) {
    if (!file) return;
    const operationEpoch = runtime.pageOperationEpoch,
      pageId = runtime.state.currentPageId;
    const allowed =
      file.type.startsWith('image/') || /\.(svg|png|jpe?g|webp|gif|ico)$/i.test(file.name || '');
    if (!allowed) {
      runtime.toast('Choose an SVG, PNG, JPG, WEBP, GIF or ICO file');
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      runtime.toast('Icon file is too large (max 1.5 MB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (operationEpoch !== runtime.pageOperationEpoch || runtime.state.currentPageId !== pageId)
        return;
      const data = String(reader.result || '');
      if (!runtime.isExternalPageIcon(data)) {
        runtime.toast('Unsupported icon file');
        return;
      }
      runtime.setPageIcon(data, pageId);
    };
    reader.onerror = () => runtime.toast('Could not read the icon file');
    reader.readAsDataURL(file);
  }

  function externalIconPaneActive() {
    return !!runtime.els.pageMetaMenu?.querySelector(
      '[data-icon-picker-pane="external"]:not(.hidden)',
    );
  }

  function transferImageFile(data) {
    const direct = [...(data?.files || [])].find(
      (file) =>
        file?.type?.startsWith('image/') ||
        /\.(svg|png|jpe?g|webp|gif|ico)$/i.test(file?.name || ''),
    );
    if (direct)
      return /\.svg$/i.test(direct.name || '') && direct.type !== 'image/svg+xml'
        ? new File([direct], direct.name, {
            type: 'image/svg+xml',
            lastModified: direct.lastModified,
          })
        : direct;
    const item = [...(data?.items || [])].find((entry) => entry?.type?.startsWith('image/'));
    return item?.getAsFile?.() || null;
  }

  function transferExternalIconText(data) {
    const uri =
      String(data?.getData?.('text/uri-list') || '')
        .split(/\r?\n/)
        .map((v) => v.trim())
        .find((v) => v && !v.startsWith('#')) || '';
    return uri || String(data?.getData?.('text/plain') || '').trim();
  }

  function applyExternalIconTransfer(data, { allowText = true } = {}) {
    const file = runtime.transferImageFile(data);
    if (file) {
      runtime.loadPageIconFile(file);
      return true;
    }
    if (!allowText) return false;
    const text = runtime.transferExternalIconText(data);
    if (!text) return false;
    if (/^data:image\//i.test(text)) {
      runtime.setPageIcon(text);
      return true;
    }
    if (/^<svg[\s>]/i.test(text)) {
      const file = new File([text], 'clipboard-icon.svg', { type: 'image/svg+xml' });
      runtime.loadPageIconFile(file);
      return true;
    }
    if (runtime.normalizeExternalIconUrl(text)) {
      runtime.applyExternalIconUrl(text);
      return true;
    }
    return false;
  }

  function clearExternalIconDropState() {
    runtime.els.pageMetaMenu
      ?.querySelectorAll('[data-external-icon-dropzone].drag-over')
      .forEach((zone) => zone.classList.remove('drag-over'));
  }

  function openComments() {
    runtime.hideFloatingMenus();
    const p = runtime.currentPage();
    if (!p.comments) p.comments = [];
    runtime.els.pageComments.classList.remove('hidden');
    runtime.renderPageComments();
    runtime.lifecycle.frame(() =>
      runtime.els.pageComments.querySelector('[data-comment-input]')?.focus(),
    );
  }

  Object.assign(runtime, {
    updateEmojiMenu,
    renderEmojiResults,
    renderEmojiSelection,
    positionEmojiMenu,
    chooseEmoji,
    hideEmojiMenu,
    showSlashMenu,
    hideSlashMenu,
    renderSlashResults,
    renderSlashSelection,
    applySlashType,
    showBlockMenu,
    runBlockMenuAction,
    showPageMenu,
    openCommandPalette,
    renderCommandResults,
    commandItemHTML,
    renderCommandSelection,
    runCommand,
    positionPageMetaMenu,
    showIconMenu,
    switchIconPickerTab,
    renderIconPickerResults,
    setPageIcon,
    applyExternalIconUrl,
    loadPageIconFile,
    externalIconPaneActive,
    transferImageFile,
    transferExternalIconText,
    applyExternalIconTransfer,
    clearExternalIconDropState,
    openComments,
  });
}

// @ts-nocheck
import { APP_ID } from './../../../app-identity';
// Existing editor algorithms, isolated behind the typed controller boundary.
import type { EditorRuntime } from '@/features/editor/types';
import { createMathSvg, renderMathHTML } from '@/features/math/render';
import { bindMermaidNavigation } from './mermaid-navigation';

export function registerCode(runtime: EditorRuntime) {
  const renderedMermaidPreviews = new WeakMap();
  bindMermaidNavigation(runtime.lifecycle);

  function codeBlockHTML(block, gutter) {
    const language = runtime.CODE_LANGUAGES.some(([id]) => id === block.language)
      ? block.language
      : 'bash';
    const text = String(block.text || '');
    const wrap = block.codeWrap === true,
      lineNumbers = block.codeLineNumbers === true;
    const previewLabel = language === 'mermaid' ? 'Mermaid' : language === 'latex' ? 'LaTeX' : '';
    const previewMode = previewLabel ? runtime.codeViewModeForBlock(block) : null;
    const rows = text.split('\n').length;
    const nums = text
      .split('\n')
      .map((_, i) => `<span>${i + 1}</span>`)
      .join('');
    const modeToolbar = previewLabel
      ? runtime.htmlWithStyles(
          `<div class="mermaid-mode-toolbar hidden" data-code-mode-toolbar role="toolbar" aria-label="${previewLabel} display mode">${[
            ['code', 'code-xml', 'Code'],
            ['split', 'rows-2', 'Split horizontally'],
            ['preview', 'eye', 'Preview'],
          ]
            .map(
              ([mode, icon, label]) =>
                `<button type="button" class="mermaid-mode-btn ${previewMode === mode ? 'active' : ''}" data-code-view-mode="${mode}" ${language === 'mermaid' ? `data-mermaid-view-mode="${mode}"` : ''} title="${label}" aria-label="${label}" aria-pressed="${previewMode === mode}">${runtime.iconMarkup(icon, '16px')}</button>`,
            )
            .join('')}</div>`,
        )
      : '';
    const modeToggle = previewLabel
      ? runtime.htmlWithStyles(
          `<button type="button" class="code-tool-btn mermaid-mode-toggle" data-code-mode-toggle ${language === 'mermaid' ? 'data-mermaid-mode-toggle' : ''} title="Change display mode" aria-label="Change ${previewLabel} display mode" aria-expanded="false">${runtime.iconMarkup(previewMode === 'code' ? 'code-xml' : previewMode === 'preview' ? 'eye' : 'rows-2', '15px')}</button>`,
        )
      : '';
    const downloadButton =
      language === 'mermaid'
        ? runtime.htmlWithStyles(
            `<button type="button" class="code-tool-btn" data-mermaid-download title="Download diagram as SVG" aria-label="Download diagram as SVG">${runtime.iconMarkup('download', '15px')}</button>`,
          )
        : language === 'latex'
          ? `<button type="button" class="code-tool-btn" data-math-download title="Download formula as SVG" aria-label="Download formula as SVG">${runtime.iconMarkup('download', '15px')}</button>`
          : '';
    const preview =
      language === 'mermaid'
        ? runtime.htmlWithStyles(
            `<div class="mermaid-preview" data-mermaid-preview><div class="mermaid-navigation" role="toolbar" aria-label="Diagram navigation" aria-orientation="horizontal"><button type="button" class="code-tool-btn" data-mermaid-zoom="out" title="Zoom out" aria-label="Zoom out">${runtime.iconMarkup('zoom-out', '15px')}</button><button type="button" class="code-tool-btn mermaid-reset" data-mermaid-reset title="Reset diagram view" aria-label="Reset diagram view">100%</button><button type="button" class="code-tool-btn" data-mermaid-zoom="in" title="Zoom in" aria-label="Zoom in">${runtime.iconMarkup('zoom-in', '15px')}</button></div><div class="mermaid-preview-status" data-mermaid-status>Rendering diagram…</div><div class="mermaid-render" data-mermaid-render tabindex="0" role="region" aria-label="Mermaid diagram. Scroll to zoom, drag to pan. Use plus, minus, arrows and zero on the keyboard."><div class="mermaid-canvas" data-mermaid-canvas></div></div></div>`,
          )
        : language === 'latex'
          ? `<div class="math-preview" data-math-preview role="region" aria-label="LaTeX preview">${renderMathHTML(text, true)}</div>`
          : '';
    const modeClass = previewMode
      ? ` ${language === 'mermaid' ? 'mermaid' : 'math'}-mode-${previewMode}`
      : '';
    return runtime.htmlWithStyles(
      `<div class="block-row code-block${modeClass}" data-block-id="${block.id}" data-type="code">${gutter}<div class="code-block-shell"><div class="code-toolbar"><select class="code-language-select" data-code-language aria-label="Code language">${runtime.CODE_LANGUAGES.map(([id, label]) => `<option value="${id}" ${id === language ? 'selected' : ''}>${label}</option>`).join('')}</select><div class="code-toolbar-actions">${modeToggle}${downloadButton}<button class="code-tool-btn" data-code-copy title="Copy code" aria-label="Copy code">${runtime.iconMarkup('copy', '14px', 'code-copy-icon')}</button><button class="code-tool-btn ${wrap ? 'active' : ''}" data-code-wrap title="${wrap ? 'Disable' : 'Enable'} line wrapping" aria-label="Toggle line wrapping">${runtime.iconMarkup('wrap-text', '14px', 'code-wrap-icon')}</button><button class="code-tool-btn" data-code-more title="More code options" aria-label="More code options">${runtime.iconMarkup('ellipsis', '14px', 'more-dots-icon')}</button></div></div>${modeToolbar}<div class="code-editor-wrap ${wrap ? 'wrap' : ''}"><div class="code-line-numbers ${lineNumbers ? '' : 'hidden'}" data-code-line-numbers>${nums}</div><div class="code-editor-stack"><pre class="code-highlight" data-code-highlight aria-hidden="true"><code>${runtime.highlightCode(text, language)}</code></pre><textarea class="code-input" data-code-editor rows="${rows}" wrap="${wrap ? 'soft' : 'off'}" spellcheck="false" autocomplete="off" autocapitalize="off">${runtime.escapeHtml(text)}</textarea></div></div>${preview}</div></div>`,
    );
  }

  function mermaidViewModeForBlock(block) {
    if (['code', 'preview', 'split'].includes(block?.mermaidViewMode)) return block.mermaidViewMode;
    return block?.mermaidPreview === false ? 'code' : 'preview';
  }

  function codeViewModeForBlock(block) {
    if (block?.language === 'mermaid') return runtime.mermaidViewModeForBlock(block);
    return ['code', 'preview', 'split'].includes(block?.mathViewMode)
      ? block.mathViewMode
      : 'preview';
  }

  function highlightCode(code, language) {
    code = String(code || '');
    if (language === 'plain') return runtime.escapeHtml(code);
    if (language === 'latex') return runtime.escapeHtml(code);
    if (language === 'html' || language === 'xml') return runtime.highlightMarkup(code);
    if (language === 'mermaid') return runtime.highlightMermaid(code);

    const keywordSet = new Set(
      (runtime.CODE_KEYWORDS[language] || '').split(/\s+/).filter(Boolean),
    );
    const hashComment = ['python', 'bash', 'yaml'].includes(language);
    const sqlComment = language === 'sql';
    const slashComment = !['python', 'bash', 'yaml', 'sql', 'html', 'xml'].includes(language);

    // Build the tokenizer from RegExp.source values so escaping stays valid.
    const parts = [
      /`(?:\\.|[^`\\])*`/.source,
      /"(?:\\.|[^"\\])*"/.source,
      /'(?:\\.|[^'\\])*'/.source,
    ];
    if (slashComment) parts.push(/\/\*[\s\S]*?\*\//.source, /\/\/[^\n]*/.source);
    if (hashComment) parts.push(/#[^\n]*/.source);
    if (sqlComment) parts.push(/--[^\n]*/.source, /\/\*[\s\S]*?\*\//.source);
    parts.push(/\b\d+(?:\.\d+)?\b/.source, /\b[A-Za-z_$][\w$]*\b/.source);

    const pattern = new RegExp(parts.join('|'), 'g');
    let out = '',
      last = 0,
      m;
    while ((m = pattern.exec(code))) {
      out += runtime.escapeHtml(code.slice(last, m.index));
      const token = m[0];
      let cls = '';
      if (
        (slashComment && (token.startsWith('//') || token.startsWith('/*'))) ||
        (hashComment && token.startsWith('#')) ||
        (sqlComment && (token.startsWith('--') || token.startsWith('/*')))
      )
        cls = 'comment';
      else if (/^[\'"`]/.test(token)) cls = 'string';
      else if (/^\d/.test(token)) cls = 'number';
      else if (keywordSet.has(token)) cls = 'keyword';
      else if (/^[A-Z][A-Za-z0-9_$]*$/.test(token)) cls = 'type';
      else if (/^\w+$/.test(token) && /^\s*\(/.test(code.slice(pattern.lastIndex)))
        cls = 'function';
      out += cls
        ? runtime.htmlWithStyles(
            `<span class="code-token ${cls}">${runtime.escapeHtml(token)}</span>`,
          )
        : runtime.escapeHtml(token);
      last = pattern.lastIndex;
    }
    return out + runtime.escapeHtml(code.slice(last));
  }

  function highlightMermaid(code) {
    const keywordSet = new Set((runtime.CODE_KEYWORDS.mermaid || '').split(/\s+/).filter(Boolean));
    const pattern =
      /%%\{[\s\S]*?\}%%|%%[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|==>|-->|-.->|---|--|==|-\.|\b\d+(?:\.\d+)?\b|\b[A-Za-z][\w-]*\b/g;
    let out = '',
      last = 0,
      m;
    while ((m = pattern.exec(code))) {
      out += runtime.escapeHtml(code.slice(last, m.index));
      const token = m[0];
      let cls = '';
      if (token.startsWith('%%{')) cls = 'directive';
      else if (token.startsWith('%%')) cls = 'comment';
      else if (/^[\'\"]/.test(token)) cls = 'string';
      else if (/^\d/.test(token)) cls = 'number';
      else if (/^(?:==>|-->|-.->|---|--|==|-\.)$/.test(token)) cls = 'operator';
      else if (keywordSet.has(token)) cls = 'keyword';
      else if (/^[A-Z][A-Za-z0-9_-]*$/.test(token)) cls = 'type';
      out += cls
        ? runtime.htmlWithStyles(
            `<span class="code-token ${cls}">${runtime.escapeHtml(token)}</span>`,
          )
        : runtime.escapeHtml(token);
      last = pattern.lastIndex;
    }
    return out + runtime.escapeHtml(code.slice(last));
  }

  function currentMermaidTheme() {
    return document.body.classList.contains('dark') ? 'dark' : 'default';
  }

  function configureMermaidTheme(api) {
    const theme = runtime.currentMermaidTheme();
    if (runtime.mermaidConfiguredTheme === theme) return;
    api.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme,
      suppressErrorRendering: true,
      fontFamily: 'Inter, system-ui, sans-serif',
    });
    runtime.mermaidConfiguredTheme = theme;
  }

  function ensureMermaidLibrary() {
    if (runtime.mermaidLoadPromise) return runtime.mermaidLoadPromise;
    runtime.mermaidLoadPromise =
      import('https://cdn.jsdelivr.net/npm/mermaid@12/dist/mermaid.esm.min.mjs')
        .then((module) => {
          const api = module.default || module;
          runtime.configureMermaidTheme(api);
          return api;
        })
        .catch((error) => {
          runtime.mermaidLoadPromise = null;
          throw new Error(`Could not load Mermaid: ${error?.message || error}`);
        });
    return runtime.mermaidLoadPromise;
  }

  function scheduleMermaidPreviews(root = runtime.els.blockEditor) {
    runtime.lifecycle.frame(() =>
      root?.querySelectorAll?.('.code-block[data-type="code"]').forEach((row) => {
        const b = runtime.findBlock(row.dataset.blockId);
        if (b?.language === 'mermaid' && runtime.mermaidViewModeForBlock(b) !== 'code')
          runtime.renderMermaidPreview(row, b);
      }),
    );
  }

  function scheduleMermaidPreview(row, b, delay = 320) {
    if (!row || !b || b.language !== 'mermaid' || runtime.mermaidViewModeForBlock(b) === 'code')
      return;
    runtime.lifecycle.clearTimeout(runtime.mermaidPreviewTimers.get(b.id));
    runtime.mermaidPreviewTimers.set(
      b.id,
      runtime.lifecycle.timeout(() => {
        runtime.mermaidPreviewTimers.delete(b.id);
        if (row.isConnected) runtime.renderMermaidPreview(row, b);
      }, delay),
    );
  }

  function mermaidPreviewIsCurrent(preview, block) {
    const rendered = renderedMermaidPreviews.get(preview);
    return (
      block?.language === 'mermaid' &&
      rendered?.source === String(block.text || '').trim() &&
      rendered?.theme === runtime.currentMermaidTheme()
    );
  }

  async function renderMermaidPreview(row, b) {
    const preview = row?.querySelector('[data-mermaid-preview]');
    if (!preview || preview.classList.contains('hidden') || b.language !== 'mermaid') return;
    const renderTarget = preview.querySelector('[data-mermaid-canvas]');
    const status = preview.querySelector('[data-mermaid-status]');
    if (!renderTarget || !status) return;
    if (mermaidPreviewIsCurrent(preview, b)) return;
    renderedMermaidPreviews.delete(preview);
    const source = String(b.text || '').trim();
    const theme = runtime.currentMermaidTheme();
    const token = Symbol(b.id);
    runtime.mermaidRenderTokens.set(b.id, token);
    renderTarget.replaceChildren();
    if (!source) {
      status.textContent = 'Write Mermaid syntax to preview the diagram.';
      status.classList.remove('hidden', 'error');
      return;
    }
    status.textContent = 'Rendering diagram…';
    status.classList.remove('hidden', 'error');
    try {
      const api = await runtime.ensureMermaidLibrary();
      if (runtime.mermaidRenderTokens.get(b.id) !== token || !row.isConnected) return;
      runtime.configureMermaidTheme(api);
      const renderId = `${APP_ID}-mermaid-${++runtime.mermaidRenderSequence}`;
      const result = await api.render(renderId, source);
      if (runtime.mermaidRenderTokens.get(b.id) !== token || !row.isConnected) return;
      renderTarget.innerHTML = result.svg;
      if (typeof result.bindFunctions === 'function') result.bindFunctions(renderTarget);
      status.classList.add('hidden');
      renderedMermaidPreviews.set(preview, { source, theme });
    } catch (error) {
      if (runtime.mermaidRenderTokens.get(b.id) !== token || !row.isConnected) return;
      renderTarget.replaceChildren();
      status.textContent = runtime.mermaidErrorMessage(error);
      status.classList.add('error');
      status.classList.remove('hidden');
    }
  }

  function mermaidErrorMessage(error) {
    const message = String(error?.message || error || 'Invalid Mermaid diagram')
      .replace(/\s+/g, ' ')
      .trim();
    if (/Could not load Mermaid|failed to initialize/i.test(message))
      return 'Mermaid preview is unavailable. Check your internet connection.';
    return `Diagram error: ${message.slice(0, 220)}`;
  }

  function highlightMarkup(code) {
    let out = '',
      last = 0;
    const re = /<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>/g;
    let m;
    while ((m = re.exec(code))) {
      out += runtime.escapeHtml(code.slice(last, m.index));
      const token = m[0];
      if (token.startsWith('<!--'))
        out += runtime.htmlWithStyles(
          `<span class="code-token comment">${runtime.escapeHtml(token)}</span>`,
        );
      else
        out += runtime
          .escapeHtml(token)
          .replace(
            /^(&lt;\/?)([A-Za-z][\w:-]*)/,
            runtime.htmlWithStyles('$1<span class="code-token tag">$2</span>'),
          )
          .replace(
            /([A-Za-z_:][\w:.-]*)(=)/g,
            runtime.htmlWithStyles('<span class="code-token attr">$1</span>$2'),
          );
      last = re.lastIndex;
    }
    return out + runtime.escapeHtml(code.slice(last));
  }

  function updateCodePreview(row, b, input) {
    const language = runtime.CODE_LANGUAGES.some(([id]) => id === b.language) ? b.language : 'bash';
    const code = row?.querySelector('[data-code-highlight] code');
    if (code) code.innerHTML = runtime.highlightCode(b.text || '', language);
    const nums = row?.querySelector('[data-code-line-numbers]');
    if (nums)
      nums.innerHTML = String(b.text || '')
        .split('\n')
        .map((_, i) => `<span>${i + 1}</span>`)
        .join('');
    runtime.syncCodeScroll(input);
    if (language === 'mermaid') runtime.scheduleMermaidPreview(row, b);
    if (language === 'latex') {
      const preview = row?.querySelector('[data-math-preview]');
      if (preview) preview.innerHTML = renderMathHTML(String(b.text || ''), true);
    }
  }

  function syncCodeScroll(input) {
    const pre = input?.closest('.code-editor-stack')?.querySelector('[data-code-highlight]');
    if (pre) {
      pre.scrollLeft = input.scrollLeft;
      pre.scrollTop = input.scrollTop;
    }
  }

  function focusCodeBlock(id) {
    runtime.lifecycle.frame(() =>
      document.querySelector(`.block-row[data-block-id="${id}"] [data-code-editor]`)?.focus(),
    );
  }

  function copyCodeBlock(id) {
    const b = runtime.findBlock(id);
    if (!b) return;
    const text = String(b.text || '');
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        runtime.toast('Code copied');
      } catch {
        runtime.toast('Could not copy code');
      }
      ta.remove();
    };
    if (navigator.clipboard?.writeText)
      navigator.clipboard
        .writeText(text)
        .then(() => runtime.toast('Code copied'))
        .catch(fallback);
    else fallback();
  }

  function setCodeViewMode(id, mode) {
    const block = runtime.findBlock(id);
    if (
      !block ||
      !['mermaid', 'latex'].includes(block.language) ||
      !['code', 'preview', 'split'].includes(mode)
    )
      return;
    if (block.language === 'mermaid') {
      block.mermaidViewMode = mode;
      block.mermaidPreview = mode !== 'code';
    } else block.mathViewMode = mode;
    runtime.closeCodeModeToolbars();
    runtime.scheduleSave();
    runtime.renderBlocks(runtime.currentPage());
  }

  function closeCodeModeToolbars() {
    document.querySelectorAll('[data-code-mode-toolbar]:not(.hidden)').forEach((toolbar) => {
      toolbar.classList.add('hidden');
      toolbar
        .closest('.code-block-shell')
        ?.querySelector('[data-code-mode-toggle]')
        ?.setAttribute('aria-expanded', 'false');
    });
  }

  async function downloadMathFormula(id) {
    const block = runtime.findBlock(id);
    if (!block || block.language !== 'latex') return;
    const filename = `${String(runtime.currentPage()?.title || 'formula').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')}.svg`;
    try {
      const blob = await createMathSvg(String(block.text || ''));
      if (runtime.lifecycle.disposed) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      runtime.lifecycle.timeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      runtime.toast(error?.message || 'Could not download the formula');
    }
  }

  async function downloadMermaidDiagram(row, id) {
    const block = runtime.findBlock(id);
    if (!block || block.language !== 'mermaid') return;
    let svg = row?.querySelector('[data-mermaid-render] svg');
    if (!svg) {
      const source = String(block.text || '').trim();
      if (!source) {
        runtime.toast('Add Mermaid code before downloading the diagram');
        return;
      }
      try {
        const api = await runtime.ensureMermaidLibrary();
        runtime.configureMermaidTheme(api);
        const result = await api.render(
          `${APP_ID}-mermaid-download-${++runtime.mermaidRenderSequence}`,
          source,
        );
        const container = document.createElement('div');
        container.innerHTML = result.svg;
        svg = container.querySelector('svg');
      } catch (error) {
        runtime.toast(runtime.mermaidErrorMessage(error));
        return;
      }
    }
    if (!svg) {
      runtime.toast('The Mermaid diagram could not be rendered');
      return;
    }
    const copy = svg.cloneNode(true);
    if (!copy.hasAttribute('xmlns')) copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const blob = new Blob([new XMLSerializer().serializeToString(copy)], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    const pageTitle =
      String(runtime.currentPage()?.title || 'mermaid-diagram')
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
        .trim() || 'mermaid-diagram';
    link.href = url;
    link.download = `${pageTitle}.svg`;
    link.click();
    runtime.lifecycle.timeout(() => URL.revokeObjectURL(url), 1000);
  }

  function blockDeleteMenuItem(id) {
    return runtime.htmlWithStyles(
      `<button class="block-menu-item danger" data-block-menu-action="delete" data-block-id="${id}">${runtime.iconMarkup('trash', '16px')} Delete</button>`,
    );
  }

  function showCodeOptions(row, id) {
    const b = runtime.findBlock(id);
    if (!b) return;
    const r = row.getBoundingClientRect(),
      menuWidth = 210,
      menuHeight = 210;
    runtime.els.blockMenu.style.left = `${Math.max(8, Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 8))}px`;
    runtime.els.blockMenu.style.top = `${Math.max(8, Math.min(r.top + 36, window.innerHeight - menuHeight - 8))}px`;
    runtime.els.blockMenu.style.width = `${menuWidth}px`;
    runtime.els.blockMenu.innerHTML = runtime.htmlWithStyles(
      `<button class="block-menu-item" data-code-menu-action="copy" data-block-id="${id}">${runtime.iconMarkup('copy', '16px')} Copy code</button><button class="block-menu-item" data-code-menu-action="wrap" data-block-id="${id}">${runtime.iconMarkup('wrap-text', '16px')} Wrap lines<span class="menu-check">${b.codeWrap ? runtime.iconMarkup('check', '14px') : ''}</span></button><button class="block-menu-item" data-code-menu-action="lines" data-block-id="${id}">${runtime.iconMarkup('list-ordered', '16px')} Line numbers<span class="menu-check">${b.codeLineNumbers ? runtime.iconMarkup('check', '14px') : ''}</span></button><div class="code-options-sep"></div><button class="block-menu-item" data-block-menu-action="turn-text" data-block-id="${id}">${runtime.iconMarkup('text', '16px')} Turn into text</button>${runtime.blockDeleteMenuItem(id)}`,
    );
    runtime.els.blockMenu.classList.remove('hidden');
  }

  function runCodeMenuAction(action, id) {
    const b = runtime.findBlock(id);
    if (!b) return;
    if (action === 'copy') {
      runtime.copyCodeBlock(id);
      runtime.els.blockMenu.classList.add('hidden');
      return;
    }
    if (action === 'wrap') b.codeWrap = !b.codeWrap;
    if (action === 'lines') b.codeLineNumbers = !b.codeLineNumbers;
    runtime.scheduleSave();
    runtime.els.blockMenu.classList.add('hidden');
    runtime.renderBlocks(runtime.currentPage());
    runtime.focusCodeBlock(id);
  }

  Object.assign(runtime, {
    codeBlockHTML,
    mermaidViewModeForBlock,
    codeViewModeForBlock,
    highlightCode,
    highlightMermaid,
    currentMermaidTheme,
    configureMermaidTheme,
    ensureMermaidLibrary,
    scheduleMermaidPreviews,
    scheduleMermaidPreview,
    renderMermaidPreview,
    mermaidPreviewIsCurrent,
    mermaidErrorMessage,
    highlightMarkup,
    updateCodePreview,
    syncCodeScroll,
    focusCodeBlock,
    copyCodeBlock,
    setCodeViewMode,
    closeCodeModeToolbars,
    downloadMathFormula,
    downloadMermaidDiagram,
    blockDeleteMenuItem,
    showCodeOptions,
    runCodeMenuAction,
  });
}

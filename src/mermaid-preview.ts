// @ts-nocheck
import { APP_ID } from './app-identity';
// Mermaid support used by Laplace's Code block.
// The standalone build keeps the same logic inline so it can run without a build step.

export const MERMAID_LANGUAGE = {
  id: 'mermaid',
  label: 'Mermaid',
  keywords:
    'flowchart graph sequenceDiagram classDiagram stateDiagram-v2 erDiagram journey gantt pie quadrantChart requirementDiagram gitGraph mindmap timeline sankey-beta xychart-beta block-beta packet-beta architecture-beta C4Context C4Container C4Component C4Dynamic subgraph end participant actor loop alt else opt par rect critical break note autonumber title section direction TB TD BT RL LR class classDef state click style linkStyle init true false',
};

let mermaidLoadPromise = null;
let renderSequence = 0;
const renderTokens = new Map();
const previewTimers = new Map();

function escapeHtml(value = '') {
  return String(value).replace(
    /[&<>'"]/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[c],
  );
}

export function highlightMermaid(code) {
  const keywordSet = new Set(MERMAID_LANGUAGE.keywords.split(/\s+/).filter(Boolean));
  const pattern =
    /%%\{[\s\S]*?\}%%|%%[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|==>|-->|-.->|---|--|==|-\.|\b\d+(?:\.\d+)?\b|\b[A-Za-z][\w-]*\b/g;
  let out = '',
    last = 0,
    match;

  while ((match = pattern.exec(String(code || '')))) {
    out += escapeHtml(code.slice(last, match.index));
    const token = match[0];
    let cls = '';
    if (token.startsWith('%%{')) cls = 'directive';
    else if (token.startsWith('%%')) cls = 'comment';
    else if (/^[\'\"]/.test(token)) cls = 'string';
    else if (/^\d/.test(token)) cls = 'number';
    else if (/^(?:==>|-->|-.->|---|--|==|-\.)$/.test(token)) cls = 'operator';
    else if (keywordSet.has(token)) cls = 'keyword';
    else if (/^[A-Z][A-Za-z0-9_-]*$/.test(token)) cls = 'type';

    out += cls ? `<span class="code-token ${cls}">${escapeHtml(token)}</span>` : escapeHtml(token);
    last = pattern.lastIndex;
  }

  return out + escapeHtml(String(code || '').slice(last));
}

export function ensureMermaidLibrary() {
  if (mermaidLoadPromise) return mermaidLoadPromise;

  mermaidLoadPromise = import('https://cdn.jsdelivr.net/npm/mermaid@12/dist/mermaid.esm.min.mjs')
    .then((module) => {
      const api = module.default || module;
      api.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'dark',
        suppressErrorRendering: true,
        fontFamily: 'Inter, system-ui, sans-serif',
      });
      return api;
    })
    .catch((error) => {
      mermaidLoadPromise = null;
      throw new Error(`Could not load Mermaid: ${error?.message || error}`);
    });

  return mermaidLoadPromise;
}

export function mermaidErrorMessage(error) {
  const message = String(error?.message || error || 'Invalid Mermaid diagram')
    .replace(/\s+/g, ' ')
    .trim();

  if (/Could not load Mermaid|failed to initialize/i.test(message)) {
    return 'Mermaid preview is unavailable. Check your internet connection.';
  }
  return `Diagram error: ${message.slice(0, 220)}`;
}

export async function renderMermaidPreview({ blockId, source, row, preview }) {
  if (!preview || preview.classList.contains('hidden') || !row?.isConnected) return;

  const renderTarget = preview.querySelector('[data-mermaid-render]');
  const status = preview.querySelector('[data-mermaid-status]');
  if (!renderTarget || !status) return;

  const text = String(source || '').trim();
  const token = Symbol(blockId);
  renderTokens.set(blockId, token);
  renderTarget.replaceChildren();

  if (!text) {
    status.textContent = 'Write Mermaid syntax to preview the diagram.';
    status.classList.remove('hidden', 'error');
    return;
  }

  status.textContent = 'Rendering diagram…';
  status.classList.remove('hidden', 'error');

  try {
    const api = await ensureMermaidLibrary();
    if (renderTokens.get(blockId) !== token || !row.isConnected) return;

    const renderId = `${APP_ID}-mermaid-${++renderSequence}`;
    const result = await api.render(renderId, text);
    if (renderTokens.get(blockId) !== token || !row.isConnected) return;

    renderTarget.innerHTML = result.svg;
    if (typeof result.bindFunctions === 'function') result.bindFunctions(renderTarget);
    status.classList.add('hidden');
  } catch (error) {
    if (renderTokens.get(blockId) !== token || !row.isConnected) return;
    renderTarget.replaceChildren();
    status.textContent = mermaidErrorMessage(error);
    status.classList.add('error');
    status.classList.remove('hidden');
  }
}

export function scheduleMermaidPreview({ blockId, source, row, preview, delay = 320 }) {
  clearTimeout(previewTimers.get(blockId));
  previewTimers.set(
    blockId,
    setTimeout(() => {
      previewTimers.delete(blockId);
      if (row?.isConnected) renderMermaidPreview({ blockId, source, row, preview });
    }, delay),
  );
}

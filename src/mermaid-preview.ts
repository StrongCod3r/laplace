// @ts-nocheck
import { APP_ID } from './app-identity';
import { renderMermaidSvg } from './features/code/services/mermaid-renderer';
export { ensureMermaidLibrary } from './features/code/services/mermaid-renderer';
// Mermaid syntax support rendered with bundled Pele.

export const MERMAID_LANGUAGE = {
  id: 'mermaid',
  label: 'Mermaid',
  keywords:
    'flowchart graph sequenceDiagram classDiagram stateDiagram-v2 erDiagram journey gantt pie quadrantChart requirementDiagram gitGraph mindmap timeline sankey-beta xychart-beta block-beta packet-beta architecture-beta C4Context C4Container C4Component C4Dynamic subgraph end participant actor loop alt else opt par rect critical break note autonumber title section direction TB TD BT RL LR class classDef state click style linkStyle init true false',
};

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

export function mermaidErrorMessage(error) {
  const message = String(error?.message || error || 'Invalid Mermaid diagram')
    .replace(/\s+/g, ' ')
    .trim();

  if (/Could not load the diagram renderer/i.test(message)) {
    return 'Diagram preview is unavailable. Reload the app to try again.';
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
    if (renderTokens.get(blockId) !== token || !row.isConnected) return;

    const renderId = `${APP_ID}-mermaid-${++renderSequence}`;
    const svg = await renderMermaidSvg(text, renderId, preview);
    if (renderTokens.get(blockId) !== token || !row.isConnected) return;

    renderTarget.replaceChildren(svg);
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

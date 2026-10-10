export type MarkdownTypingTrigger = 'input' | 'space' | 'enter';

export interface MarkdownBlockShortcut {
  type: string;
  prefixLength: number;
  prefixText?: string;
  checked?: boolean;
  indent?: number;
  language?: string;
}

export function markdownBlockShortcut(
  text: string,
  currentType: string,
  trigger: MarkdownTypingTrigger,
): MarkdownBlockShortcut | null {
  const source = (trigger === 'space' ? text + ' ' : text).replace(/\u00a0/g, ' ');
  if (source.includes('\n')) return null;
  if (currentType === 'text' && (trigger !== 'input' || /[ \t]$/.test(source))) {
    const fence = source.match(/^ {0,3}(?:`{3,}|~{3,})([\w#+.-]*)\s*$/);
    if (fence) return { type: 'code', prefixLength: source.length, language: fence[1] };
    if (/^ {0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(source))
      return { type: 'divider', prefixLength: source.length };
  }
  if (currentType === 'text' || currentType === 'quote') {
    const callout = source.match(
      currentType === 'quote' ? /^\[!([a-z]+)\][ \t]+/i : /^ {0,3}>[ \t]*\[!([a-z]+)\][ \t]+/i,
    );
    if (callout)
      return {
        type: 'callout',
        prefixLength: callout[0].length,
        prefixText: callout[1][0].toUpperCase() + callout[1].slice(1).toLowerCase() + ': ',
      };
  }
  if (currentType === 'text' || currentType === 'bullet') {
    const todo = source.match(
      currentType === 'bullet' ? /^\[([ xX]?)\][ \t]+/ : /^(\s*)(?:[-+*][ \t]+)?\[([ xX]?)\][ \t]+/,
    );
    if (todo)
      return {
        type: 'todo',
        prefixLength: todo[0].length,
        checked: (currentType === 'bullet' ? todo[1] : todo[2]).toLowerCase() === 'x',
        ...(currentType === 'text'
          ? { indent: Math.min(8, Math.floor(todo[1].replace(/\t/g, '  ').length / 2)) }
          : {}),
      };
  }
  if (currentType !== 'text') return null;
  const heading = source.match(/^ {0,3}(#{1,6})[ \t]+/);
  if (heading)
    return { type: `h${Math.min(3, heading[1].length)}`, prefixLength: heading[0].length };
  const quote = source.match(/^ {0,3}>[ \t]+/);
  if (quote) return { type: 'quote', prefixLength: quote[0].length };
  const list = source.match(/^([ \t]*)([-+*]|\d+[.)])[ \t]+/);
  if (list)
    return {
      type: /^\d/.test(list[2]) ? 'number' : 'bullet',
      prefixLength: list[0].length,
      indent: Math.min(8, Math.floor(list[1].replace(/\t/g, '  ').length / 2)),
    };
  return null;
}

export interface MarkdownInlineShortcut {
  start: number;
  end: number;
  contentStart: number;
  text: string;
  formats: string[];
  url?: string;
}

function escapedAt(text: string, offset: number) {
  let count = 0;
  while (offset > 0 && text[--offset] === '\\') count++;
  return count % 2 === 1;
}

export function markdownInlineShortcut(text: string, caret: number): MarkdownInlineShortcut | null {
  const prefix = text.slice(0, caret);
  const underline = prefix.match(/<u>([^\n]+)<\/u>$/i);
  if (underline) {
    const start = caret - underline[0].length;
    if (!escapedAt(text, start))
      return {
        start,
        end: caret,
        contentStart: start + 3,
        text: underline[1],
        formats: ['underline'],
      };
  }
  const link = prefix.match(/\[([^\[\]\n]+)\]\(([^\s()]+)\)$/);
  if (link) {
    const start = caret - link[0].length;
    if (!escapedAt(text, start) && text[start - 1] !== '!')
      return {
        start,
        end: caret,
        contentStart: start + 1,
        text: link[1],
        formats: [],
        url: link[2],
      };
  }
  const markers: Array<[string, string[]]> = [
    ['***', ['bold', 'italic']],
    ['___', ['bold', 'italic']],
    ['**', ['bold']],
    ['__', ['bold']],
    ['~~', ['strike']],
    ['==', ['background']],
    ['`', ['code']],
    ['*', ['italic']],
    ['_', ['italic']],
  ];
  for (const [marker, formats] of markers) {
    if (!prefix.endsWith(marker)) continue;
    const close = caret - marker.length;
    const start = prefix.lastIndexOf(marker, close - marker.length - 1);
    if (start < 0 || escapedAt(text, start) || escapedAt(text, close)) continue;
    if (text[start - 1] === marker[0] || text[start + marker.length] === marker[0]) continue;
    if (marker[0] === '_' && /[\p{L}\p{N}]/u.test(text[start - 1] || '')) continue;
    const inner = text.slice(start + marker.length, close);
    if (!inner.trim() || inner.includes('\n') || inner !== inner.trim()) continue;
    return { start, end: caret, contentStart: start + marker.length, text: inner, formats };
  }
  return null;
}

// Preserve existing links and styles while removing the Markdown punctuation.
export function markdownShortcutOffset(offset: number, shortcut: MarkdownInlineShortcut) {
  if (offset <= shortcut.start) return offset;
  if (offset >= shortcut.end)
    return offset + shortcut.text.length - (shortcut.end - shortcut.start);
  return (
    shortcut.start + Math.max(0, Math.min(shortcut.text.length, offset - shortcut.contentStart))
  );
}

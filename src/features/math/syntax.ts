export interface InlineMath {
  start: number;
  end: number;
  source: string;
}

/** Code editors may contain a complete Markdown display formula. */
export function displayMathSource(source: string): string {
  const trimmed = source.trim();
  for (const [opening, closing] of [
    ['$$', '$$'],
    ['\\[', '\\]'],
  ]) {
    if (trimmed.length < opening.length + closing.length) continue;
    const end = trimmed.length - closing.length;
    if (trimmed.startsWith(opening) && trimmed.endsWith(closing) && !escapedAt(trimmed, end))
      return trimmed.slice(opening.length, end).trim();
  }
  return source;
}

function escapedAt(text: string, index: number): boolean {
  let count = 0;
  while (index > 0 && text[--index] === '\\') count++;
  return count % 2 === 1;
}

/** Keep delimiters in the document so editing, selection and Markdown share offsets. */
export function inlineMathAt(text: string, start: number): InlineMath | null {
  const parens = text.startsWith('\\(', start);
  if (!parens && (text[start] !== '$' || text[start - 1] === '$' || text[start + 1] === '$'))
    return null;
  if (escapedAt(text, start)) return null;
  const openingLength = parens ? 2 : 1;
  const contentStart = start + openingLength;
  if (!parens && /\s/.test(text[contentStart] || ' ')) return null;
  for (let index = contentStart; index < text.length && text[index] !== '\n'; index++) {
    if (escapedAt(text, index)) continue;
    if (text[index] === '`') return null;
    if (parens ? text.startsWith('\\)', index) : text[index] === '$') {
      if (index === contentStart || (!parens && /\s/.test(text[index - 1]))) return null;
      if (!parens && (text[index + 1] === '$' || /\d/.test(text[index + 1] || ''))) return null;
      return {
        start,
        end: index + openingLength,
        source: text.slice(contentStart, index),
      };
    }
  }
  return null;
}

export function inlineMathRanges(text: string): InlineMath[] {
  const ranges: InlineMath[] = [];
  for (let index = 0; index < text.length; index++) {
    // Literal inline code must never become a formula.
    if (text[index] === '`' && !escapedAt(text, index)) {
      const marker = text.slice(index).match(/^`+/)![0];
      const closing = text.indexOf(marker, index + marker.length);
      if (closing >= 0) {
        index = closing + marker.length - 1;
        continue;
      }
    }
    const math = inlineMathAt(text, index);
    if (math) {
      ranges.push(math);
      index = math.end - 1;
    }
  }
  return ranges;
}

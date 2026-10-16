export interface SlashToken {
  start: number;
  end: number;
  query: string;
}

/** A slash command starts at a word boundary, never inside a URL or file path. */
export function slashTokenAtCaret(text: string, caret: number): SlashToken | null {
  const end = Math.max(0, Math.min(text.length, caret));
  if (!end) return null;
  const start = text.lastIndexOf('/', end - 1);
  if (start < 0 || (start > 0 && !/\s/.test(text[start - 1]))) return null;
  const query = text.slice(start + 1, end);
  if (query.startsWith(' ') || !/^[\p{L}\p{N} -]*$/u.test(query)) return null;
  return { start, end, query };
}

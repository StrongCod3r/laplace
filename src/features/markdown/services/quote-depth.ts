import type { Block } from '@/features/workspace/types';

export function quoteDepth(block: Block): number {
  const depth = Number(block.quoteDepth);
  return Number.isFinite(depth) ? Math.max(1, Math.floor(depth)) : 1;
}

/** Keep earlier quote lines at their current depth when indenting a later line. */
export function splitQuoteAtLine(
  block: Block,
  lineStart: number,
  newId: string,
): [Block, Block] | null {
  const text = String(block.text || '');
  if (block.type !== 'quote' || lineStart <= 0 || text[lineStart - 1] !== '\n') return null;
  const head: Block = { ...block, text: text.slice(0, lineStart - 1) };
  const tail: Block = { ...block, id: newId, text: text.slice(lineStart) };
  for (const key of ['inlineLinks', 'inlineFormats', 'wikiLinks']) {
    const ranges = Array.isArray(block[key]) ? block[key] : [];
    for (const [target, start, end] of [
      [head, 0, lineStart - 1],
      [tail, lineStart, text.length],
    ] as const) {
      const clipped = ranges.flatMap((range) => {
        if (!range || typeof range.start !== 'number' || typeof range.end !== 'number') return [];
        const left = Math.max(start, range.start);
        const right = Math.min(end, range.end);
        return right > left ? [{ ...range, start: left - start, end: right - start }] : [];
      });
      if (clipped.length) target[key] = clipped;
      else delete target[key];
    }
  }
  return [head, tail];
}

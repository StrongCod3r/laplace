import type { Block } from '@/features/workspace/types';

/** Attach ordinary text to the preceding list item while retaining its inline metadata. */
export function attachListContinuation(previous: Block, continuation: Block): Block | null {
  if (!['bullet', 'number'].includes(previous.type) || continuation.type !== 'text') return null;
  const offset = String(previous.text || '').length + 1;
  const joined: Block = {
    ...previous,
    text: String(previous.text || '') + '\n' + String(continuation.text || ''),
  };
  for (const key of ['inlineLinks', 'inlineFormats', 'wikiLinks']) {
    const before = Array.isArray(previous[key]) ? previous[key] : [];
    const after = Array.isArray(continuation[key]) ? continuation[key] : [];
    const ranges = [
      ...before.map((range) => ({ ...range })),
      ...after.map((range) => ({ ...range, start: range.start + offset, end: range.end + offset })),
    ];
    if (ranges.length) joined[key] = ranges;
    else delete joined[key];
  }
  return joined;
}

/** Split a list's continuation into an ordinary text block without losing inline ranges. */
export function detachListContinuation(
  block: Block,
  lineStart: number,
  newId: string,
): [Block, Block] | null {
  const text = String(block.text || '');
  if (!['bullet', 'number'].includes(block.type) || lineStart <= 0 || text[lineStart - 1] !== '\n')
    return null;
  const head: Block = { ...block, text: text.slice(0, lineStart - 1) };
  const tail: Block = { id: newId, type: 'text', text: text.slice(lineStart) };
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

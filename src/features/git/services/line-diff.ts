export interface DiffLine {
  kind: 'equal' | 'added' | 'removed';
  text: string;
  beforeLine?: number;
  afterLine?: number;
}

interface Edit {
  kind: DiffLine['kind'];
  text: string;
}

function middleDiff(before: string[], after: string[]): Edit[] {
  const frontier = new Map<number, number>([[1, 0]]);
  const trace: Map<number, number>[] = [];
  // Bound memory and work for completely rewritten files; common prefixes/suffixes
  // are already removed, and the fallback still preserves all added/deleted text.
  const limit = Math.min(before.length + after.length, 600);
  for (let distance = 0; distance <= limit; distance++) {
    trace.push(new Map(frontier));
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      let x =
        diagonal === -distance ||
        (diagonal !== distance &&
          (frontier.get(diagonal - 1) ?? -1) < (frontier.get(diagonal + 1) ?? -1))
          ? (frontier.get(diagonal + 1) ?? 0)
          : (frontier.get(diagonal - 1) ?? 0) + 1;
      let y = x - diagonal;
      while (x < before.length && y < after.length && before[x] === after[y]) {
        x++;
        y++;
      }
      frontier.set(diagonal, x);
      if (x < before.length || y < after.length) continue;
      const result: Edit[] = [];
      for (let step = trace.length - 1; step >= 0; step--) {
        const previous = trace[step];
        const k = x - y;
        const previousK =
          k === -step || (k !== step && (previous.get(k - 1) ?? -1) < (previous.get(k + 1) ?? -1))
            ? k + 1
            : k - 1;
        const previousX = previous.get(previousK) ?? 0;
        const previousY = previousX - previousK;
        while (x > previousX && y > previousY) {
          result.push({ kind: 'equal', text: before[--x] });
          y--;
        }
        if (!step) break;
        if (x === previousX) result.push({ kind: 'added', text: after[--y] });
        else result.push({ kind: 'removed', text: before[--x] });
      }
      return result.reverse();
    }
  }
  return [
    ...before.map((text): Edit => ({ kind: 'removed', text })),
    ...after.map((text): Edit => ({ kind: 'added', text })),
  ];
}

export function diffLines(before: string, after: string): DiffLine[] {
  // Keep the terminating newline in each token so EOF-only changes are visible.
  const a = before.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const b = after.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  )
    suffix++;
  const edits: Edit[] = [
    ...a.slice(0, prefix).map((text): Edit => ({ kind: 'equal', text })),
    ...middleDiff(a.slice(prefix, a.length - suffix), b.slice(prefix, b.length - suffix)),
    ...a.slice(a.length - suffix).map((text): Edit => ({ kind: 'equal', text })),
  ];
  let beforeLine = 1;
  let afterLine = 1;
  return edits.map((edit) => ({
    ...edit,
    ...(edit.kind !== 'added' ? { beforeLine: beforeLine++ } : {}),
    ...(edit.kind !== 'removed' ? { afterLine: afterLine++ } : {}),
  }));
}

export interface DiffRow {
  before?: DiffLine;
  after?: DiffLine;
  changed: boolean;
}

export function splitDiffRows(lines: DiffLine[]): DiffRow[] {
  const rows: DiffRow[] = [];
  for (let i = 0; i < lines.length;) {
    if (lines[i].kind === 'equal') {
      rows.push({ before: lines[i], after: lines[i], changed: false });
      i++;
      continue;
    }
    const removed: DiffLine[] = [];
    const added: DiffLine[] = [];
    while (i < lines.length && lines[i].kind !== 'equal') {
      const line = lines[i++];
      (line.kind === 'removed' ? removed : added).push(line);
    }
    for (let j = 0; j < Math.max(removed.length, added.length); j++)
      rows.push({ before: removed[j], after: added[j], changed: true });
  }
  return rows;
}

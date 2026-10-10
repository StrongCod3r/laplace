import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from '@/shared/components/Icon';
import { useWorkspaceStore } from '@/store/workspace.store';
import { comparisonLabels, type GitDiffDocument } from '../types';
import { diffLines, splitDiffRows, type DiffLine } from '../services/line-diff';
import styles from './GitDiffView.module.css';

function LineText({ line }: { line: DiffLine }) {
  return (
    <code className={styles.lineText}>
      {line.text.replace(/\r?\n$/, '') || ' '}
      {!line.text.endsWith('\n') && <span className={styles.eof}>No newline at end of file</span>}
    </code>
  );
}

export function GitDiffView({ document }: { document: GitDiffDocument }) {
  const root = useRef<HTMLElement>(null);
  const [split, setSplit] = useState(true);
  const [expanded, setExpanded] = useState(new Set<number>());
  const [selected, setSelected] = useState(-1);
  const lines = useMemo(
    () => document.lines ?? diffLines(document.before, document.after),
    [document.lines, document.before, document.after],
  );
  const rows = useMemo(
    () =>
      split
        ? splitDiffRows(lines)
        : lines.map((line) => ({
            before: line.kind !== 'added' ? line : undefined,
            after: line.kind !== 'removed' ? line : undefined,
            changed: line.kind !== 'equal',
          })),
    [lines, split],
  );
  const changes = useMemo(
    () => rows.flatMap((row, i) => (row.changed && !rows[i - 1]?.changed ? [i] : [])),
    [rows],
  );
  const visible = useMemo(() => {
    const indices = new Set(expanded);
    for (let i = 0; i < rows.length; i++)
      if (rows[i].changed)
        for (let j = Math.max(0, i - 3); j <= Math.min(rows.length - 1, i + 3); j++) indices.add(j);
    return indices;
  }, [rows, expanded]);
  const items: ({ index: number } | { start: number; end: number })[] = [];
  for (let i = 0; i < rows.length;) {
    if (visible.has(i)) {
      items.push({ index: i++ });
      continue;
    }
    const start = i;
    while (i < rows.length && !visible.has(i)) i++;
    items.push({ start, end: i });
  }
  const added = lines.filter((line) => line.kind === 'added').length;
  const removed = lines.filter((line) => line.kind === 'removed').length;
  const [beforeLabel, afterLabel] = comparisonLabels[document.comparison];
  const close = () => {
    useWorkspaceStore.getState().setGitDiff(null);
    requestAnimationFrame(() =>
      window.document.querySelector<HTMLElement>('#editorTabs [aria-selected="true"]')?.focus(),
    );
  };
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, []);
  function navigate(direction: number) {
    if (!changes.length) return;
    const next =
      selected < 0
        ? direction > 0
          ? 0
          : changes.length - 1
        : (selected + direction + changes.length) % changes.length;
    setSelected(next);
    root.current
      ?.querySelector(`[data-diff-row="${changes[next]}"]`)
      ?.scrollIntoView({ block: 'center' });
  }
  function setLayout(value: boolean) {
    setSplit(value);
    setExpanded(new Set());
    setSelected(-1);
  }

  return (
    <section
      id="gitDiffEditor"
      className={styles.editor}
      ref={root}
      tabIndex={-1}
      role="region"
      aria-label={`File comparison: ${document.path}`}
      aria-busy={document.state === 'loading'}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'w') {
          event.stopPropagation();
          event.preventDefault();
          close();
        }
        if (event.altKey && event.key === 'ArrowDown') {
          event.stopPropagation();
          event.preventDefault();
          navigate(1);
        }
        if (event.altKey && event.key === 'ArrowUp') {
          event.stopPropagation();
          event.preventDefault();
          navigate(-1);
        }
      }}
    >
      <header className={styles.toolbar}>
        <span className={styles.path} title={document.path}>
          {document.path}
        </span>
        {document.state === 'ready' && !document.binary && (
          <span
            className={styles.stats}
            aria-label={`${added} added lines, ${removed} removed lines`}
          >
            <span className={styles.added}>+{added}</span>
            <span className={styles.removed}>−{removed}</span>
          </span>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            aria-label="Split view"
            title="Split view"
            aria-pressed={split}
            onClick={() => setLayout(true)}
          >
            <Icon name="columns-2" size="16" />
          </button>
          <button
            type="button"
            aria-label="Unified view"
            title="Unified view"
            aria-pressed={!split}
            onClick={() => setLayout(false)}
          >
            <Icon name="list" size="16" />
          </button>
          <span className={styles.divider} />
          <button
            type="button"
            aria-label="Previous change"
            title="Previous change (Alt+Up)"
            disabled={!changes.length}
            onClick={() => navigate(-1)}
          >
            <Icon name="arrow-up" size="16" />
          </button>
          <button
            type="button"
            aria-label="Next change"
            title="Next change (Alt+Down)"
            disabled={!changes.length}
            onClick={() => navigate(1)}
          >
            <Icon name="arrow-down" size="16" />
          </button>
          <button
            type="button"
            aria-label="Close comparison editor"
            title="Close comparison (Ctrl/Cmd+W)"
            onClick={close}
          >
            <Icon name="x" size="16" />
          </button>
        </div>
      </header>
      {document.state === 'loading' ? (
        <p className={styles.message} role="status">
          Reading file…
        </p>
      ) : document.state === 'error' ? (
        <p className={styles.message} role="alert">
          {document.error}
        </p>
      ) : document.binary ? (
        <p className={styles.message}>
          This file is binary, uses an unsupported encoding, or is too large to compare.
        </p>
      ) : !changes.length ? (
        <p className={styles.message}>There are no text changes in this comparison.</p>
      ) : (
        <div className={styles.scroll}>
          <div className={`${styles.canvas} ${split ? styles.splitCanvas : ''}`}>
            <div className={`${styles.columnHeaders} ${split ? styles.split : ''}`}>
              {split ? (
                <>
                  <span>{beforeLabel}</span>
                  <span>{afterLabel}</span>
                </>
              ) : (
                <span>
                  {beforeLabel} → {afterLabel}
                </span>
              )}
            </div>
            {items.map((item) => {
              if ('start' in item)
                return (
                  <button
                    key={`gap-${item.start}`}
                    type="button"
                    className={styles.gap}
                    onClick={() =>
                      setExpanded((current) => {
                        const next = new Set(current);
                        for (let i = item.start; i < Math.min(item.end, item.start + 20); i++)
                          next.add(i);
                        return next;
                      })
                    }
                  >
                    Show more context ({item.end - item.start} unchanged lines)
                  </button>
                );
              const row = rows[item.index];
              if (split)
                return (
                  <div
                    key={item.index}
                    className={`${styles.row} ${styles.split}`}
                    data-diff-row={item.index}
                  >
                    {(['before', 'after'] as const).map((side) => {
                      const line = row[side];
                      return (
                        <div
                          className={`${styles.cell} ${line ? styles[line.kind] : styles.empty}`}
                          data-diff-kind={line?.kind}
                        >
                          <span className={styles.lineNumber} aria-hidden="true">
                            {side === 'before' ? line?.beforeLine : line?.afterLine}
                          </span>
                          <span className={styles.sign} aria-hidden="true">
                            {line?.kind === 'added' ? '+' : line?.kind === 'removed' ? '−' : ''}
                          </span>
                          {line && <LineText line={line} />}
                        </div>
                      );
                    })}
                  </div>
                );
              const line = row.before || row.after!;
              return (
                <div
                  key={item.index}
                  className={`${styles.cell} ${styles[line.kind]}`}
                  data-diff-row={item.index}
                  data-diff-kind={line.kind}
                >
                  <span className={styles.lineNumber} aria-hidden="true">
                    {line.beforeLine}
                  </span>
                  <span className={styles.lineNumber} aria-hidden="true">
                    {line.afterLine}
                  </span>
                  <span className={styles.sign} aria-hidden="true">
                    {line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ''}
                  </span>
                  <LineText line={line} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

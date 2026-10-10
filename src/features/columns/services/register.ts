// @ts-nocheck
// Existing editor algorithms, isolated behind the typed controller boundary.
import type { EditorRuntime } from '@/features/editor/types';

export function registerColumns(runtime: EditorRuntime) {
  function normalizeColumnsBlock(block) {
    if (
      !Array.isArray(block.columns) ||
      !block.columns.length ||
      typeof block.columns[0] === 'string'
    ) {
      block.columns = Array.from({ length: 2 }, () => ({
        id: runtime.uid('col'),
        blocks: [runtime.newTextBlock()],
      }));
    }
    block.columns = block.columns.slice(0, 4).map((col) => {
      const normalized = {
        id: col?.id || runtime.uid('col'),
        blocks: runtime.normalizeBlockTree(col?.blocks),
      };
      if (!normalized.blocks.length) normalized.blocks = [runtime.newTextBlock()];
      return normalized;
    });
    while (block.columns.length < 2)
      block.columns.push({ id: runtime.uid('col'), blocks: [runtime.newTextBlock()] });
    return block;
  }

  function columnsHTML(block, gutter) {
    runtime.normalizeColumnsBlock(block);
    const count = block.columns.length;
    const panes = block.columns
      .map((col, ci) =>
        runtime.htmlWithStyles(
          `<div class="column-pane" data-column-id="${col.id}" data-column-index="${ci}">${col.blocks.map((child, i) => runtime.blockHTML(child, i, col.blocks)).join('')}</div>`,
        ),
      )
      .join('');
    return runtime.htmlWithStyles(
      `<div class="block-row columns-block" data-block-id="${block.id}" data-type="columns">${gutter}<div class="columns-shell"><div class="columns-toolbar"><label>Columns <select data-columns-count aria-label="Column count">${[2, 3, 4].map((n) => `<option value="${n}" ${n === count ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div><div class="columns-grid" style="--column-count:${count}">${panes}</div></div></div>`,
    );
  }

  function setColumnsCount(block, count) {
    runtime.normalizeColumnsBlock(block);
    count = Math.max(2, Math.min(4, Number(count) || 2));
    if (count > block.columns.length) {
      while (block.columns.length < count)
        block.columns.push({ id: runtime.uid('col'), blocks: [runtime.newTextBlock()] });
      return;
    }
    if (count < block.columns.length) {
      const keep = block.columns.slice(0, count),
        removed = block.columns.slice(count);
      const target = keep[keep.length - 1];
      const moved = removed.flatMap((col) => col.blocks || []);
      const targetOnlyEmpty =
        target.blocks.length === 1 &&
        target.blocks[0].type === 'text' &&
        !(target.blocks[0].text || '');
      if (targetOnlyEmpty && moved.length) target.blocks.length = 0;
      target.blocks.push(...moved);
      if (!target.blocks.length) target.blocks.push(runtime.newTextBlock());
      block.columns = keep;
    }
  }

  Object.assign(runtime, { normalizeColumnsBlock, columnsHTML, setColumnsCount });
}

// @ts-nocheck
// Existing editor algorithms, isolated behind the typed controller boundary.
import type { EditorRuntime } from '@/features/editor/types';
import { inlineMathRanges } from '@/features/math/syntax';

export function registerTables(runtime: EditorRuntime) {
  function tableColumnAlignment(value) {
    return value === 'center' || value === 'right' ? value : 'left';
  }

  function normalizeSimpleTableBlock(block) {
    let rows = Array.isArray(block.tableRows) ? block.tableRows : null;
    if (!rows?.length) rows = Array.from({ length: 3 }, () => Array(3).fill(''));
    const cols = Math.max(1, ...rows.map((r) => (Array.isArray(r) ? r.length : 0)));
    block.tableRows = rows.map((r) => {
      const row = Array.isArray(r) ? r.map((v) => String(v ?? '')) : [];
      while (row.length < cols) row.push('');
      return row.slice(0, cols);
    });
    const inlineGrid = Array.isArray(block.tableCellInline) ? block.tableCellInline : [];
    block.tableCellInline = block.tableRows.map((row, ri) =>
      Array.from({ length: cols }, (_, ci) => {
        const cell = inlineGrid[ri]?.[ci];
        return cell && typeof cell === 'object' ? cell : null;
      }),
    );
    const alignments = Array.isArray(block.tableColumnAlignments)
      ? block.tableColumnAlignments
      : [];
    block.tableColumnAlignments = Array.from({ length: cols }, (_, i) =>
      tableColumnAlignment(alignments[i]),
    );
    if (typeof block.tableHeaderRow !== 'boolean') block.tableHeaderRow = false;
    if (typeof block.tableHeaderColumn !== 'boolean') block.tableHeaderColumn = false;
    return block;
  }

  function tableAxisHandleSvg(axis = 'row') {
    return runtime.iconMarkup(
      axis === 'column' ? 'grip-vertical' : 'grip-horizontal',
      '14px',
      'table-axis-handle-icon',
    );
  }

  function tableCellSelectionBounds(selection = runtime.tableCellSelection) {
    if (!selection?.start || !selection?.end) return null;
    return {
      top: Math.min(selection.start.row, selection.end.row),
      bottom: Math.max(selection.start.row, selection.end.row),
      left: Math.min(selection.start.col, selection.end.col),
      right: Math.max(selection.start.col, selection.end.col),
    };
  }

  function isTableCellInSelection(blockId, row, col) {
    if (!runtime.tableCellSelection?.active || runtime.tableCellSelection.blockId !== blockId)
      return false;
    const bounds = runtime.tableCellSelectionBounds();
    return (
      !!bounds &&
      row >= bounds.top &&
      row <= bounds.bottom &&
      col >= bounds.left &&
      col <= bounds.right
    );
  }

  function simpleTableHTML(block, gutter) {
    runtime.normalizeSimpleTableBlock(block);
    const rows = block.tableRows,
      colCount = rows[0]?.length || 1,
      selected = runtime.selectedTableBlockId === block.id;
    const body = rows
      .map((row, ri) =>
        runtime.htmlWithStyles(
          `<tr data-table-row="${ri}">${row
            .map((cell, ci) => {
              const header =
                (block.tableHeaderRow && ri === 0) || (block.tableHeaderColumn && ci === 0);
              const tag = header ? 'th' : 'td';
              const rangeSelected = runtime.isTableCellInSelection(block.id, ri, ci),
                rangeAnchor =
                  rangeSelected &&
                  runtime.tableCellSelection?.start?.row === ri &&
                  runtime.tableCellSelection?.start?.col === ci;
              const inline = block.tableCellInline[ri][ci] || {};
              return `<${tag} data-table-column="${ci}" style="text-align:${block.tableColumnAlignments[ci]}"><div class="simple-table-cell${rangeSelected ? ' cell-range-selected' : ''}${rangeAnchor ? ' cell-range-anchor' : ''}" contenteditable="true" spellcheck="true" data-table-cell="${ri}:${ci}">${runtime.inlineTextHTML({ ...inline, id: `${block.id}-cell-${ri}-${ci}`, type: 'text', text: cell })}</div></${tag}>`;
            })
            .join('')}</tr>`,
        ),
      )
      .join('');
    const colHandles = Array.from({ length: colCount }, (_, ci) =>
      runtime.htmlWithStyles(
        `<button type="button" class="table-axis-handle table-col-handle" draggable="true" data-table-col-menu="${ci}" title="Drag to reorder · click for column options" aria-label="Column ${ci + 1}: drag to reorder or click for options">${runtime.tableAxisHandleSvg('column')}</button>`,
      ),
    ).join('');
    const rowHandles = rows
      .map((_, ri) =>
        runtime.htmlWithStyles(
          `<button type="button" class="table-axis-handle table-row-handle" draggable="true" data-table-row-menu="${ri}" title="Drag to reorder · click for row options" aria-label="Row ${ri + 1}: drag to reorder or click for options">${runtime.tableAxisHandleSvg('row')}</button>`,
        ),
      )
      .join('');
    return runtime.htmlWithStyles(
      `<div class="block-row simple-table-block${selected ? ' table-selected' : ''}" data-block-id="${block.id}" data-type="table">${gutter}<div class="simple-table-shell"><span class="simple-table-corner-hit" data-table-corner-select title="Select table" aria-label="Select entire table"></span><div class="simple-table-handle-layer" aria-hidden="false">${colHandles}${rowHandles}</div><div class="simple-table-scroll"><table class="simple-table"><colgroup>${Array.from({ length: colCount }, () => '<col>').join('')}</colgroup><tbody>${body}</tbody></table></div><button type="button" class="simple-table-add-column" data-table-add-col title="Add column" aria-label="Add column">${runtime.iconMarkup('plus', '14px')}</button><button type="button" class="simple-table-add-row" data-table-add-row title="Add row" aria-label="Add row">${runtime.iconMarkup('plus', '14px')}</button></div></div>`,
    );
  }

  function syncSimpleTableHandles(tableBlock) {
    if (!tableBlock?.isConnected) return;
    const shell = tableBlock.querySelector('.simple-table-shell');
    const scroll = tableBlock.querySelector('.simple-table-scroll');
    if (!shell || !scroll) return;
    const shellRect = shell.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    const firstRow = tableBlock.querySelector('tr[data-table-row="0"]');
    const cells = firstRow ? [...firstRow.querySelectorAll('[data-table-column]')] : [];
    cells.forEach((cell) => {
      const ci = Number(cell.dataset.tableColumn),
        handle = tableBlock.querySelector(`[data-table-col-menu="${ci}"]`);
      if (!handle) return;
      const rect = cell.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2 - shellRect.left;
      const topLine = scrollRect.top - shellRect.top;
      handle.style.left = `${centerX}px`;
      handle.style.top = `${topLine}px`;
      const visible = rect.right > scrollRect.left + 1 && rect.left < scrollRect.right - 1;
      handle.style.visibility = visible ? 'visible' : 'hidden';
    });
    tableBlock.querySelectorAll('tr[data-table-row]').forEach((row) => {
      const ri = Number(row.dataset.tableRow),
        handle = tableBlock.querySelector(`[data-table-row-menu="${ri}"]`);
      if (!handle) return;
      const rect = row.getBoundingClientRect();
      const leftLine = scrollRect.left - shellRect.left;
      const centerY = rect.top + rect.height / 2 - shellRect.top;
      handle.style.left = `${leftLine}px`;
      handle.style.top = `${centerY}px`;
      const visible = rect.bottom > scrollRect.top + 1 && rect.top < scrollRect.bottom - 1;
      handle.style.visibility = visible ? 'visible' : 'hidden';
    });
    const addColumn = tableBlock.querySelector('[data-table-add-col]');
    const table = tableBlock.querySelector('.simple-table');
    if (addColumn && table) {
      const tableRect = table.getBoundingClientRect();
      addColumn.style.left = `${tableRect.right - shellRect.left}px`;
      addColumn.style.top = `${scrollRect.top - shellRect.top}px`;
      addColumn.style.height = `${scrollRect.height}px`;
      const rightEdgeVisible =
        tableRect.right >= scrollRect.left - 1 && tableRect.right <= scrollRect.right + 1;
      addColumn.style.visibility = rightEdgeVisible ? 'visible' : 'hidden';
    }
  }

  function syncAllSimpleTableHandles() {
    document
      .querySelectorAll('.simple-table-block[data-block-id]')
      .forEach(runtime.syncSimpleTableHandles);
  }

  function setSimpleTableHandleHover(tableBlock, row = null, col = null) {
    if (!tableBlock) {
      document
        .querySelectorAll('.table-axis-handle.hover-visible')
        .forEach((el) => el.classList.remove('hover-visible'));
      runtime.simpleTableHandleHover = { blockId: null, row: null, col: null };
      return;
    }
    const blockId = tableBlock.dataset.blockId || null;
    if (
      runtime.simpleTableHandleHover.blockId === blockId &&
      runtime.simpleTableHandleHover.row === row &&
      runtime.simpleTableHandleHover.col === col
    )
      return;
    document
      .querySelectorAll('.table-axis-handle.hover-visible')
      .forEach((el) => el.classList.remove('hover-visible'));
    if (Number.isInteger(row))
      tableBlock.querySelector(`[data-table-row-menu="${row}"]`)?.classList.add('hover-visible');
    if (Number.isInteger(col))
      tableBlock.querySelector(`[data-table-col-menu="${col}"]`)?.classList.add('hover-visible');
    runtime.simpleTableHandleHover = { blockId, row, col };
  }

  function onSimpleTableHandlePointerMove(e) {
    const handle = e.target.closest?.('.table-axis-handle');
    if (handle) {
      const tableBlock = handle.closest('.simple-table-block[data-block-id]');
      const row =
        handle.dataset.tableRowMenu !== undefined ? Number(handle.dataset.tableRowMenu) : null;
      const col =
        handle.dataset.tableColMenu !== undefined ? Number(handle.dataset.tableColMenu) : null;
      runtime.setSimpleTableHandleHover(
        tableBlock,
        Number.isInteger(row) ? row : null,
        Number.isInteger(col) ? col : null,
      );
      return;
    }
    const cell = e.target.closest?.('[data-table-cell]');
    if (cell) {
      const tableBlock = cell.closest('.simple-table-block[data-block-id]');
      const pos = runtime.tableCellCoordinates(cell);
      runtime.setSimpleTableHandleHover(tableBlock, pos?.row ?? null, pos?.col ?? null);
      return;
    }
    const tableBlock = e.target.closest?.('.simple-table-block[data-block-id]');
    if (tableBlock) {
      runtime.setSimpleTableHandleHover(tableBlock, null, null);
      return;
    }
    runtime.setSimpleTableHandleHover(null);
  }

  function tableCellCoordinates(cell) {
    if (!cell?.matches?.('[data-table-cell]')) return null;
    const [row, col] = String(cell.dataset.tableCell || '')
      .split(':')
      .map(Number);
    return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null;
  }

  function tableCellInlineBlock(block, row, col, text = block?.tableRows?.[row]?.[col]) {
    runtime.normalizeSimpleTableBlock(block);
    return {
      ...(block.tableCellInline[row]?.[col] || {}),
      id: `${block.id}-cell-${row}-${col}`,
      type: 'text',
      text: String(text ?? ''),
    };
  }

  function setTableCellInline(block, row, col, inline) {
    runtime.normalizeSimpleTableBlock(block);
    const cell = {};
    if (inline?.inlineFormats?.length) cell.inlineFormats = inline.inlineFormats;
    if (inline?.inlineLinks?.length) cell.inlineLinks = inline.inlineLinks;
    if (inline?.wikiLinks?.length) cell.wikiLinks = inline.wikiLinks;
    if (Object.keys(cell).length) block.tableCellInline[row][col] = cell;
    else block.tableCellInline[row][col] = null;
  }

  function syncTableCellInlineFromContent(block, row, col, content, text) {
    runtime.setTableCellInline(block, row, col, {
      inlineFormats: runtime.inlineFormatsFromContent(content, text),
      inlineLinks: runtime.inlineLinksFromContent(content, text),
    });
  }

  function clearTableCellSelection() {
    if (runtime.tableCellSelection?.dragging) {
      window.removeEventListener('mousemove', runtime.onTableCellSelectionMove, true);
      window.removeEventListener('mouseup', runtime.onTableCellSelectionEnd, true);
    }
    runtime.tableCellSelection = null;
    document.body.classList.remove('table-cell-selecting');
    document
      .querySelectorAll(
        '.simple-table-cell.cell-range-selected,.simple-table-cell.cell-range-anchor',
      )
      .forEach((cell) => cell.classList.remove('cell-range-selected', 'cell-range-anchor'));
  }

  function renderTableCellSelection() {
    document
      .querySelectorAll(
        '.simple-table-cell.cell-range-selected,.simple-table-cell.cell-range-anchor',
      )
      .forEach((cell) => cell.classList.remove('cell-range-selected', 'cell-range-anchor'));
    const selection = runtime.tableCellSelection;
    if (!selection?.active) return;
    const bounds = runtime.tableCellSelectionBounds(selection);
    if (!bounds) return;
    const row = document.querySelector(`.simple-table-block[data-block-id="${selection.blockId}"]`);
    if (!row) return;
    row.querySelectorAll('[data-table-cell]').forEach((cell) => {
      const point = runtime.tableCellCoordinates(cell);
      if (!point) return;
      if (
        point.row >= bounds.top &&
        point.row <= bounds.bottom &&
        point.col >= bounds.left &&
        point.col <= bounds.right
      ) {
        cell.classList.add('cell-range-selected');
        if (point.row === selection.start.row && point.col === selection.start.col)
          cell.classList.add('cell-range-anchor');
      }
    });
  }

  function beginTableCellSelection(e, cell) {
    const row = cell?.closest?.('.simple-table-block'),
      blockId = row?.dataset.blockId,
      start = runtime.tableCellCoordinates(cell);
    if (!blockId || !start) return false;
    runtime.clearTableCellSelection();
    runtime.clearSelectedTable();
    runtime.clearMultiBlockSelection();
    runtime.tableCellSelection = {
      blockId,
      start,
      end: start,
      active: false,
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
    };
    runtime.lifecycle.listen(window, 'mousemove', runtime.onTableCellSelectionMove, true);
    runtime.lifecycle.listen(window, 'mouseup', runtime.onTableCellSelectionEnd, true);
    return true;
  }

  function onTableCellSelectionMove(e) {
    const selection = runtime.tableCellSelection;
    if (!selection?.dragging) return;
    if (!(e.buttons & 1)) {
      runtime.onTableCellSelectionEnd(e);
      return;
    }
    const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-table-cell]');
    if (!cell || cell.closest('.simple-table-block')?.dataset.blockId !== selection.blockId) return;
    const end = runtime.tableCellCoordinates(cell);
    if (!end) return;
    const crossed = end.row !== selection.start.row || end.col !== selection.start.col;
    const moved = Math.hypot(e.clientX - selection.startX, e.clientY - selection.startY) > 4;
    if (!selection.active && !(crossed && moved)) return;
    selection.active = true;
    selection.end = end;
    document.body.classList.add('table-cell-selecting');
    e.preventDefault();
    try {
      window.getSelection()?.removeAllRanges();
    } catch {}
    runtime.renderTableCellSelection();
  }

  function onTableCellSelectionEnd(e) {
    const selection = runtime.tableCellSelection;
    if (!selection) return;
    window.removeEventListener('mousemove', runtime.onTableCellSelectionMove, true);
    window.removeEventListener('mouseup', runtime.onTableCellSelectionEnd, true);
    selection.dragging = false;
    document.body.classList.remove('table-cell-selecting');
    if (!selection.active) {
      runtime.tableCellSelection = null;
      return;
    }
    const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-table-cell]');
    if (cell && cell.closest('.simple-table-block')?.dataset.blockId === selection.blockId) {
      const end = runtime.tableCellCoordinates(cell);
      if (end) selection.end = end;
    }
    e.preventDefault?.();
    try {
      window.getSelection()?.removeAllRanges();
    } catch {}
    runtime.renderTableCellSelection();
  }

  function selectedTableCellMatrix() {
    const selection = runtime.tableCellSelection;
    if (!selection?.active) return null;
    const block = runtime.findBlock(selection.blockId);
    if (block?.type !== 'table') return null;
    runtime.normalizeSimpleTableBlock(block);
    const bounds = runtime.tableCellSelectionBounds(selection);
    if (!bounds) return null;
    const rows = [];
    for (let r = bounds.top; r <= Math.min(bounds.bottom, block.tableRows.length - 1); r++)
      rows.push(block.tableRows[r].slice(bounds.left, bounds.right + 1));
    return { block, bounds, rows };
  }

  function tableMatrixMarkdown(rows, alignments = [], cellInline = [], workspace = {}, paths) {
    if (!rows?.length) return '';
    const cols = Math.max(1, ...rows.map((row) => row.length));
    const line = (row, ri) =>
      `| ${Array.from({ length: cols }, (_, i) => {
        const value = String(row?.[i] ?? '');
        const inline = cellInline?.[ri]?.[i];
        return inline || inlineMathRanges(value).length
          ? runtime.markdownInlineForBlock({ ...inline, text: value }, workspace, paths, {
              tableCell: true,
            })
          : runtime.markdownTableCell(value);
      }).join(' | ')} |`;
    return [
      line(rows[0], 0),
      `| ${Array.from({ length: cols }, (_, i) => {
        const alignment = tableColumnAlignment(alignments[i]);
        return alignment === 'center' ? ':---:' : alignment === 'right' ? '---:' : '---';
      }).join(' | ')} |`,
      ...rows.slice(1).map((row, index) => line(row, index + 1)),
    ].join('\n');
  }

  function tableMatrixTsv(rows) {
    const encode = (value) => {
      const text = String(value ?? '');
      return /[\t\r\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return rows.map((row) => row.map(encode).join('\t')).join('\n');
  }

  function tableMatrixHtml(rows, alignments = [], cellInline = []) {
    return `<table>${rows.map((row, ri) => `<tr>${row.map((cell, ci) => `<td style="text-align:${tableColumnAlignment(alignments[ci])}">${runtime.tableCellClipboardHtml(cell, cellInline?.[ri]?.[ci])}</td>`).join('')}</tr>`).join('')}</table>`;
  }

  function tableCellClipboardHtml(text, inline = {}) {
    return runtime
      .inlineTextHTML({ ...inline, id: 'clipboard-cell', type: 'text', text })
      .replace(/\r\n?|\n/g, '<br>');
  }

  function copySelectedTableCellsToClipboard(e) {
    const selected = runtime.selectedTableCellMatrix();
    if (!selected?.rows?.length) return false;
    const alignments = selected.block.tableColumnAlignments.slice(
      selected.bounds.left,
      selected.bounds.right + 1,
    );
    const inline = selected.block.tableCellInline
      .slice(selected.bounds.top, selected.bounds.bottom + 1)
      .map((row) => row.slice(selected.bounds.left, selected.bounds.right + 1));
    const markdown = runtime.tableMatrixMarkdown(selected.rows, alignments, inline),
      tsv = runtime.tableMatrixTsv(selected.rows);
    e?.preventDefault?.();
    e?.clipboardData?.setData?.('text/plain', tsv);
    e?.clipboardData?.setData?.('text/markdown', markdown);
    e?.clipboardData?.setData?.(
      'text/html',
      runtime.tableMatrixHtml(selected.rows, alignments, inline),
    );
    return true;
  }

  function htmlTableCellText(cell) {
    return runtime.richHtmlInlinePayload(cell, { tableCell: true }).text;
  }

  function tableMatrixFromHtml(html) {
    const source = String(html || '');
    if (!/<table[\s>]/i.test(source)) return null;
    try {
      const doc = new DOMParser().parseFromString(source, 'text/html'),
        table = doc.querySelector('table');
      if (!table) return null;
      const rows = [...table.querySelectorAll('tr')]
        .map((row) =>
          [...row.children]
            .filter((cell) => /^(TD|TH)$/.test(cell.tagName))
            .map((cell) => runtime.richHtmlInlinePayload(cell, { tableCell: true })),
        )
        .filter((row) => row.length);
      if (!rows.length) return null;
      const cols = Math.max(...rows.map((row) => row.length));
      return rows.map((row) =>
        Array.from({ length: cols }, (_, i) => row[i] || { text: '', links: [], formats: [] }),
      );
    } catch {
      return null;
    }
  }

  function tableMatrixFromTsv(text) {
    const source = String(text ?? '').replace(/\r\n?/g, '\n');
    if (!source || (!source.includes('\t') && !source.includes('\n'))) return null;
    const rows = [],
      row = [];
    let cell = '',
      quoted = false,
      hasColumnSeparator = false;
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (quoted) {
        if (ch === '"') {
          if (source[i + 1] === '"') {
            cell += '"';
            i++;
          } else quoted = false;
        } else cell += ch;
        continue;
      }
      if (ch === '"' && cell === '') {
        quoted = true;
        continue;
      }
      if (ch === '\t') {
        hasColumnSeparator = true;
        row.push(cell);
        cell = '';
        continue;
      }
      if (ch === '\n') {
        row.push(cell);
        rows.push(row.splice(0));
        cell = '';
        continue;
      }
      cell += ch;
    }
    row.push(cell);
    rows.push(row);
    if (
      rows.length > 1 &&
      rows.at(-1)?.length === 1 &&
      rows.at(-1)[0] === '' &&
      source.endsWith('\n')
    )
      rows.pop();
    if (!rows.length) return null;
    const cols = Math.max(...rows.map((r) => r.length));
    // Newlines alone belong to one cell; HTML tables identify single-column grids.
    if (!hasColumnSeparator) return null;
    return rows.map((r) => Array.from({ length: cols }, (_, i) => String(r[i] ?? '')));
  }

  function clipboardTableMatrix(data) {
    const htmlMatrix = runtime.tableMatrixFromHtml(data?.getData?.('text/html'));
    if (htmlMatrix?.length) return htmlMatrix;
    return runtime
      .tableMatrixFromTsv(data?.getData?.('text/plain'))
      ?.map((row) => row.map((text) => ({ text, links: [], formats: [] })));
  }

  function pasteTableMatrixIntoCell(cell, data) {
    const point = runtime.tableCellCoordinates(cell),
      row = cell?.closest?.('.simple-table-block'),
      block = runtime.findBlock(row?.dataset.blockId);
    if (!point || block?.type !== 'table') return false;
    const matrix = runtime.clipboardTableMatrix(data);
    if (!matrix?.length) return false;
    const width = Math.max(1, ...matrix.map((r) => r.length));
    const normalized = matrix.map((r) =>
      Array.from({ length: width }, (_, i) => r[i] || { text: '', links: [], formats: [] }),
    );
    runtime.normalizeSimpleTableBlock(block);
    const currentCols = block.tableRows[0]?.length || 1;
    const requiredCols = Math.max(currentCols, point.col + width),
      requiredRows = point.row + normalized.length;
    if (requiredCols > currentCols)
      block.tableRows.forEach((r) => {
        while (r.length < requiredCols) r.push('');
      });
    while (block.tableRows.length < requiredRows)
      block.tableRows.push(Array(requiredCols).fill(''));
    block.tableRows.forEach((r) => {
      while (r.length < requiredCols) r.push('');
    });
    runtime.normalizeSimpleTableBlock(block);
    normalized.forEach((sourceRow, ri) =>
      sourceRow.forEach((value, ci) => {
        block.tableRows[point.row + ri][point.col + ci] = value.text;
        const inline = {};
        if (value.formats?.length) inline.inlineFormats = value.formats;
        if (value.links?.length) inline.inlineLinks = value.links;
        block.tableCellInline[point.row + ri][point.col + ci] = Object.keys(inline).length
          ? inline
          : null;
      }),
    );

    runtime.clearSelectedTable();
    runtime.clearMultiBlockSelection();
    runtime.clearTableCellSelection();
    runtime.tableCellSelection = {
      blockId: block.id,
      start: { row: point.row, col: point.col },
      end: { row: point.row + normalized.length - 1, col: point.col + width - 1 },
      active: true,
      dragging: false,
      startX: 0,
      startY: 0,
    };
    runtime.scheduleSave();
    runtime.renderBlocks(runtime.currentPage());
    runtime.lifecycle.frame(() => {
      const target = document.querySelector(
        `.simple-table-block[data-block-id="${block.id}"] [data-table-cell="${point.row}:${point.col}"]`,
      );
      target?.focus();
      try {
        window.getSelection()?.removeAllRanges();
      } catch {}
      runtime.renderTableCellSelection();
    });
    return true;
  }

  function clearSelectedTableCells() {
    const selected = runtime.selectedTableCellMatrix();
    if (!selected) return false;
    for (let r = selected.bounds.top; r <= selected.bounds.bottom; r++) {
      for (let c = selected.bounds.left; c <= selected.bounds.right; c++)
        if (selected.block.tableRows[r] && c < selected.block.tableRows[r].length) {
          selected.block.tableRows[r][c] = '';
          selected.block.tableCellInline[r][c] = null;
        }
    }
    const id = selected.block.id,
      focus = { ...runtime.tableCellSelection.start };
    runtime.clearTableCellSelection();
    runtime.scheduleSave();
    runtime.renderBlocks(runtime.currentPage());
    runtime.focusSimpleTableCell(id, focus.row, focus.col);
    return true;
  }

  function clearSelectedTable() {
    if (!runtime.selectedTableBlockId) return;
    const row = document.querySelector(
      `.simple-table-block[data-block-id="${runtime.selectedTableBlockId}"]`,
    );
    row?.classList.remove('table-selected');
    runtime.selectedTableBlockId = null;
  }

  function selectSimpleTable(id) {
    const block = runtime.findBlock(id);
    if (block?.type !== 'table') return false;
    runtime.clearTableCellSelection();
    runtime.clearMultiBlockSelection();
    runtime.clearSelectedTable();
    runtime.selectedTableBlockId = id;
    try {
      window.getSelection()?.removeAllRanges();
    } catch {}
    const row = document.querySelector(`.simple-table-block[data-block-id="${id}"]`);
    row?.classList.add('table-selected');
    return true;
  }

  function deleteSelectedTable() {
    if (!runtime.selectedTableBlockId || runtime.workspaceAccess !== 'writable') return false;
    const location = runtime.findBlockLocation(runtime.selectedTableBlockId);
    const page = runtime.currentPage();
    if (!page || location?.block?.type !== 'table') return false;
    location.blocks.splice(location.index, 1);
    runtime.ensureBlockList(location.blocks);
    const next = location.blocks[Math.min(location.index, location.blocks.length - 1)];
    runtime.clearSelectedTable();
    runtime.clearTableCellSelection();
    runtime.scheduleSave();
    runtime.renderBlocks(page);
    runtime.focusBlock(next.id, 0, runtime.els.blockEditor);
    return true;
  }

  function markdownTableCell(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&#60;')
      .replace(/>/g, '&#62;')
      .replace(/\\/g, '\\\\')
      .replace(/\|/g, '\\|')
      .replace(/\r?\n/g, '<br>');
  }

  function simpleTableMarkdown(block, workspace = {}, paths) {
    runtime.normalizeSimpleTableBlock(block);
    return runtime.tableMatrixMarkdown(
      block.tableRows,
      block.tableColumnAlignments,
      block.tableCellInline,
      workspace,
      paths,
    );
  }

  function simpleTableClipboardHtml(block) {
    runtime.normalizeSimpleTableBlock(block);
    const rows = block.tableRows;
    return `<table>${rows
      .map(
        (row, ri) =>
          `<tr>${row
            .map((cell, ci) => {
              const tag =
                (block.tableHeaderRow && ri === 0) || (block.tableHeaderColumn && ci === 0)
                  ? 'th'
                  : 'td';
              return `<${tag} style="text-align:${block.tableColumnAlignments[ci]}">${runtime.tableCellClipboardHtml(cell, block.tableCellInline[ri][ci])}</${tag}>`;
            })
            .join('')}</tr>`,
      )
      .join('')}</table>`;
  }

  function copySelectedTableToClipboard(e) {
    if (!runtime.selectedTableBlockId) return false;
    const block = runtime.findBlock(runtime.selectedTableBlockId);
    if (block?.type !== 'table') {
      runtime.clearSelectedTable();
      return false;
    }
    const markdown = runtime.simpleTableMarkdown(block);
    e?.preventDefault?.();
    e?.clipboardData?.setData?.('text/plain', markdown);
    e?.clipboardData?.setData?.('text/markdown', markdown);
    e?.clipboardData?.setData?.('text/html', runtime.simpleTableClipboardHtml(block));
    return true;
  }

  function focusSimpleTableCell(id, rowIndex, colIndex) {
    runtime.lifecycle.frame(() =>
      document
        .querySelector(
          `.simple-table-block[data-block-id="${id}"] [data-table-cell="${rowIndex}:${colIndex}"]`,
        )
        ?.focus(),
    );
  }

  function mutateSimpleTableAxis(block, axis, action, index) {
    runtime.normalizeSimpleTableBlock(block);
    const rows = block.tableRows,
      rowCount = rows.length,
      colCount = rows[0]?.length || 1;
    if (axis === 'row') {
      const at = Math.max(0, Math.min(rowCount - 1, Number(index) || 0));
      if (action === 'insert-before') {
        rows.splice(at, 0, Array(colCount).fill(''));
        block.tableCellInline.splice(at, 0, Array(colCount).fill(null));
        return { row: at, col: 0 };
      }
      if (action === 'insert-after') {
        rows.splice(at + 1, 0, Array(colCount).fill(''));
        block.tableCellInline.splice(at + 1, 0, Array(colCount).fill(null));
        return { row: at + 1, col: 0 };
      }
      if (action === 'duplicate') {
        rows.splice(at + 1, 0, [...rows[at]]);
        block.tableCellInline.splice(
          at + 1,
          0,
          block.tableCellInline[at].map((cell) => (cell ? structuredClone(cell) : null)),
        );
        return { row: at + 1, col: 0 };
      }
      if (action === 'delete' && rowCount > 1) {
        rows.splice(at, 1);
        block.tableCellInline.splice(at, 1);
        return { row: Math.min(at, rows.length - 1), col: 0 };
      }
      return null;
    }
    const at = Math.max(0, Math.min(colCount - 1, Number(index) || 0));
    const alignments = block.tableColumnAlignments;
    if (['align-left', 'align-center', 'align-right'].includes(action)) {
      alignments[at] = action.slice(6);
      return { row: 0, col: at };
    }
    if (action === 'insert-before') {
      rows.forEach((row) => row.splice(at, 0, ''));
      block.tableCellInline.forEach((row) => row.splice(at, 0, null));
      alignments.splice(at, 0, 'left');
      return { row: 0, col: at };
    }
    if (action === 'insert-after') {
      rows.forEach((row) => row.splice(at + 1, 0, ''));
      block.tableCellInline.forEach((row) => row.splice(at + 1, 0, null));
      alignments.splice(at + 1, 0, 'left');
      return { row: 0, col: at + 1 };
    }
    if (action === 'duplicate') {
      rows.forEach((row) => row.splice(at + 1, 0, row[at] ?? ''));
      block.tableCellInline.forEach((row) =>
        row.splice(at + 1, 0, row[at] ? structuredClone(row[at]) : null),
      );
      alignments.splice(at + 1, 0, alignments[at]);
      return { row: 0, col: at + 1 };
    }
    if (action === 'delete' && colCount > 1) {
      rows.forEach((row) => row.splice(at, 1));
      block.tableCellInline.forEach((row) => row.splice(at, 1));
      alignments.splice(at, 1);
      return { row: 0, col: Math.min(at, (rows[0]?.length || 1) - 1) };
    }
    return null;
  }

  function showSimpleTableAxisMenu(anchor, id, axis, index) {
    const block = runtime.findBlock(id);
    if (block?.type !== 'table') return;
    runtime.normalizeSimpleTableBlock(block);
    const isRow = axis === 'row',
      count = isRow ? block.tableRows.length : block.tableRows[0]?.length || 1;
    const r = anchor.getBoundingClientRect(),
      menuWidth = 190,
      menuHeight = isRow ? 176 : 300;
    runtime.els.blockMenu.style.width = `${menuWidth}px`;
    runtime.els.blockMenu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - menuWidth - 8))}px`;
    runtime.els.blockMenu.style.top = `${Math.max(8, Math.min(r.bottom + 4, window.innerHeight - menuHeight - 8))}px`;
    const before = isRow ? 'Insert row above' : 'Insert column left';
    const after = isRow ? 'Insert row below' : 'Insert column right';
    const duplicate = isRow ? 'Duplicate row' : 'Duplicate column';
    const remove = isRow ? 'Delete row' : 'Delete column';
    const alignmentOptions = isRow
      ? ''
      : `<div class="table-menu-section">
          <div class="table-menu-label">Alignment</div>
          ${['left', 'center', 'right'].map((alignment) => `<button class="block-menu-item" data-table-axis-action="align-${alignment}" data-table-axis="col" data-table-axis-index="${index}" data-block-id="${id}" aria-pressed="${block.tableColumnAlignments[index] === alignment}">${runtime.iconMarkup(`align-${alignment}`, '16px')} Align ${alignment}<span class="menu-check">${block.tableColumnAlignments[index] === alignment ? runtime.iconMarkup('check', '14px') : ''}</span></button>`).join('')}
        </div>`;
    runtime.els.blockMenu.innerHTML = runtime.htmlWithStyles(`
      <div class="table-menu-section">
        <div class="table-menu-label">${isRow ? `Row ${Number(index) + 1}` : `Column ${Number(index) + 1}`}</div>
        <button class="block-menu-item" data-table-axis-action="insert-before" data-table-axis="${axis}" data-table-axis-index="${index}" data-block-id="${id}">${runtime.iconMarkup('plus', '14px')} ${before}</button>
        <button class="block-menu-item" data-table-axis-action="insert-after" data-table-axis="${axis}" data-table-axis-index="${index}" data-block-id="${id}">${runtime.iconMarkup('plus', '14px')} ${after}</button>
        <button class="block-menu-item" data-table-axis-action="duplicate" data-table-axis="${axis}" data-table-axis-index="${index}" data-block-id="${id}">${runtime.iconMarkup('copy', '16px')} Duplicate ${isRow ? 'row' : 'column'}</button>
      </div>
      ${alignmentOptions}
      <div class="table-menu-section">
        <button class="block-menu-item danger" data-table-axis-action="delete" data-table-axis="${axis}" data-table-axis-index="${index}" data-block-id="${id}" ${count <= 1 ? 'disabled' : ''}>${runtime.iconMarkup('trash', '16px')} ${remove}</button>
      </div>`);
    runtime.els.blockMenu.classList.remove('hidden');
  }

  function runSimpleTableAxisAction(button) {
    const id = button.dataset.blockId,
      axis = button.dataset.tableAxis,
      action = button.dataset.tableAxisAction,
      index = Number(button.dataset.tableAxisIndex);
    const block = runtime.findBlock(id);
    if (block?.type !== 'table') return;
    const target = runtime.mutateSimpleTableAxis(block, axis, action, index);
    if (!target) return;
    runtime.scheduleSave();
    runtime.hideFloatingMenus();
    runtime.renderBlocks(runtime.currentPage());
    runtime.focusSimpleTableCell(id, target.row, target.col);
  }

  function reorderSimpleTableAxis(block, axis, fromIndex, targetIndex, after) {
    runtime.normalizeSimpleTableBlock(block);
    const rows = block.tableRows;
    if (axis === 'row') {
      if (rows.length < 2) return fromIndex;
      const from = Math.max(0, Math.min(rows.length - 1, fromIndex));
      let insertAt = Math.max(0, Math.min(rows.length, targetIndex + (after ? 1 : 0)));
      const [moved] = rows.splice(from, 1);
      if (from < insertAt) insertAt--;
      insertAt = Math.max(0, Math.min(rows.length, insertAt));
      rows.splice(insertAt, 0, moved);
      runtime.clearTableCellSelection();
      return insertAt;
    }
    const count = rows[0]?.length || 1;
    if (count < 2) return fromIndex;
    const from = Math.max(0, Math.min(count - 1, fromIndex));
    let insertAt = Math.max(0, Math.min(count, targetIndex + (after ? 1 : 0)));
    if (from < insertAt) insertAt--;
    insertAt = Math.max(0, Math.min(count - 1, insertAt));
    if (insertAt === from) return from;
    for (const row of rows) {
      const [moved] = row.splice(from, 1);
      row.splice(insertAt, 0, moved);
    }
    for (const row of block.tableCellInline) {
      const [moved] = row.splice(from, 1);
      row.splice(insertAt, 0, moved);
    }
    const [alignment] = block.tableColumnAlignments.splice(from, 1);
    block.tableColumnAlignments.splice(insertAt, 0, alignment);
    runtime.clearTableCellSelection();
    return insertAt;
  }

  Object.assign(runtime, {
    normalizeSimpleTableBlock,
    tableCellInlineBlock,
    setTableCellInline,
    syncTableCellInlineFromContent,
    tableAxisHandleSvg,
    tableCellSelectionBounds,
    isTableCellInSelection,
    simpleTableHTML,
    syncSimpleTableHandles,
    syncAllSimpleTableHandles,
    setSimpleTableHandleHover,
    onSimpleTableHandlePointerMove,
    tableCellCoordinates,
    clearTableCellSelection,
    renderTableCellSelection,
    beginTableCellSelection,
    onTableCellSelectionMove,
    onTableCellSelectionEnd,
    selectedTableCellMatrix,
    tableMatrixMarkdown,
    tableMatrixTsv,
    tableMatrixHtml,
    tableCellClipboardHtml,
    copySelectedTableCellsToClipboard,
    htmlTableCellText,
    tableMatrixFromHtml,
    tableMatrixFromTsv,
    clipboardTableMatrix,
    pasteTableMatrixIntoCell,
    clearSelectedTableCells,
    clearSelectedTable,
    selectSimpleTable,
    deleteSelectedTable,
    markdownTableCell,
    simpleTableMarkdown,
    simpleTableClipboardHtml,
    copySelectedTableToClipboard,
    focusSimpleTableCell,
    mutateSimpleTableAxis,
    showSimpleTableAxisMenu,
    runSimpleTableAxisAction,
    reorderSimpleTableAxis,
  });
}

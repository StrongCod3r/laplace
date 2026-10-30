import type { ControllerLifecycle } from '@/shared/lib/controller-lifecycle';

export interface TextSelectionPoint {
  content: HTMLElement;
  node: Node;
  offset: number;
  blockId?: string;
  edge?: 'before' | 'after';
}

interface TextBlockSelection {
  active?: boolean;
  allPage?: boolean;
  anchor?: TextSelectionPoint;
  focus?: TextSelectionPoint;
}

export interface SelectionRectangle {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface RectangleBlockSelection {
  mode: 'rectangle';
  root: HTMLElement;
  active: boolean;
  dragging: boolean;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  clientX: number;
  clientY: number;
  blockIds: string[];
  frame: number | null;
}

export function isRectangleSelection(value: unknown): value is RectangleBlockSelection {
  return (value as RectangleBlockSelection | null)?.mode === 'rectangle';
}

export function textBlockSelectionRange(selection: unknown): Range | null {
  const { anchor, focus } = (selection || {}) as TextBlockSelection;
  if (!anchor || !focus) return null;
  try {
    const first = document.createRange();
    const last = document.createRange();
    first.setStart(anchor.node, anchor.offset);
    first.collapse(true);
    last.setStart(focus.node, focus.offset);
    last.collapse(true);
    const [start, end] =
      first.compareBoundaryPoints(Range.START_TO_START, last) <= 0
        ? [anchor, focus]
        : [focus, anchor];
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return range;
  } catch {
    return null;
  }
}

/** A structural endpoint selects the whole hovered row, without needing another paragraph. */
export function blockBoundaryPoint(row: HTMLElement, after: boolean): TextSelectionPoint {
  return {
    content: row,
    node: row.parentNode!,
    offset: [...row.parentNode!.childNodes].indexOf(row) + (after ? 1 : 0),
    blockId: row.dataset.blockId,
    edge: after ? 'after' : 'before',
  };
}

/** Rebuild text and structural endpoints after formatting replaces the editor DOM. */
export function restoreTextBlockSelection(
  root: HTMLElement,
  selection: unknown,
  pointAtOffset: (content: HTMLElement, offset: number) => { node: Node; offset: number } | null,
): TextBlockSelection | null {
  const current = selection as TextBlockSelection | null;
  if (!current?.anchor || !current.focus) return null;
  const rebuild = (point: TextSelectionPoint): TextSelectionPoint | null => {
    const id = point.blockId || point.content.closest<HTMLElement>('.block-row')?.dataset.blockId;
    const row = [...root.querySelectorAll<HTMLElement>('.block-row[data-block-id]')].find(
      (row) => row.dataset.blockId === id,
    );
    if (!row) return null;
    if (point.edge) return blockBoundaryPoint(row, point.edge === 'after');
    const content = row.querySelector<HTMLElement>('.block-content');
    if (!content) return null;
    try {
      const before = document.createRange();
      before.selectNodeContents(point.content);
      before.setEnd(point.node, point.offset);
      const restored = pointAtOffset(content, before.toString().length);
      return restored ? { content, ...restored } : null;
    } catch {
      return null;
    }
  };
  const anchor = rebuild(current.anchor);
  const focus = rebuild(current.focus);
  return anchor && focus ? { ...current, anchor, focus } : null;
}

/** Return complete rows only; boundary paragraphs retain their partial text selection. */
export function selectedBlockRows(root: HTMLElement, selection: unknown): HTMLElement[] {
  if (!root?.isConnected) return [];
  const rows = [...root.querySelectorAll<HTMLElement>('.block-row[data-block-id]')];
  if (isRectangleSelection(selection)) {
    if (selection.root !== root) return [];
    const ids = new Set(selection.blockIds);
    return rows.filter((row) => ids.has(row.dataset.blockId!));
  }
  const textSelection = selection as TextBlockSelection | null;
  if (textSelection?.allPage) return rows;
  let range = textSelection?.active ? textBlockSelectionRange(selection) : null;
  if (!range) {
    const native = window.getSelection();
    if (!native?.rangeCount || native.isCollapsed) return [];
    range = native.getRangeAt(0);
  }
  if (range.collapsed || !root.contains(range.startContainer) || !root.contains(range.endContainer))
    return [];
  return rows.filter((row) => {
    const bounds = document.createRange();
    bounds.selectNode(row);
    return (
      range.compareBoundaryPoints(Range.START_TO_START, bounds) <= 0 &&
      range.compareBoundaryPoints(Range.END_TO_END, bounds) >= 0
    );
  });
}

export function topLevelSelectedRows(rows: HTMLElement[]): HTMLElement[] {
  const selected = new Set(rows);
  return rows.filter((row) => {
    for (let parent = row.parentElement; parent; parent = parent.parentElement)
      if (selected.has(parent)) return false;
    return true;
  });
}

export function selectionViewport(element: HTMLElement): SelectionRectangle {
  const result = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const rect = parent.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
      result.left = Math.max(result.left, rect.left + parent.clientLeft);
      result.right = Math.min(result.right, rect.left + parent.clientLeft + parent.clientWidth);
    }
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
      result.top = Math.max(result.top, rect.top + parent.clientTop);
      result.bottom = Math.min(result.bottom, rect.top + parent.clientTop + parent.clientHeight);
    }
  }
  return result;
}

export function clippedSelectionRect(element: HTMLElement): SelectionRectangle | null {
  const rect = element.getBoundingClientRect();
  const viewport = selectionViewport(element);
  const result = {
    left: Math.max(rect.left, viewport.left),
    top: Math.max(rect.top, viewport.top),
    right: Math.min(rect.right, viewport.right),
    bottom: Math.min(rect.bottom, viewport.bottom),
  };
  return result.right > result.left && result.bottom > result.top ? result : null;
}

/** Match block surfaces without letting padding or borders spill outside the editor. */
export function blockSelectionGeometry(
  row: HTMLElement,
  root: HTMLElement,
): {
  rect: SelectionRectangle;
  radius: string;
} | null {
  const rect = clippedSelectionRect(row);
  if (!rect) return null;
  const content = root.getBoundingClientRect();
  rect.left = Math.max(rect.left, content.left);
  rect.right = Math.min(rect.right, content.right);
  if (rect.right <= rect.left) return null;
  if (
    !row.matches(
      '.code-block,[data-type="callout"],.image-block,.file-block,.simple-table-block,.page-block,.page-link-block',
    )
  )
    return { rect, radius: '0px' };
  const original = row.getBoundingClientRect();
  const style = getComputedStyle(row);
  const left = rect.left <= original.left + 0.5;
  const right = rect.right >= original.right - 0.5;
  const top = rect.top <= original.top + 0.5;
  const bottom = rect.bottom >= original.bottom - 0.5;
  return {
    rect,
    radius: [
      top && left ? style.borderTopLeftRadius : '0px',
      top && right ? style.borderTopRightRadius : '0px',
      bottom && right ? style.borderBottomRightRadius : '0px',
      bottom && left ? style.borderBottomLeftRadius : '0px',
    ].join(' '),
  };
}

export function rectangleSelectionBounds(
  selection: RectangleBlockSelection,
  clip = true,
): SelectionRectangle {
  const root = selection.root.getBoundingClientRect();
  const viewport = selectionViewport(selection.root);
  const x = Math.max(viewport.left, Math.min(viewport.right, selection.clientX));
  const y = Math.max(viewport.top, Math.min(viewport.bottom, selection.clientY));
  return {
    left: Math.max(clip ? viewport.left : -Infinity, Math.min(root.left + selection.originX, x)),
    top: Math.max(clip ? viewport.top : -Infinity, Math.min(root.top + selection.originY, y)),
    right: Math.min(clip ? viewport.right : Infinity, Math.max(root.left + selection.originX, x)),
    bottom: Math.min(clip ? viewport.bottom : Infinity, Math.max(root.top + selection.originY, y)),
  };
}

export function updateRectangleSelection(
  selection: RectangleBlockSelection,
  point: { clientX: number; clientY: number },
) {
  selection.clientX = point.clientX;
  selection.clientY = point.clientY;
  const bounds = rectangleSelectionBounds(selection, false);
  selection.blockIds = [
    ...selection.root.querySelectorAll<HTMLElement>('.block-row[data-block-id]'),
  ]
    .filter((row) => {
      if (!row.getClientRects().length) return false;
      const rect = row.getBoundingClientRect();
      return (
        rect.right > bounds.left &&
        rect.left < bounds.right &&
        rect.bottom > bounds.top &&
        rect.top < bounds.bottom
      );
    })
    .map((row) => row.dataset.blockId!);
}

/** Keep the origin attached to page content while the pointer scrolls its own pane. */
export function startRectangleAutoScroll(
  selection: RectangleBlockSelection,
  lifecycle: ControllerLifecycle,
  render: () => void,
) {
  const tick = () => {
    selection.frame = null;
    if (!selection.dragging || !selection.root.isConnected) return;
    const scroller = selection.root.closest<HTMLElement>('.dock-scroll, #editorView');
    if (selection.active && scroller) {
      const viewport = selectionViewport(selection.root);
      const delta =
        selection.clientY < viewport.top + 28
          ? -12
          : selection.clientY > viewport.bottom - 28
            ? 12
            : 0;
      const previous = scroller.scrollTop;
      if (delta) scroller.scrollTop += delta;
      if (previous !== scroller.scrollTop) {
        updateRectangleSelection(selection, selection);
        render();
      }
    }
    selection.frame = lifecycle.frame(tick);
  };
  selection.frame = lifecycle.frame(tick);
}

export function canStartRectangleSelection(target: Element, root: HTMLElement): boolean {
  const surface = root.closest('.page') || root;
  const scroller = root.closest('.dock-scroll, #editorView');
  if (!(surface.contains(target) || scroller === target)) return false;
  if (surface.getAttribute('data-plain-text') === 'true') return false;
  if (
    target.closest(
      'input,textarea,select,[contenteditable="true"],.note-inline-header,.page-comments,.block-gutter,[draggable="true"],[data-table-cell],[data-mermaid-render],.mermaid-navigation,[data-image-resize],[data-image-crop-frame]',
    )
  )
    return false;
  const button = target.closest('button,a');
  return (
    !button ||
    button.matches('[data-page-block-open],[data-page-link-open],[data-page-link-choose]')
  );
}

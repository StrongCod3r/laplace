import type { ControllerLifecycle } from '@/shared/lib/controller-lifecycle';

interface TextSelectionPoint {
  content: HTMLElement;
  node: Node;
  offset: number;
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
  let start = textSelection?.active ? textSelection.anchor?.content : null;
  let end = textSelection?.active ? textSelection.focus?.content : null;
  if (!start || !end) {
    const native = window.getSelection();
    if (!native?.rangeCount || native.isCollapsed) return [];
    const range = native.getRangeAt(0);
    const content = (node: Node) =>
      (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>(
        '.block-content[contenteditable="true"]',
      );
    start = content(range.startContainer);
    end = content(range.endContainer);
  }
  if (!start || !end || start === end || !root.contains(start) || !root.contains(end)) return [];
  if (start.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_PRECEDING)
    [start, end] = [end, start];
  return rows.filter(
    (row) =>
      !row.contains(start) &&
      !row.contains(end) &&
      !!(start.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      !!(row.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING),
  );
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

const EDITABLES = [
  '.block-content[contenteditable="true"]',
  '[data-table-cell][contenteditable="true"]',
  '[data-image-caption][contenteditable="true"]',
  '[data-code-editor]:not(:disabled)',
  '#pageTitle[contenteditable="true"]',
  '[data-dock-title][contenteditable="true"]',
].join(',');

interface TextSurface {
  element: HTMLElement;
  length: number;
  dispose(): void;
}

function textSurface(editor: HTMLElement): TextSurface {
  if (!(editor instanceof HTMLTextAreaElement))
    return { element: editor, length: editor.textContent?.length || 0, dispose() {} };

  // Measure textarea wrapping with the same font and width, including a final empty line.
  const mirror = document.createElement('div');
  const styles = getComputedStyle(editor);
  for (const property of [
    'box-sizing',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'line-height',
    'letter-spacing',
    'word-spacing',
    'text-indent',
    'tab-size',
    'padding',
    'border',
    'white-space',
    'overflow-wrap',
    'word-break',
    'direction',
  ])
    mirror.style.setProperty(property, styles.getPropertyValue(property));
  const bounds = editor.getBoundingClientRect();
  Object.assign(mirror.style, {
    position: 'fixed',
    left: `${bounds.left - editor.scrollLeft}px`,
    top: `${bounds.top - editor.scrollTop}px`,
    width: `${editor.clientWidth + parseFloat(styles.borderLeftWidth) + parseFloat(styles.borderRightWidth)}px`,
    visibility: 'hidden',
    pointerEvents: 'none',
  });
  mirror.setAttribute('aria-hidden', 'true');
  mirror.textContent = editor.value + '\u200b';
  document.body.append(mirror);
  return { element: mirror, length: editor.value.length, dispose: () => mirror.remove() };
}

function rangeAtOffset(element: HTMLElement, offset: number) {
  const range = document.createRange();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const length = node.textContent?.length || 0;
    if (remaining <= length) {
      range.setStart(node, remaining);
      range.collapse(true);
      return range;
    }
    remaining -= length;
  }
  range.selectNodeContents(element);
  range.collapse(offset === 0);
  return range;
}

function caretRect(range: Range, element: HTMLElement) {
  const rect = [...range.getClientRects()].find((item) => item.height > 0);
  if (rect) return rect;
  // Element-boundary selections sometimes have no rectangle; measure the equivalent text caret.
  const before = document.createRange();
  before.selectNodeContents(element);
  before.setEnd(range.startContainer, range.startOffset);
  const normalized = rangeAtOffset(element, before.toString().length);
  const textRect = [...normalized.getClientRects()].find((item) => item.height > 0);
  if (textRect) return textRect;
  const bounds = element.getBoundingClientRect();
  const styles = getComputedStyle(element);
  const height = parseFloat(styles.lineHeight) || parseFloat(styles.fontSize) * 1.5;
  const atEnd = before.toString().length > 0;
  return new DOMRect(
    bounds.left + parseFloat(styles.paddingLeft),
    atEnd
      ? bounds.bottom - parseFloat(styles.paddingBottom) - height
      : bounds.top + parseFloat(styles.paddingTop),
    0,
    height,
  );
}

function lineEdges(element: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const rects = [...range.getClientRects()].filter((rect) => rect.height > 0);
  if (!rects.length) return [caretRect(rangeAtOffset(element, 0), element)];
  const styles = getComputedStyle(element);
  const lineHeight = parseFloat(styles.lineHeight) || parseFloat(styles.fontSize) * 1.5;
  // Ignore the boxes of nested divs that span several visual lines.
  const lines = rects.filter((rect) => rect.height <= lineHeight * 1.5);
  return lines.length ? lines : rects;
}

function revealCaret(editor: HTMLElement, rect: DOMRect) {
  const scroller = editor.closest<HTMLElement>('.dock-scroll, #editorView');
  if (!scroller) return;
  const viewport = scroller.getBoundingClientRect();
  if (rect.top < viewport.top + 8) scroller.scrollTop += rect.top - viewport.top - 8;
  else if (rect.bottom > viewport.bottom - 8)
    scroller.scrollTop += rect.bottom - viewport.bottom + 8;
}

function closestOffset(surface: TextSurface, direction: number, x: number) {
  const rectangles = lineEdges(surface.element);
  const edgeTop =
    direction > 0
      ? Math.min(...rectangles.map((rect) => rect.top))
      : Math.max(...rectangles.map((rect) => rect.top));
  const rectAt = (offset: number) =>
    caretRect(rangeAtOffset(surface.element, offset), surface.element);
  let low = 0,
    high = surface.length;
  // Find the first/last visual line, including soft-wrapped textarea lines.
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (rectAt(mid).top < edgeTop - 2) low = mid + 1;
    else high = mid;
  }
  const start = low;
  high = surface.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (rectAt(mid).top <= edgeTop + 2) low = mid;
    else high = mid - 1;
  }
  const end = low;
  low = start;
  high = end;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (rectAt(mid).left < x) low = mid + 1;
    else high = mid;
  }
  return low > start && Math.abs(rectAt(low - 1).left - x) < Math.abs(rectAt(low).left - x)
    ? low - 1
    : low;
}

function focusAtEdge(editor: HTMLElement, direction: number, x: number) {
  editor.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  editor.focus({ preventScroll: true });
  const surface = textSurface(editor);
  try {
    if (editor instanceof HTMLTextAreaElement) {
      const offset = closestOffset(surface, direction, x);
      editor.setSelectionRange(offset, offset);
      revealCaret(editor, caretRect(rangeAtOffset(surface.element, offset), surface.element));
      return;
    }
    const rectangles = lineEdges(editor);
    const edge = rectangles.reduce((best, rect) =>
      direction > 0 ? (rect.top < best.top ? rect : best) : rect.bottom > best.bottom ? rect : best,
    );
    const bounds = editor.getBoundingClientRect();
    const pointX = Math.max(bounds.left + 1, Math.min(bounds.right - 1, x));
    const pointY = edge.top + edge.height / 2;
    const doc = document as Document & {
      caretPositionFromPoint?: (
        x: number,
        y: number,
      ) => { offsetNode: Node; offset: number } | null;
    };
    const position = doc.caretPositionFromPoint?.(pointX, pointY);
    let range = document.caretRangeFromPoint?.(pointX, pointY) || null;
    if (position && editor.contains(position.offsetNode)) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
    }
    if (!range || !editor.contains(range.startContainer))
      range = rangeAtOffset(editor, closestOffset(surface, direction, x));
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    revealCaret(editor, caretRect(range, editor));
  } finally {
    surface.dispose();
  }
}

export function createEditorVerticalNavigation() {
  let goalX: number | null = null;
  let activePage: HTMLElement | null = null;
  const reset = () => {
    goalX = null;
    activePage = null;
  };

  function move(event: KeyboardEvent) {
    if (
      !['ArrowUp', 'ArrowDown'].includes(event.key) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      event.isComposing
    )
      return false;
    const editor =
      event.target instanceof Element ? event.target.closest<HTMLElement>(EDITABLES) : null;
    const page = editor?.closest<HTMLElement>('article.page');
    if (!editor || !page) return false;
    const surface = textSurface(editor);
    try {
      let range: Range;
      if (editor instanceof HTMLTextAreaElement) {
        if (editor.selectionStart !== editor.selectionEnd) {
          reset();
          return false;
        }
        range = rangeAtOffset(surface.element, editor.selectionStart);
      } else {
        const selection = window.getSelection();
        if (
          !selection?.rangeCount ||
          !selection.isCollapsed ||
          !editor.contains(selection.anchorNode)
        ) {
          reset();
          return false;
        }
        range = selection.getRangeAt(0);
      }
      const caret = caretRect(range, surface.element);
      if (activePage !== page || goalX === null) goalX = caret.left;
      activePage = page;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const edges = lineEdges(surface.element);
      const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || caret.height;
      const middle = caret.top + caret.height / 2;
      const atBoundary =
        direction > 0
          ? middle >= Math.max(...edges.map((rect) => rect.bottom)) - lineHeight * 0.75
          : middle <= Math.min(...edges.map((rect) => rect.top)) + lineHeight * 0.75;
      if (!atBoundary) return false;
      const bounds = editor.getBoundingClientRect();
      const candidates = [...page.querySelectorAll<HTMLElement>(EDITABLES)]
        .filter(
          (target) =>
            target !== editor && !target.closest('[inert]') && target.getClientRects().length,
        )
        .map((target) => ({ target, rect: target.getBoundingClientRect() }))
        .filter(({ rect }) =>
          direction > 0 ? rect.top >= bounds.bottom - 1 : rect.bottom <= bounds.top + 1,
        )
        .map(({ target, rect }) => ({
          target,
          horizontal: Math.max(rect.left - goalX!, goalX! - rect.right, 0),
          vertical: direction > 0 ? rect.top - bounds.bottom : bounds.top - rect.bottom,
        }))
        .sort((a, b) => a.vertical - b.vertical || a.horizontal - b.horizontal);
      const next = candidates[0]?.target;
      if (!next) return false;
      event.preventDefault();
      focusAtEdge(next, direction, goalX);
      return true;
    } finally {
      surface.dispose();
    }
  }

  return { move, reset };
}

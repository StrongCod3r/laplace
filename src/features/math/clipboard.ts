/** Native clipboard serialization can traverse shadow DOM and duplicate KaTeX output. */
export function copyInlineMathSelection(event: ClipboardEvent): boolean {
  const selection = window.getSelection();
  if (!event.clipboardData || !selection?.rangeCount || selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  const fragment = range.cloneContents();
  const equations = fragment.querySelectorAll('[data-inline-math]');
  const ancestor = range.commonAncestorContainer;
  const element =
    ancestor.nodeType === Node.ELEMENT_NODE ? (ancestor as Element) : ancestor.parentElement;
  if (!equations.length && !element?.closest('[data-inline-math]')) return false;
  if (!element?.closest('#blockEditor, [data-dock-blocks]')) return false;

  // Cloning omits shadow roots. Unwrap only the original equation source and keep
  // the surrounding rich text, including its supported formatting and links.
  equations.forEach((equation) => equation.replaceWith(...equation.childNodes));
  fragment
    .querySelectorAll('button, select, .block-gutter, [data-caret-placeholder]')
    .forEach((node) => node.remove());
  fragment.querySelectorAll('[contenteditable], [tabindex]').forEach((node) => {
    node.removeAttribute('contenteditable');
    node.removeAttribute('tabindex');
  });
  const container = document.createElement('div');
  container.append(fragment);
  const html = container.innerHTML;
  // innerText preserves native paragraph and line breaks, unlike Range.toString.
  container.style.cssText =
    'position:fixed;left:-100000px;top:0;white-space:pre-wrap;opacity:0;pointer-events:none';
  container.setAttribute('aria-hidden', 'true');
  document.body.appendChild(container);
  let text: string;
  try {
    text = container.innerText;
  } finally {
    container.remove();
  }
  event.preventDefault();
  event.clipboardData.setData('text/plain', text);
  event.clipboardData.setData('text/html', html);
  return true;
}

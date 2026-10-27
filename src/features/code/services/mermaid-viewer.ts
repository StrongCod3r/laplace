import { iconMarkup } from '@/icons';

/** Borrow the live SVG to keep Mermaid IDs, markers and styles unique. */
export function createMermaidViewer() {
  let current: { dialog: HTMLDialogElement; close: () => void; fit: () => void } | null = null;
  const close = () => current?.close();
  const open = (button: HTMLElement) => {
    close();
    const preview = button.closest<HTMLElement>('[data-mermaid-preview]');
    const viewport = preview?.querySelector<HTMLElement>('[data-mermaid-render]');
    const canvas = viewport?.querySelector<HTMLElement>('[data-mermaid-canvas]');
    const svg = canvas?.querySelector('svg');
    if (!preview || !viewport || !canvas || !svg) return;
    const previousHeight = viewport.style.height;
    const svgStyle = svg.getAttribute('style');
    const bounds = svg.viewBox.baseVal;
    const ratio =
      bounds.width > 0 && bounds.height > 0
        ? bounds.width / bounds.height
        : svg.getBoundingClientRect().width / Math.max(1, svg.getBoundingClientRect().height);
    viewport.style.height = `${viewport.getBoundingClientRect().height}px`;
    const dialog = document.createElement('dialog');
    dialog.dataset.mermaidViewer = '';
    dialog.setAttribute('aria-label', 'Mermaid diagram viewer');
    const full = preview.cloneNode(true) as HTMLElement;
    full.setAttribute('data-mermaid-fullscreen', '');
    const fullViewport = full.querySelector<HTMLElement>('[data-mermaid-render]')!;
    fullViewport.setAttribute(
      'aria-label',
      'Mermaid diagram. Scroll to zoom, drag to pan. Use plus, minus, arrows and zero on the keyboard.',
    );
    const fullCanvas = full.querySelector<HTMLElement>('[data-mermaid-canvas]')!;
    fullViewport.style.height = '';
    fullViewport.removeAttribute('data-panning');
    fullCanvas.style.transform = '';
    fullCanvas.replaceChildren(svg);
    full.querySelector('[data-mermaid-reset]')!.textContent = '100%';
    full.querySelector('[data-mermaid-fullscreen-toggle]')?.remove();
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = button.className;
    dismiss.dataset.mermaidViewerClose = '';
    dismiss.setAttribute('aria-label', 'Close diagram viewer');
    dismiss.title = 'Close (Esc)';
    dismiss.innerHTML = iconMarkup('x', '18px');
    full.append(dismiss);
    dialog.append(full);
    document.body.append(dialog);
    const restore = () => {
      current = null;
      dialog.close();
      if (svgStyle === null) svg.removeAttribute('style');
      else svg.setAttribute('style', svgStyle);
      viewport.style.height = previousHeight;
      if (canvas.isConnected) canvas.replaceChildren(svg);
      dialog.remove();
      if (button.isConnected) button.focus({ preventScroll: true });
    };
    const fit = () => {
      const width = Math.max(
        1,
        Math.min(fullViewport.clientWidth - 80, (fullViewport.clientHeight - 80) * ratio),
      );
      svg.style.width = `${width}px`;
      svg.style.maxWidth = 'none';
      svg.style.height = 'auto';
    };
    current = { dialog, close: restore, fit };
    dialog.showModal();
    fit();
    fullViewport.focus({ preventScroll: true });
  };
  return { open, close, resize: () => current?.fit(), isOpen: () => !!current };
}

import type { ControllerLifecycle } from '@/shared/lib/controller-lifecycle';
import { createMermaidViewer } from './mermaid-viewer';

interface View {
  scale: number;
  x: number;
  y: number;
}

/** Navigation belongs to the preview DOM, never to the persisted Markdown. */
export function bindMermaidNavigation(lifecycle: ControllerLifecycle): () => void {
  const viewer = createMermaidViewer();
  lifecycle.listen(window, 'resize', viewer.resize);
  lifecycle.listen(
    document,
    'cancel',
    (event) => {
      if ((event.target as Element)?.matches?.('[data-mermaid-viewer]')) {
        event.preventDefault();
        viewer.close();
      }
    },
    true,
  );
  const views = new WeakMap<HTMLElement, View>();
  let drag: { viewport: HTMLElement; id: number; x: number; y: number } | null = null;
  const viewportFor = (target: EventTarget | null) =>
    (target as Element)
      ?.closest?.<HTMLElement>('[data-mermaid-preview]')
      ?.querySelector<HTMLElement>('[data-mermaid-render]');
  const viewFor = (viewport: HTMLElement) => {
    let view = views.get(viewport);
    if (!view) {
      view = { scale: 1, x: 0, y: 0 };
      views.set(viewport, view);
    }
    return view;
  };
  const apply = (viewport: HTMLElement) => {
    const view = viewFor(viewport);
    const canvas = viewport.querySelector<HTMLElement>('[data-mermaid-canvas]');
    if (canvas) canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    const label = viewport.closest('[data-mermaid-preview]')?.querySelector('[data-mermaid-reset]');
    if (label) label.textContent = `${Math.round(view.scale * 100)}%`;
  };
  const zoom = (viewport: HTMLElement, factor: number, x: number, y: number) => {
    const view = viewFor(viewport);
    const scale = Math.min(8, Math.max(0.1, view.scale * factor));
    const ratio = scale / view.scale;
    view.x = x - (x - view.x) * ratio;
    view.y = y - (y - view.y) * ratio;
    view.scale = scale;
    apply(viewport);
  };
  lifecycle.listen(
    document,
    'wheel',
    (event) => {
      const wheel = event as WheelEvent;
      const viewport = (wheel.target as Element)?.closest?.<HTMLElement>('[data-mermaid-render]');
      if (!viewport?.closest('[data-mermaid-fullscreen]') || !viewport.querySelector('svg')) return;
      wheel.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const delta =
        wheel.deltaY *
        (wheel.deltaMode === 1 ? 16 : wheel.deltaMode === 2 ? viewport.clientHeight : 1);
      zoom(
        viewport,
        Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.002),
        wheel.clientX - rect.left,
        wheel.clientY - rect.top,
      );
    },
    { passive: false },
  );
  lifecycle.listen(document, 'dblclick', (event) => {
    if (viewer.isOpen()) return;
    const viewport = (event.target as Element)?.closest?.<HTMLElement>('[data-mermaid-render]');
    const button = viewport
      ?.closest('[data-mermaid-preview]')
      ?.querySelector<HTMLElement>('[data-mermaid-fullscreen-toggle]');
    if (!button || !viewport?.querySelector('svg')) return;
    event.preventDefault();
    viewer.open(button);
  });
  lifecycle.listen(document, 'click', (event) => {
    const fullscreen = (event.target as Element)?.closest?.<HTMLElement>(
      '[data-mermaid-fullscreen-toggle]',
    );
    if (fullscreen) {
      event.preventDefault();
      viewer.open(fullscreen);
      return;
    }
    if ((event.target as Element)?.closest?.('[data-mermaid-viewer-close]')) {
      viewer.close();
      return;
    }
    const button = (event.target as Element)?.closest?.<HTMLElement>(
      '[data-mermaid-zoom], [data-mermaid-reset]',
    );
    const viewport = button && viewportFor(button);
    if (!button || !viewport?.querySelector('svg')) return;
    event.preventDefault();
    if (button.hasAttribute('data-mermaid-reset')) {
      views.set(viewport, { scale: 1, x: 0, y: 0 });
      apply(viewport);
    } else
      zoom(
        viewport,
        button.dataset.mermaidZoom === 'in' ? 1.25 : 0.8,
        viewport.clientWidth / 2,
        viewport.clientHeight / 2,
      );
  });
  lifecycle.listen(
    document,
    'pointerdown',
    (event) => {
      const pointer = event as PointerEvent;
      const viewport = (pointer.target as Element)?.closest?.<HTMLElement>('[data-mermaid-render]');
      if (pointer.button !== 0 || !viewport?.querySelector('svg')) return;
      pointer.preventDefault();
      viewport.focus({ preventScroll: true });
      viewport.setPointerCapture(pointer.pointerId);
      drag = { viewport, id: pointer.pointerId, x: pointer.clientX, y: pointer.clientY };
      viewport.setAttribute('data-panning', '');
    },
    true,
  );
  lifecycle.listen(document, 'pointermove', (event) => {
    const pointer = event as PointerEvent;
    if (!drag || pointer.pointerId !== drag.id) return;
    if (!drag.viewport.isConnected) {
      drag = null;
      return;
    }
    const view = viewFor(drag.viewport);
    view.x += pointer.clientX - drag.x;
    view.y += pointer.clientY - drag.y;
    drag.x = pointer.clientX;
    drag.y = pointer.clientY;
    apply(drag.viewport);
  });
  const finish = (event: Event) => {
    if (!drag || (event as PointerEvent).pointerId !== drag.id) return;
    drag.viewport.removeAttribute('data-panning');
    if (drag.viewport.hasPointerCapture(drag.id)) drag.viewport.releasePointerCapture(drag.id);
    drag = null;
  };
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    lifecycle.listen(document, name, finish);
  lifecycle.listen(
    document,
    'keydown',
    (event) => {
      const key = event as KeyboardEvent;
      if (key.key === 'Escape' && viewer.isOpen()) {
        key.preventDefault();
        key.stopImmediatePropagation();
        viewer.close();
        return;
      }
      const viewport = (key.target as HTMLElement)?.matches?.('[data-mermaid-render]')
        ? (key.target as HTMLElement)
        : null;
      if (!viewport?.querySelector('svg') || key.ctrlKey || key.metaKey || key.altKey) return;
      if (['+', '=', '-'].includes(key.key)) {
        key.preventDefault();
        zoom(
          viewport,
          key.key === '-' ? 0.8 : 1.25,
          viewport.clientWidth / 2,
          viewport.clientHeight / 2,
        );
      } else if (key.key === '0') {
        key.preventDefault();
        views.set(viewport, { scale: 1, x: 0, y: 0 });
        apply(viewport);
      } else if (key.key.startsWith('Arrow')) {
        key.preventDefault();
        const view = viewFor(viewport);
        view.x += key.key === 'ArrowLeft' ? 40 : key.key === 'ArrowRight' ? -40 : 0;
        view.y += key.key === 'ArrowUp' ? 40 : key.key === 'ArrowDown' ? -40 : 0;
        apply(viewport);
      }
    },
    true,
  );
  return viewer.close;
}

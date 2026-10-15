import type { ControllerLifecycle } from '@/shared/lib/controller-lifecycle';
import { inlineMathAt } from './syntax';
import { renderMathHTML } from './render';

export interface InlineEquationRequest {
  anchor: HTMLElement;
  source: string;
  existing: boolean;
  valid(): boolean;
  apply(source: string | null): void;
  cancel(): void;
}

export interface InlineEquationEditor {
  open(request: InlineEquationRequest): void;
  close(restoreFocus?: boolean): void;
}

export function createInlineEquationEditor(
  panel: HTMLElement,
  lifecycle: ControllerLifecycle,
): InlineEquationEditor {
  const input = panel.querySelector<HTMLTextAreaElement>('[data-equation-input]')!;
  const preview = panel.querySelector<HTMLElement>('[data-equation-preview]')!;
  const error = panel.querySelector<HTMLElement>('[data-equation-error]')!;
  const save = panel.querySelector<HTMLButtonElement>('[data-equation-save]')!;
  const remove = panel.querySelector<HTMLButtonElement>('[data-equation-remove]')!;
  let request: InlineEquationRequest | null = null;

  const position = () => {
    if (!request) return;
    const rect = request.anchor.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - panel.offsetHeight - 8))}px`;
  };

  const source = () => {
    const value = input.value.trim();
    const math = inlineMathAt(value, 0);
    return math?.end === value.length ? math.source : value;
  };
  const update = () => {
    const value = source();
    preview.innerHTML = renderMathHTML(value);
    const failure = preview.querySelector<HTMLElement>('.math-error');
    const message = /[\r\n]/.test(value)
      ? 'Use a LaTeX block for equations with multiple lines.'
      : failure?.title || '';
    error.textContent = message;
    error.hidden = !message;
    input.setAttribute('aria-invalid', String(Boolean(message)));
    save.disabled = !value || Boolean(message);
    position();
  };
  const close = (restoreFocus = false) => {
    const previous = request;
    request = null;
    panel.classList.add('hidden');
    preview.replaceChildren();
    if (restoreFocus && previous?.valid()) previous.cancel();
  };
  const apply = (deleteEquation = false) => {
    if (!request) return;
    if (!request.valid()) {
      close();
      return;
    }
    update();
    if (!deleteEquation && save.disabled) return;
    const current = request;
    const value = deleteEquation ? null : source();
    close();
    current.apply(value);
  };

  lifecycle.listen(input, 'input', update);
  lifecycle.listen(panel, 'keydown', (event) => {
    const key = event as KeyboardEvent;
    key.stopPropagation();
    if (key.isComposing) return;
    if (key.key === 'Escape') {
      key.preventDefault();
      close(true);
    } else if (key.key === 'Enter' && key.target === input) {
      key.preventDefault();
      apply();
    }
  });
  lifecycle.listen(panel, 'click', (event) => {
    const target = event.target as Element;
    if (target.closest('[data-equation-save]')) apply();
    else if (target.closest('[data-equation-remove]')) apply(true);
    else if (target.closest('[data-equation-cancel]')) close(true);
  });
  lifecycle.listen(panel, 'focusout', (event) => {
    const next = (event as FocusEvent).relatedTarget as Node | null;
    if (next && !panel.contains(next)) close();
  });
  lifecycle.listen(
    document,
    'pointerdown',
    (event) => {
      if (request && !panel.contains(event.target as Node)) close();
    },
    true,
  );
  lifecycle.listen(window, 'resize', () => close());
  lifecycle.listen(
    document,
    'scroll',
    (event) => {
      if (!panel.contains(event.target as Node)) close();
    },
    true,
  );

  return {
    close,
    open(next) {
      close();
      request = next;
      input.value = next.source;
      remove.hidden = !next.existing;
      panel.classList.remove('hidden');
      update();
      input.focus({ preventScroll: true });
      input.select();
    },
  };
}

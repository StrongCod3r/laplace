import { createPortal } from 'preact/compat';
import { Fragment } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Icon } from '@/shared/components/Icon';
import styles from './GitPanel.module.css';

export interface FileMenuItem {
  label: string;
  icon: string;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
  action(): void;
}

export function GitFileContextMenu({
  x,
  y,
  count,
  items,
  onClose,
}: {
  x: number;
  y: number;
  count: number;
  items: FileMenuItem[];
  onClose(): void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = menu.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    element.style.left = Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8)) + 'px';
    element.style.top = Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8)) + 'px';
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const dismiss = (event: Event) => {
      if (!element.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('scroll', dismiss, true);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('scroll', dismiss, true);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', onClose);
    };
  }, []);
  return createPortal(
    <div
      ref={menu}
      className={styles.fileContextMenu}
      style={{ left: x, top: y }}
      role="menu"
      aria-label="Git file actions"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const buttons = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
        ];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}
    >
      {count > 1 && <div className={styles.contextCaption}>{count} files selected</div>}
      {items.map((item) => (
        <Fragment key={item.label}>
          {item.separatorBefore && <div className={styles.contextSeparator} role="separator" />}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={item.danger ? styles.dangerAction : undefined}
            onClick={() => {
              onClose();
              item.action();
            }}
          >
            <Icon name={item.icon} size="16" />
            {item.label}
          </button>
        </Fragment>
      ))}
    </div>,
    document.body,
  );
}

export function GitDiscardDialog({
  paths,
  onClose,
  onConfirm,
}: {
  paths: string[];
  onClose(): void;
  onConfirm(): void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancel.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('keydown', escape, true);
      previous?.focus();
    };
  }, []);
  return createPortal(
    <div
      className={styles.discardBackdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={styles.discardDialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="gitDiscardTitle"
        aria-describedby="gitDiscardDescription"
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          event.preventDefault();
          buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
        }}
      >
        <h3 id="gitDiscardTitle">Discard changes?</h3>
        <p id="gitDiscardDescription">
          Restore these files to the last commit and remove new, untracked files. Their staged and
          unstaged changes will be lost.
        </p>
        <ul>
          {paths.map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
        <div className={styles.discardButtons}>
          <button ref={cancel} type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.dangerAction} onClick={onConfirm}>
            Discard changes
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

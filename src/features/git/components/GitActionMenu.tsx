import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Icon } from '@/shared/components/Icon';
import styles from './GitPanel.module.css';

export function GitActionMenu({
  label,
  children,
  commit = false,
  id,
}: {
  label: string;
  children: ComponentChildren;
  commit?: boolean;
  id?: string;
}) {
  const element = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (element.current?.open && !element.current.contains(event.target as Node))
        element.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  return (
    <details
      ref={element}
      className={`${styles.actionDropdown} ${commit ? styles.commitDropdown : ''}`}
      onClick={(event) => {
        if ((event.target as Element).closest('button')) event.currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && event.currentTarget.open) {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.open = false;
          event.currentTarget.querySelector('summary')?.focus();
        }
      }}
    >
      <summary id={id} aria-label={label} title={label}>
        <Icon name={commit ? 'chevron-down' : 'ellipsis'} size="16" />
      </summary>
      <div className={styles.actionMenu}>{children}</div>
    </details>
  );
}

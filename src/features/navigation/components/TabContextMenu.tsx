import { Fragment } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '@/shared/components/Icon';
import { useWorkspaceStore } from '@/store/workspace.store';
import type { WorkspaceController } from '@/features/editor/types';
import styles from './TabContextMenu.module.css';

interface MenuTarget {
  tabId: string | null;
  diff: boolean;
  x: number;
  y: number;
  origin: HTMLElement;
  controller: WorkspaceController;
  vaultId: string | null;
}

interface MenuItem {
  label: string;
  icon: string;
  disabled?: boolean;
  separator?: boolean;
  action(): void;
}

export function TabContextMenu() {
  const [target, setTarget] = useState<MenuTarget | null>(null);
  const controller = useWorkspaceStore((state) => state.controller);
  const vaultId = useWorkspaceStore((state) => state.ui.activeVaultId);
  useEffect(() => setTarget(null), [controller, vaultId]);
  useEffect(() => {
    const open = (event: MouseEvent | KeyboardEvent) => {
      if (
        event.type === 'keydown' &&
        !(
          (event as KeyboardEvent).key === 'ContextMenu' ||
          ((event as KeyboardEvent).shiftKey && (event as KeyboardEvent).key === 'F10')
        )
      )
        return;
      const origin = (event.target as Element)?.closest<HTMLElement>(
        '.editor-tab[data-tab-id], .dock-tab[data-tab-id], [data-diff-tab]',
      );
      const state = useWorkspaceStore.getState();
      if (!origin || !state.controller) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = origin.getBoundingClientRect();
      const pointer = event.type === 'contextmenu' && (event as MouseEvent).button === 2;
      setTarget({
        tabId: origin.dataset.tabId || null,
        diff: origin.hasAttribute('data-diff-tab'),
        x: pointer ? (event as MouseEvent).clientX : rect.left,
        y: pointer ? (event as MouseEvent).clientY : rect.bottom,
        origin,
        controller: state.controller,
        vaultId: state.ui.activeVaultId,
      });
    };
    document.addEventListener('contextmenu', open, true);
    document.addEventListener('keydown', open, true);
    return () => {
      document.removeEventListener('contextmenu', open, true);
      document.removeEventListener('keydown', open, true);
    };
  }, []);

  if (!target || target.controller !== controller || target.vaultId !== vaultId) return null;
  return (
    <TabMenu
      key={`${target.tabId}:${target.x}:${target.y}`}
      target={target}
      onClose={() => setTarget(null)}
    />
  );
}

function TabMenu({ target, onClose }: { target: MenuTarget; onClose(): void }) {
  const menu = useRef<HTMLDivElement>(null);
  const openTabs = useWorkspaceStore((state) => state.ui.tabs);
  const tab = openTabs.find((item) => item.id === target.tabId);
  const tabs = openTabs.filter((item) => item.groupId === tab?.groupId);
  const index = tabs.findIndex((item) => item.id === target.tabId);
  const closeTabs = (ids: string[]) => {
    // Close the active tab last so bulk actions retain the group's navigation context.
    const activeId = useWorkspaceStore.getState().ui.tabs.find((item) => item.active)?.id;
    for (const id of [
      ...ids.filter((id) => id !== activeId),
      ...ids.filter((id) => id === activeId),
    ])
      target.controller.invoke('closeTab', id);
  };
  const items: MenuItem[] = target.diff
    ? [
        {
          label: 'Close comparison',
          icon: 'x',
          action: () => useWorkspaceStore.getState().setGitDiff(null),
        },
      ]
    : [
        { label: 'Close tab', icon: 'x', action: () => closeTabs([target.tabId!]) },
        {
          label: 'Close other tabs',
          icon: 'list-collapse',
          disabled: tabs.length < 2,
          action: () =>
            closeTabs(tabs.filter((item) => item.id !== target.tabId).map((item) => item.id)),
        },
        {
          label: 'Close tabs to the left',
          icon: 'arrow-left',
          disabled: index <= 0,
          action: () => closeTabs(tabs.slice(0, index).map((item) => item.id)),
        },
        {
          label: 'Close tabs to the right',
          icon: 'arrow-right',
          disabled: index < 0 || index === tabs.length - 1,
          action: () => closeTabs(tabs.slice(index + 1).map((item) => item.id)),
        },
        {
          label: 'Close all tabs',
          icon: 'files',
          action: () => closeTabs(tabs.map((item) => item.id)),
        },
        {
          label: 'Reopen closed tab',
          icon: 'refresh-cw',
          separator: true,
          action: () => {
            target.controller.invoke('reopenClosedTab');
          },
        },
        ...(tab?.kind === 'page'
          ? [
              {
                label: 'Duplicate tab',
                icon: 'copy',
                separator: true,
                action: () => {
                  target.controller.invoke('focusEditorGroup', tab.groupId);
                  target.controller.invoke('openPage', tab.pageId, { newTab: true });
                },
              },
              {
                label: 'Split right',
                icon: 'columns-2',
                action: () => {
                  target.controller.invoke('splitTab', tab.id, tab.groupId, 'right');
                },
              },
              {
                label: 'Split down',
                icon: 'rows-2',
                action: () => {
                  target.controller.invoke('splitTab', tab.id, tab.groupId, 'bottom');
                },
              },
            ]
          : []),
      ];

  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(target.x, window.innerWidth - bounds.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(target.y, window.innerHeight - bounds.height - 8))}px`;
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, []);

  useEffect(() => {
    const dismiss = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) onClose();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key !== 'Tab') return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (target.origin.isConnected) target.origin.focus();
      }
      onClose();
    };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('scroll', dismiss, true);
    document.addEventListener('keydown', keydown, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('scroll', dismiss, true);
      document.removeEventListener('keydown', keydown, true);
      window.removeEventListener('resize', onClose);
    };
  }, []);

  return createPortal(
    <div
      ref={menu}
      className={styles.menu}
      role="menu"
      aria-label="Tab actions"
      style={{ left: target.x, top: target.y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const buttons = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
        ];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}
    >
      {items.map((item) => (
        <Fragment key={item.label}>
          {item.separator && <div className={styles.separator} role="separator" />}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              const state = useWorkspaceStore.getState();
              if (
                state.controller !== target.controller ||
                state.ui.activeVaultId !== target.vaultId
              )
                return;
              if (!target.diff && !state.ui.tabs.some((item) => item.id === target.tabId)) return;
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

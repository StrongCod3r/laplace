import { withModuleClasses } from '@/shared/lib/css-classes';
import notesStyles from './Notes.module.css';
import { Icon } from '@/shared/components/Icon';
import { useWorkspaceStore } from '@/store/workspace.store';
import { WorkspaceSelector } from '@/features/workspace/components/WorkspaceSelector';
import { FilesTree } from './FilesTree';
import { GitPanel } from '@/features/git/components/GitPanel';
import { useLayoutEffect, useRef } from 'preact/hooks';

const styles = notesStyles;

export function NotesSidebar() {
  const open = useWorkspaceStore((state) => state.ui.sidebarOpen);
  const mode = useWorkspaceStore((state) => state.ui.leftPanelMode);
  const tree = useWorkspaceStore((state) => state.ui.tree);
  const controller = useWorkspaceStore((state) => state.controller);
  const allExpanded = (items: typeof tree): boolean =>
    items.every(
      (item) =>
        (!(item.kind === 'folder' || item.children.length > 0) || item.expanded) &&
        allExpanded(item.children),
    );
  const shouldCollapse = tree.length > 0 && allExpanded(tree);
  const expandCollapseLabel = shouldCollapse ? 'Collapse all' : 'Expand all';
  const scroll = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = scroll.current;
    if (mode !== 'git' || !element) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        element.classList.toggle('can-scroll', element.scrollHeight > element.clientHeight + 1);
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    const panel = element.querySelector('#gitPanel');
    if (panel) observer.observe(panel);
    update();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [mode]);
  return (
    <aside
      id="sidebar"
      className={withModuleClasses(
        styles,
        `sidebar ${mode === 'git' ? 'git-sidebar' : ''} ${open ? '' : 'collapsed'}`,
      )}
    >
      <div ref={scroll} className={withModuleClasses(styles, 'sidebar-scroll')}>
        <GitPanel />
        <div
          className={withModuleClasses(
            styles,
            `left-sidebar-view ${mode === 'files' ? '' : 'hidden'}`,
          )}
          data-left-panel="files"
        >
          <section className={withModuleClasses(styles, 'sidebar-section')}>
            <div className={withModuleClasses(styles, 'section-title')}>
              <span>Files</span>
              <div className={withModuleClasses(styles, 'section-actions')}>
                <button
                  type="button"
                  className={withModuleClasses(styles, 'tiny-btn')}
                  id="toggleFilesTreeBtn"
                  title={expandCollapseLabel}
                  aria-label={expandCollapseLabel}
                  disabled={!tree.length}
                  onClick={() => controller?.invoke('setFilesTreeExpanded', !shouldCollapse)}
                >
                  <Icon name={shouldCollapse ? 'list-collapse' : 'list-tree'} size="16" />
                </button>
                <button
                  type="button"
                  className={withModuleClasses(styles, 'tiny-btn')}
                  id="refreshNotesBtn"
                  title="Refresh notes from folder"
                  aria-label="Refresh notes"
                >
                  <Icon name="refresh-cw" size="16" />
                </button>
                <button
                  type="button"
                  className={withModuleClasses(styles, 'tiny-btn')}
                  id="revealCurrentFileBtn"
                  title="Reveal current file in Files"
                  aria-label="Reveal current file in Files"
                >
                  <Icon name="locate-fixed" size="16" />
                </button>
                <button
                  type="button"
                  className={withModuleClasses(styles, 'tiny-btn')}
                  id="newFolderBtn"
                  title="New folder"
                  aria-label="Create folder"
                >
                  <Icon name="folder-plus" size="16" />
                </button>
                <button
                  type="button"
                  className={withModuleClasses(styles, 'tiny-btn')}
                  id="newPageBtn"
                  title="New note"
                  aria-label="Create note"
                >
                  <Icon name="file-plus" size="16" />
                </button>
              </div>
            </div>
            <FilesTree />
          </section>
        </div>
        <div
          className={withModuleClasses(
            styles,
            `left-sidebar-view ${mode === 'favorites' ? '' : 'hidden'}`,
          )}
          data-left-panel="favorites"
        >
          <section className={withModuleClasses(styles, 'sidebar-section')}>
            <div className={withModuleClasses(styles, 'section-title')}>
              <span>Favorites</span>
            </div>
            <FilesTree favorites />
          </section>
        </div>
      </div>
      <WorkspaceSelector />
    </aside>
  );
}

import { withModuleClasses } from '@/shared/lib/css-classes';
import notesStyles from './Notes.module.css';
import { NoteIcon } from '@/shared/components/Icon';
import { useWorkspaceStore } from '@/store/workspace.store';

const styles = notesStyles;

export function ContextSidebar() {
  const context = useWorkspaceStore((state) => state.ui.context);
  const open = useWorkspaceStore((state) => state.ui.rightSidebarOpen);
  const mode = useWorkspaceStore((state) => state.ui.rightPanelMode);
  return (
    <aside
      id="rightSidebar"
      className={withModuleClasses(styles, `right-sidebar ${open ? '' : 'collapsed'}`)}
      aria-label="Context sidebar"
    >
      <div className={withModuleClasses(styles, 'right-sidebar-head')}>
        <div className={withModuleClasses(styles, 'right-sidebar-tabs')} role="tablist">
          <button
            className={withModuleClasses(
              styles,
              `right-sidebar-tab ${mode === 'outline' ? 'active' : ''}`,
            )}
            data-right-mode="outline"
            role="tab"
          >
            Outline
          </button>
          <button
            className={withModuleClasses(
              styles,
              `right-sidebar-tab ${mode === 'backlinks' ? 'active' : ''}`,
            )}
            data-right-mode="backlinks"
            role="tab"
          >
            Backlinks
          </button>
        </div>
      </div>
      <div id="rightSidebarContent" className={withModuleClasses(styles, 'right-sidebar-content')}>
        <div className={withModuleClasses(styles, 'right-section-title')}>{context.title}</div>
        {context.empty && (
          <div className={withModuleClasses(styles, 'right-empty compact')}>
            <span>{context.empty}</span>
          </div>
        )}
        {context.headings.map((heading) => (
          <button
            key={heading.id}
            className={withModuleClasses(styles, `outline-item level-${heading.level}`)}
            data-outline-block={heading.id}
          >
            {heading.text}
          </button>
        ))}
        {context.backlinks.map((note) => (
          <button
            key={note.id}
            className={withModuleClasses(styles, 'backlink-item')}
            data-backlink-page={note.id}
          >
            <NoteIcon html={note.iconHTML} />
            <span>
              <b>{note.title}</b>
              <small>
                {note.detail ||
                  `${note.count} link${note.count === 1 ? '' : 's'} · ${note.words} words`}
              </small>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

import { withModuleClasses } from '@/shared/lib/css-classes';
import notesStyles from './Notes.module.css';
import { Fragment } from 'preact';
import { Icon, NoteIcon } from '@/shared/components/Icon';
import { useWorkspaceStore } from '@/store/workspace.store';
import type { TreeItem } from '../types';

const styles = notesStyles;

function Rows({ items, favorites = false }: { items: TreeItem[]; favorites?: boolean }) {
  return items.map((item) => (
    <Fragment key={`${item.kind}:${item.id}`}>
      {item.kind === 'folder' ? (
        <div
          className={withModuleClasses(
            styles,
            `folder-tree-row ${item.active || item.selected ? 'selected' : ''}`,
          )}
          data-item-type="folder"
          data-folder-id={item.id}
          data-folder-path={item.path}
          draggable
          role="treeitem"
          aria-selected={item.selected}
        >
          <button
            className={withModuleClasses(styles, 'tree-expand')}
            data-action="toggle-folder"
            title={`${item.expanded ? 'Collapse' : 'Expand'} folder`}
            aria-label={`${item.expanded ? 'Collapse' : 'Expand'} folder`}
          >
            <Icon
              name={item.expanded ? 'chevron-down' : 'chevron-right'}
              size="14"
              className={withModuleClasses(styles, 'ui-chevron tree-chevron')}
            />
          </button>
          <button
            className={withModuleClasses(styles, 'folder-select-btn')}
            data-action="select-folder"
            title={`Use ${item.title} as the current folder`}
          >
            <span className={withModuleClasses(styles, 'tree-icon folder-icon')}>
              <NoteIcon html={item.iconHTML} />
            </span>
            <span className={withModuleClasses(styles, 'tree-title')}>{item.title}</span>
          </button>
        </div>
      ) : (
        <div
          className={withModuleClasses(
            styles,
            `page-tree-row ${item.selected ? 'selected active' : item.active ? 'active' : ''}`,
          )}
          data-item-type="note"
          data-page-id={item.id}
          draggable
          style={{ paddingLeft: 0 }}
          role="treeitem"
          aria-selected={item.selected}
        >
          {!favorites && item.children.length ? (
            <button
              className={withModuleClasses(styles, 'tree-expand')}
              data-action="toggle-page"
              title="Expand"
              aria-label={item.expanded ? 'Collapse' : 'Expand'}
            >
              <Icon
                name={item.expanded ? 'chevron-down' : 'chevron-right'}
                size="14"
                className={withModuleClasses(styles, 'ui-chevron tree-chevron')}
              />
            </button>
          ) : (
            <span style={{ width: 18 }} />
          )}
          <button
            className={withModuleClasses(styles, 'tree-page-btn')}
            data-action="open-page"
            title="Open page · Middle-click for new tab"
          >
            <span className={withModuleClasses(styles, 'tree-icon')}>
              <NoteIcon html={item.iconHTML} />
            </span>
            <span className={withModuleClasses(styles, 'tree-title')}>{item.title}</span>
          </button>
        </div>
      )}
      {!favorites && item.expanded && item.children.length > 0 && (
        <div className={withModuleClasses(styles, 'page-children')}>
          <Rows items={item.children} />
        </div>
      )}
    </Fragment>
  ));
}

export function FilesTree({ favorites = false }: { favorites?: boolean }) {
  const items = useWorkspaceStore((state) => (favorites ? state.ui.favorites : state.ui.tree));
  return (
    <div
      id={favorites ? 'favoritesList' : 'pageTree'}
      className={withModuleClasses(styles, 'page-list')}
      role="tree"
      aria-label={favorites ? 'Favorites' : 'Files'}
      aria-multiselectable="true"
    >
      {items.length ? (
        <Rows items={items} favorites={favorites} />
      ) : (
        <div className={withModuleClasses(styles, 'left-sidebar-empty')}>
          <Icon name={favorites ? 'star' : 'files'} />
          <b>{favorites ? 'No favorites yet' : 'No notes yet'}</b>
          <small>
            {favorites
              ? 'Star a note to keep it here.'
              : 'Choose a folder or create your first note.'}
          </small>
        </div>
      )}
    </div>
  );
}

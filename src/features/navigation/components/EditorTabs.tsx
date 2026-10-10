import { withModuleClasses } from '@/shared/lib/css-classes';
import navigationStyles from './EditorTabs.module.css';
import { Icon, NoteIcon } from '@/shared/components/Icon';
import { useWorkspaceStore } from '@/store/workspace.store';

const styles = navigationStyles;

export function EditorTabs() {
  const tabs = useWorkspaceStore((state) => state.ui.tabs);
  const gitDiff = useWorkspaceStore((state) => state.gitDiff);
  const closeDiff = () => useWorkspaceStore.getState().setGitDiff(null);
  return (
    <div
      id="editorTabs"
      className={withModuleClasses(styles, 'editor-tabs')}
      role="tablist"
      aria-label="Open pages"
    >
      <div id="tabsScroll" className={withModuleClasses(styles, 'tabs-scroll')}>
        {tabs.length ? (
          tabs.map((tab) => (
            <div
              key={tab.id}
              className={withModuleClasses(
                styles,
                `editor-tab ${tab.active && !gitDiff ? 'active' : ''}`,
              )}
              onClick={closeDiff}
              draggable
              data-tab-id={tab.id}
              data-tab-kind={tab.kind}
              data-page-id={tab.pageId}
              role="tab"
              tabIndex={tab.active && !gitDiff ? 0 : -1}
              aria-selected={tab.active && !gitDiff}
              title={tab.title}
            >
              <span className={withModuleClasses(styles, 'tab-icon')}>
                <NoteIcon html={tab.iconHTML} />
              </span>
              <span className={withModuleClasses(styles, 'tab-title')}>{tab.title}</span>
              <button
                className={withModuleClasses(styles, 'tab-close')}
                data-tab-close={tab.id}
                title="Close"
                aria-label={`Close ${tab.title}`}
              >
                <Icon name="x" size="14" />
              </button>
            </div>
          ))
        ) : !gitDiff ? (
          <div className={withModuleClasses(styles, 'tabs-empty')}>No open pages</div>
        ) : null}
        {gitDiff && (
          <div
            className={withModuleClasses(styles, 'editor-tab active')}
            role="tab"
            aria-selected="true"
            aria-controls="gitDiffEditor"
            title={gitDiff.path}
            onMouseDown={(event) => {
              if (event.button === 1) event.preventDefault();
            }}
            onAuxClick={(event) => {
              if (event.button !== 1) return;
              event.preventDefault();
              event.stopPropagation();
              closeDiff();
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'w') {
                event.preventDefault();
                event.stopPropagation();
                closeDiff();
              }
            }}
            tabIndex={0}
          >
            <span className={withModuleClasses(styles, 'tab-icon')}>
              <Icon name="git-branch" size="14" />
            </span>
            <span className={withModuleClasses(styles, 'tab-title')}>
              {gitDiff.path.split('/').at(-1)} (Changes)
            </span>
            <button
              className={withModuleClasses(styles, 'tab-close')}
              type="button"
              title="Close comparison"
              aria-label="Close comparison"
              onClick={closeDiff}
            >
              <Icon name="x" size="14" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

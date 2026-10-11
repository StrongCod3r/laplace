import { withModuleClasses } from '@/shared/lib/css-classes';
import ribbonStyles from './Ribbon.module.css';
import { Icon } from '@/shared/components/Icon';
import { useWorkspaceStore } from '@/store/workspace.store';

const styles = ribbonStyles;

export function Ribbon() {
  const open = useWorkspaceStore((state) => state.ui.sidebarOpen);
  const panel = useWorkspaceStore((state) => state.ui.leftPanelMode);
  const view = useWorkspaceStore((state) => state.ui.mainView);
  const gitBusy = useWorkspaceStore((state) => state.gitBusy);
  return (
    <aside
      className={withModuleClasses(styles, 'app-ribbon')}
      aria-label="Workspace tools"
      inert={gitBusy}
    >
      <div className={withModuleClasses(styles, 'ribbon-top')}>
        <button
          className={withModuleClasses(styles, 'ribbon-btn')}
          data-ribbon-action="toggle-left"
          title="Toggle left sidebar"
          aria-label="Toggle left sidebar"
          aria-expanded={open}
        >
          <Icon name={open ? 'panel-left-close' : 'panel-left-open'} />
        </button>
        <button
          className={withModuleClasses(
            styles,
            `ribbon-btn ${open && panel === 'files' ? 'active' : ''}`,
          )}
          data-ribbon-action="files"
          title="Files"
          aria-label="Files"
          aria-pressed={open && panel === 'files'}
        >
          <Icon name="files" />
        </button>
        <button
          className={withModuleClasses(
            styles,
            `ribbon-btn ${open && panel === 'favorites' ? 'active' : ''}`,
          )}
          data-ribbon-action="favorites"
          title="Favorites"
          aria-label="Favorites"
          aria-pressed={open && panel === 'favorites'}
        >
          <Icon name="star" />
        </button>
        <button
          className={withModuleClasses(
            styles,
            `ribbon-btn ${open && panel === 'git' ? 'active' : ''}`,
          )}
          data-ribbon-action="git"
          title="Git synchronization"
          aria-label="Git synchronization"
          aria-controls="gitPanel"
          aria-pressed={open && panel === 'git'}
        >
          <Icon name="git-branch" />
        </button>
        <button
          className={withModuleClasses(
            styles,
            `ribbon-btn ${view === 'attachments' ? 'active' : ''}`,
          )}
          data-ribbon-action="attachments"
          title="Attachments"
          aria-label="Attachments"
          aria-pressed={view === 'attachments'}
        >
          <Icon name="paperclip" />
        </button>
        <button
          className={withModuleClasses(styles, 'ribbon-btn')}
          data-ribbon-action="search"
          title="Search (Ctrl+K)"
          aria-label="Search"
        >
          <Icon name="search" />
        </button>
        <button
          className={withModuleClasses(styles, `ribbon-btn ${view === 'graph' ? 'active' : ''}`)}
          data-ribbon-action="graph"
          title="Graph view"
          aria-label="Graph view"
          aria-pressed={view === 'graph'}
        >
          <Icon name="network" />
        </button>
      </div>
      <div className={withModuleClasses(styles, 'ribbon-bottom')}>
        <a
          className={withModuleClasses(styles, 'ribbon-btn')}
          href="https://github.com/strongcod3r/laplace"
          target="_blank"
          rel="noopener noreferrer"
          title="Source code on GitHub"
          aria-label="Source code on GitHub"
        >
          <Icon name="code-xml" />
        </a>
        <button
          className={withModuleClasses(styles, 'ribbon-btn')}
          data-ribbon-action="settings"
          title="Settings"
          aria-label="Settings"
        >
          <Icon name="settings" />
        </button>
      </div>
    </aside>
  );
}

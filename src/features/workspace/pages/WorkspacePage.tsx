import { withModuleClasses } from '@/shared/lib/css-classes';
import layoutStyles from './WorkspacePage.module.css';
import { Ribbon } from '@/app/components/Ribbon';
import { StartupSkeleton } from '@/app/components/StartupSkeleton';
import { Icon } from '@/shared/components/Icon';
import { NotesSidebar } from '@/features/notes/components/NotesSidebar';
import { ContextSidebar } from '@/features/notes/components/ContextSidebar';
import { EditorTabs } from '@/features/navigation/components/EditorTabs';
import { HomeView } from '@/features/dashboard/components/HomeView';
import { GraphView } from '@/features/graph/components/GraphView';
import { EditorSurface } from '@/features/editor/components/EditorSurface';
import { AttachmentsView } from '@/features/attachments/components/AttachmentsView';
import { AttachmentPreview } from '@/features/attachments/components/AttachmentPreview';
import { WorkspaceDialogs } from '../components/WorkspaceDialogs';
import { CommandOverlays } from '@/features/commands/components/CommandOverlays';
import { SettingsDialogs } from '@/features/settings/components/SettingsDialogs';
import { useWorkspaceController } from '@/features/editor/hooks/use-workspace-controller';
import { useWorkspaceStore } from '@/store/workspace.store';
import { GitDiffView } from '@/features/git/components/GitDiffView';

const styles = layoutStyles;

export default function WorkspacePage() {
  const ready = useWorkspaceController();
  const rightOpen = useWorkspaceStore((state) => state.ui.rightSidebarOpen);
  const gitBusy = useWorkspaceStore((state) => state.gitBusy);
  const gitDiff = useWorkspaceStore((state) => state.gitDiff);
  return (
    <>
      {!ready && <StartupSkeleton />}
      <div
        id="app"
        className={withModuleClasses(styles, 'app-shell obsidian-layout')}
        inert={!ready}
      >
        <Ribbon />
        <button
          className={withModuleClasses(styles, 'icon-btn global-right-sidebar-toggle')}
          id="rightSidebarToggle"
          type="button"
          title="Toggle right sidebar"
          aria-label="Toggle right sidebar"
          aria-controls="rightSidebar"
          aria-expanded={rightOpen}
        >
          <Icon name={rightOpen ? 'panel-right-close' : 'panel-right-open'} />
        </button>
        <NotesSidebar />
        <div
          className={withModuleClasses(styles, 'pane-resizer left-resizer')}
          data-resizer="left"
          aria-hidden="true"
        />
        <main
          className={withModuleClasses(styles, 'main-area')}
          inert={gitBusy}
          data-git-diff={gitDiff ? '' : undefined}
        >
          <header className={withModuleClasses(styles, 'topbar')}>
            <div className={withModuleClasses(styles, 'topbar-left')}>
              <div
                id="breadcrumbs"
                className={withModuleClasses(styles, 'breadcrumbs')}
                hidden={Boolean(gitDiff)}
              />
              {gitDiff && <div className={styles.diffBreadcrumb}>Git changes · {gitDiff.path}</div>}
            </div>
            <button
              id="workspaceWritePermissionBtn"
              type="button"
              className={withModuleClasses(styles, 'workspace-permission-btn hidden')}
            >
              Grant write access
            </button>
          </header>
          <EditorTabs />
          <div
            id="workspaceEditorContent"
            className={styles.editorContent}
            hidden={Boolean(gitDiff)}
            inert={Boolean(gitDiff)}
          >
            <HomeView />
            <GraphView />
            <EditorSurface />
            <AttachmentsView />
            <AttachmentPreview />
          </div>
          {gitDiff && <GitDiffView key={gitDiff.id} document={gitDiff} />}
        </main>
        <div
          className={withModuleClasses(styles, 'pane-resizer right-resizer')}
          data-resizer="right"
          aria-hidden="true"
        />
        <ContextSidebar />
      </div>
      <WorkspaceDialogs />
      <CommandOverlays />
      <SettingsDialogs />
      <div id="toast" className={withModuleClasses(styles, 'toast hidden')} />
    </>
  );
}

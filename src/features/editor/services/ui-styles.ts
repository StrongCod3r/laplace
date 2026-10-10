import layoutStyles from '@/features/workspace/pages/WorkspacePage.module.css';
import ribbonStyles from '@/app/components/Ribbon.module.css';
import notesStyles from '@/features/notes/components/Notes.module.css';
import workspaceStyles from '@/features/workspace/components/Workspace.module.css';
import navigationStyles from '@/features/navigation/components/EditorTabs.module.css';
import dashboardStyles from '@/features/dashboard/components/HomeView.module.css';
import graphStyles from '@/features/graph/components/GraphView.module.css';
import attachmentsStyles from '@/features/attachments/components/Attachments.module.css';
import settingsStyles from '@/features/settings/components/SettingsDialogs.module.css';
import commandsStyles from '@/features/commands/components/CommandOverlays.module.css';
import editorStyles from '@/features/editor/components/EditorSurface.module.css';

/** Shared presentation classes for UI rendered by the imperative editor, including docked panes. */
export const uiStyles = {
  ...layoutStyles,
  ...ribbonStyles,
  ...notesStyles,
  ...workspaceStyles,
  ...navigationStyles,
  ...dashboardStyles,
  ...graphStyles,
  ...attachmentsStyles,
  ...settingsStyles,
  ...commandsStyles,
  ...editorStyles,
};

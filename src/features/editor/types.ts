import type { ControllerLifecycle } from '@/shared/lib/controller-lifecycle';
import type { WorkspaceDocument } from '@/features/workspace/types';

export type WorkspaceAction =
  | 'openPage'
  | 'createPage'
  | 'openGraphTab'
  | 'openAttachmentsTab'
  | 'openSettings'
  | 'openCommandPalette'
  | 'cycleTheme'
  | 'undoWorkspace'
  | 'redoWorkspace'
  | 'chooseMarkdownDirectory'
  | 'switchWorkspaceLocation'
  | 'refreshMarkdownWorkspace'
  | 'setFilesTreeExpanded'
  | 'getGitDirectory'
  | 'beginGitOperation'
  | 'endGitOperation'
  | 'requestWorkspaceWriteAccess'
  | 'saveBrowserWorkspaceLocally'
  | 'activateTab'
  | 'closeTab'
  | 'cancelPageOperations'
  | 'requestCloseSelectedWorkspace'
  | 'exportWorkspace'
  | 'serializeMarkdownWorkspace'
  | 'workspaceFromMarkdown'
  | 'parseMarkdownBlocks'
  | 'cleanupUnusedAttachments';

export interface WorkspaceController {
  start(): Promise<void>;
  dispose(): void;
  invoke(action: WorkspaceAction, ...args: unknown[]): unknown;
  getDocument(): WorkspaceDocument;
  flush(): Promise<boolean>;
}

/** Dynamic dependencies of the preserved editor algorithms, internal to the controller. */
export interface EditorRuntime {
  lifecycle: ControllerLifecycle;
  publish(): void;
  selectImageBlock?: (id: string) => boolean;
  clearSelectedImageBlock?: () => void;
  copySelectedImageBlockToClipboard?: (event: ClipboardEvent) => boolean;
  cutSelectedImageBlock?: (event: ClipboardEvent) => boolean;
  deleteSelectedImageBlock?: (id: string) => boolean;
  pasteCopiedImageBlock?: (event: ClipboardEvent) => boolean;
  copyAttachmentToClipboard?: (path: string) => boolean;
  deleteAttachmentFromGallery?: (path: string) => Promise<void>;
  selectAttachmentForBacklinks?: (path: string) => boolean;
  selectedAttachmentPath?: string | null;
  [dependency: string]: unknown;
}

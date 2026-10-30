import type { ControllerLifecycle } from '@/shared/lib/controller-lifecycle';
import type { Block, WorkspaceDocument } from '@/features/workspace/types';

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
  | 'createWebWorkspace'
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
  | 'reopenClosedTab'
  | 'cancelPageOperations'
  | 'requestCloseSelectedWorkspace'
  | 'resetAppSettings'
  | 'serializeMarkdownWorkspace'
  | 'workspaceFromMarkdown'
  | 'parseMarkdownBlocks'
  | 'cleanupUnusedAttachments'
  | 'setAttachmentGalleryFilter';

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
  deferPublication(update: () => void): void;
  captureHistoryBeforeInput(event: Pick<InputEvent, 'inputType'>): void;
  replaceSelectedPageContents(text: string, blocks?: Block[]): boolean;
  replaceMultiBlockSelection(blocks: Block[]): boolean;
  togglePagePlainText(): void;
  syncPlainTextView(root: HTMLElement | null, page: unknown, tabId?: string): void;
  openInlineEquation(
    content: HTMLElement,
    range?: { start: number; end: number } | null,
    initialSource?: string | null,
  ): void;
  closeInlineEquation(): void;
  closeMermaidViewer(): void;
  selectImageBlock?: (id: string) => boolean;
  navigateImageBlockViewer(direction: number): void;
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

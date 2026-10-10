export type Theme = 'system' | 'light' | 'dark';
export type PageFont = 'system' | 'arial' | 'georgia' | 'serif' | 'monospace';
export type WorkspaceAccess = 'checking' | 'writable' | 'readonly' | 'blocked';

export interface Block {
  id: string;
  type: string;
  text?: string;
  tableColumnAlignments?: ('left' | 'center' | 'right')[];
  tableCellInline?: (Record<string, unknown> | null)[][];
  blocks?: Block[];
  [field: string]: unknown;
}

export interface Note {
  id: string;
  title: string;
  icon?: string;
  parentId?: string | null;
  folderId?: string | null;
  expanded?: boolean;
  favorite?: boolean;
  filePath?: string;
  blocks: Block[];
  [field: string]: unknown;
}

export interface WorkspaceFolder {
  id: string;
  path: string;
  name: string;
  expanded?: boolean;
  icon?: string;
  explicit?: boolean;
  [field: string]: unknown;
}

export interface EditorTab {
  id: string;
  kind: 'page' | 'graph' | 'attachments';
  pageId?: string;
  groupId: string;
}

export interface WorkspaceDocument {
  theme: Theme;
  pageFont?: PageFont;
  pages: Note[];
  folders: WorkspaceFolder[];
  openTabs: EditorTab[];
  currentPageId: string;
  activeTabId: string | null;
  sidebarOpen: boolean;
  rightSidebarOpen: boolean;
  leftPanelMode: 'files' | 'favorites' | 'git';
  rightPanelMode: 'outline' | 'backlinks';
  mainView: 'page' | 'graph' | 'attachments';
  activeFolderPath?: string;
  editorScrollPositions?: Record<string, { top: number }>;
  [field: string]: unknown;
}

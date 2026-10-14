import type { WorkspaceDocument } from '@/features/workspace/types';

export const HISTORY_NAVIGATION_KEYS = [
  'openTabs',
  'currentPageId',
  'activeTabId',
  'activeEditorGroupId',
  'editorLayout',
  'mainView',
  'activeFolderPath',
  'editorScrollPositions',
] as const;

export interface HistoryEditorFocus {
  pageId: string;
  groupId: string;
  kind: 'block' | 'title' | 'code' | 'table';
  blockId?: string;
  cell?: string;
  offset: number;
}

/** Restore content without replaying navigation, unless the current note was removed. */
export function preserveHistoryNavigation(
  restored: WorkspaceDocument,
  current: WorkspaceDocument,
): WorkspaceDocument {
  if (
    current.mainView === 'page' &&
    current.currentPageId !== '__home__' &&
    !restored.pages.some((page) => page.id === current.currentPageId)
  )
    return restored;

  const navigation: Record<string, unknown> = restored;
  for (const key of HISTORY_NAVIGATION_KEYS) {
    if (Object.hasOwn(current, key)) navigation[key] = structuredClone(current[key]);
    else delete navigation[key];
  }
  const pages = new Set(restored.pages.map((page) => page.id));
  restored.openTabs = restored.openTabs.filter(
    (tab) => tab.kind !== 'page' || pages.has(tab.pageId || ''),
  );
  if (
    restored.activeFolderPath &&
    !restored.folders.some((folder) => folder.path === restored.activeFolderPath)
  )
    restored.activeFolderPath = '';
  return restored;
}

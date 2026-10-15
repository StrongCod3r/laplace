import { create } from 'zustand';
import { flushSync } from 'preact/compat';
import type { AttachmentEntry, WorkspaceLocation } from '@/storage';
import type {
  Note,
  WorkspaceAccess,
  WorkspaceDocument,
  WorkspaceFolder,
} from '@/features/workspace/types';
import type { TreeItem } from '@/features/notes/types';
import type { TabSummary } from '@/features/navigation/types';
import type { RecentNote } from '@/features/dashboard/types';
import type { GraphModel } from '@/features/graph/types';
import type { GalleryModel } from '@/features/attachments/types';
import { attachmentReferences } from '@/features/attachments/services/attachment-references';
import type { WorkspaceController } from '@/features/editor/types';
import type { GitDiffDocument } from '@/features/git/types';

interface ContextModel {
  title: string;
  empty: string;
  headings: Array<{ id: string; text: string; level: string }>;
  backlinks: Array<{
    id: string;
    title: string;
    iconHTML: string;
    count: number;
    words: number;
    detail?: string;
  }>;
}

interface WorkspaceUI {
  theme: WorkspaceDocument['theme'];
  access: WorkspaceAccess;
  sidebarOpen: boolean;
  rightSidebarOpen: boolean;
  leftPanelMode: WorkspaceDocument['leftPanelMode'];
  rightPanelMode: WorkspaceDocument['rightPanelMode'];
  mainView: WorkspaceDocument['mainView'];
  currentPageId: string;
  activeVaultId: string | null;
  locations: WorkspaceLocation[];
  tabs: TabSummary[];
  tree: TreeItem[];
  favorites: TreeItem[];
  recent: RecentNote[];
  graph: GraphModel;
  gallery: GalleryModel;
  context: ContextModel;
}

interface WorkspaceStore {
  ui: WorkspaceUI;
  gitBusy: boolean;
  gitDiff: GitDiffDocument | null;
  controller: WorkspaceController | null;
  setGitBusy(busy: boolean): void;
  setGitDiff(diff: GitDiffDocument | null): void;
  setController(controller: WorkspaceController | null): void;
}

const initialUI: WorkspaceUI = {
  theme: 'system',
  access: 'checking',
  sidebarOpen: true,
  rightSidebarOpen: true,
  leftPanelMode: 'files',
  rightPanelMode: 'outline',
  mainView: 'page',
  currentPageId: '__home__',
  activeVaultId: null,
  locations: [],
  tabs: [],
  tree: [],
  favorites: [],
  recent: [],
  graph: { nodes: [], edges: [], scale: 1, panX: 0, panY: 0 },
  gallery: {
    items: [],
    count: 0,
    page: 0,
    pageCount: 1,
    selectedPath: null,
    loading: false,
    error: '',
  },
  context: { title: '', empty: '', headings: [], backlinks: [] },
};

export const useWorkspaceStore = create<WorkspaceStore>()((set) => ({
  ui: initialUI,
  gitBusy: false,
  gitDiff: null,
  controller: null,
  setGitBusy: (gitBusy) => set({ gitBusy }),
  setGitDiff: (gitDiff) => set({ gitDiff }),
  setController: (controller) => set({ controller, ...(!controller ? { gitDiff: null } : {}) }),
}));

interface SnapshotRuntime {
  pageIconFor(page: Note): string;
  pageIconMarkup(icon: string): string;
  iconMarkup(icon: string): string;
  implicitPageFolderPaths(): Set<string>;
  implicitPageFolderPath(page: Note): string;
  folderParentPath(path: string): string;
  pageFolderPath(page: Note): string;
  pagesInFolder(path: string): Note[];
  childrenOf(id: string): Note[];
  filesTreeSelection: Set<string>;
  filesTreeSelectionCleared: boolean;
  countWords(page: Note): number;
  buildPageGraph(): {
    nodes: Array<{ id: string; title: string; current: boolean; degree: number }>;
    edges: GraphModel['edges'];
  };
  graphLayout(
    graph: ReturnType<SnapshotRuntime['buildPageGraph']>,
  ): Map<string, { x: number; y: number }>;
  graphViewRuntime: { scale: number; panX: number; panY: number };
  flattenBlocks(blocks: Note['blocks']): Note['blocks'];
  pagesLinkingTo(id: string): Note[];
  pageLinkCountTo(page: Note, id: string): number;
  attachmentListItems: AttachmentEntry[];
  attachmentListLoading: boolean;
  attachmentListError: string;
  attachmentGalleryPage: number;
  ATTACHMENT_GALLERY_PAGE_SIZE: number;
  isImageAttachment(item: AttachmentEntry): boolean;
  attachmentRelativePath(path: string): string;
  formatAttachmentSize(size: number): string;
  attachmentIcon(item: AttachmentEntry): string;
  attachmentObjectUrls: Map<string, string>;
  normalizeAttachmentPath(value: string): string;
  selectedAttachmentPath?: string | null;
}

let lastSerialized = '';
export function publishWorkspace(
  document: WorkspaceDocument,
  access: WorkspaceAccess,
  locations: WorkspaceLocation[],
  activeVaultId: string | null,
  runtime: SnapshotRuntime,
) {
  const iconFor = (page: Note) => runtime.pageIconMarkup(runtime.pageIconFor(page));
  const hidden = runtime.implicitPageFolderPaths();
  const seen = new Set<string>();
  const foldersAt = (path: string) =>
    document.folders
      .filter(
        (folder) => runtime.folderParentPath(folder.path) === path && !hidden.has(folder.path),
      )
      .sort((a, b) => a.name.localeCompare(b.name));

  function folderItem(folder: WorkspaceFolder): TreeItem {
    const key = `folder:${folder.id}`;
    if (seen.has(key))
      return {
        id: folder.id,
        kind: 'folder',
        title: folder.name,
        path: folder.path,
        iconHTML: '',
        expanded: false,
        active: false,
        selected: false,
        children: [],
      };
    seen.add(key);
    return {
      id: folder.id,
      kind: 'folder',
      title: folder.name,
      path: folder.path,
      iconHTML:
        folder.expanded !== false
          ? runtime.iconMarkup('folder-open')
          : runtime.pageIconMarkup(folder.icon || 'lucide:folder'),
      expanded: folder.expanded !== false,
      active: !runtime.filesTreeSelectionCleared && document.activeFolderPath === folder.path,
      selected: runtime.filesTreeSelection.has(key),
      children: contents(folder.path),
    };
  }

  function noteItem(page: Note, recursive = true): TreeItem {
    const key = `page:${page.id}`;
    const revisit = seen.has(key);
    seen.add(key);
    const childPath = runtime.implicitPageFolderPath(page);
    const extra =
      recursive && !revisit
        ? document.folders
            .filter((folder) => folder.path === childPath && hidden.has(folder.path))
            .filter(
              (folder) =>
                document.pages.some(
                  (item) => !item.parentId && runtime.pageFolderPath(item) === folder.path,
                ) ||
                document.folders.some(
                  (item) =>
                    runtime.folderParentPath(item.path) === folder.path && !hidden.has(item.path),
                ),
            )
        : [];
    return {
      id: page.id,
      kind: 'note',
      title: page.title || 'Untitled',
      iconHTML: iconFor(page),
      expanded: page.expanded !== false,
      active:
        !runtime.filesTreeSelectionCleared &&
        !document.activeFolderPath &&
        page.id === document.currentPageId,
      selected: runtime.filesTreeSelection.has(key),
      children:
        recursive && !revisit
          ? [...runtime.childrenOf(page.id).map((item) => noteItem(item)), ...extra.map(folderItem)]
          : [],
    };
  }
  function contents(path: string): TreeItem[] {
    return [
      ...foldersAt(path).map(folderItem),
      ...runtime.pagesInFolder(path).map((page) => noteItem(page)),
    ];
  }

  const tree = contents('');
  const favorites = document.pages
    .filter((page) => page.favorite)
    .map((page) => noteItem(page, false));
  const byId = new Map(document.pages.map((page) => [page.id, page]));
  const tabs: TabSummary[] = (document.openTabs || []).flatMap((tab) => {
    const page = byId.get(tab.pageId || '');
    if (tab.kind === 'page' && !page) return [];
    return [
      {
        id: tab.id,
        kind: tab.kind,
        pageId: tab.pageId,
        active: tab.id === document.activeTabId,
        title:
          tab.kind === 'graph'
            ? 'Graph view'
            : tab.kind === 'attachments'
              ? 'Attachments'
              : page?.title || 'Untitled',
        iconHTML: page
          ? iconFor(page)
          : runtime.iconMarkup(tab.kind === 'graph' ? 'network' : 'paperclip'),
      },
    ];
  });
  const recent = document.pages
    .slice()
    .reverse()
    .slice(0, 6)
    .map((page) => ({
      id: page.id,
      title: page.title || 'Untitled',
      iconHTML: iconFor(page),
      words: runtime.countWords(page),
      blocks: page.blocks.length,
    }));
  let graph: GraphModel = {
    nodes: [],
    edges: [],
    scale: runtime.graphViewRuntime.scale,
    panX: runtime.graphViewRuntime.panX,
    panY: runtime.graphViewRuntime.panY,
  };
  if (document.mainView === 'graph') {
    const built = runtime.buildPageGraph();
    const positions = runtime.graphLayout(built);
    graph = {
      nodes: built.nodes.map((node) => ({
        ...node,
        ...(positions.get(node.id) || { x: 500, y: 350 }),
      })),
      edges: built.edges,
      scale: runtime.graphViewRuntime.scale,
      panX: runtime.graphViewRuntime.panX,
      panY: runtime.graphViewRuntime.panY,
    };
  }
  const pageCount = Math.max(
    1,
    Math.ceil(runtime.attachmentListItems.length / runtime.ATTACHMENT_GALLERY_PAGE_SIZE),
  );
  const galleryPage = Math.max(0, Math.min(runtime.attachmentGalleryPage, pageCount - 1));
  const referencesByAttachment =
    document.mainView === 'attachments'
      ? attachmentReferences(document.pages, runtime.attachmentListItems, (path) =>
          runtime.normalizeAttachmentPath(path),
        )
      : (new Map() as ReturnType<typeof attachmentReferences>);
  const gallery: GalleryModel = {
    items: runtime.attachmentListItems
      .slice(
        galleryPage * runtime.ATTACHMENT_GALLERY_PAGE_SIZE,
        (galleryPage + 1) * runtime.ATTACHMENT_GALLERY_PAGE_SIZE,
      )
      .map((item) => ({
        path: item.path,
        name: item.name,
        image: runtime.isImageAttachment(item),
        iconHTML: runtime.attachmentIcon(item),
        source: runtime.attachmentObjectUrls.get(item.path),
        references: Array.from(
          referencesByAttachment.get(runtime.normalizeAttachmentPath(item.path))?.values() || [],
        ).sort((left, right) => left.title.localeCompare(right.title)),
      })),
    count: runtime.attachmentListItems.length,
    page: galleryPage,
    pageCount,
    selectedPath: runtime.selectedAttachmentPath || null,
    loading: runtime.attachmentListLoading,
    error: runtime.attachmentListError,
  };
  const current = byId.get(document.currentPageId);
  const context: ContextModel = {
    title: current?.title || 'Untitled',
    empty: '',
    headings: [],
    backlinks: [],
  };
  if (document.mainView === 'graph') {
    context.title = 'Graph';
    context.empty = `${graph.nodes.length} notes · ${graph.edges.length} links`;
  } else if (document.mainView === 'attachments') {
    if (document.rightPanelMode === 'backlinks') {
      const selectedPath = runtime.normalizeAttachmentPath(runtime.selectedAttachmentPath || '');
      const attachment = runtime.attachmentListItems.find(
        (item) => runtime.normalizeAttachmentPath(item.path) === selectedPath,
      );
      const references = attachment
        ? Array.from(referencesByAttachment.get(selectedPath)?.values() || [])
        : [];
      if (!attachment) {
        context.title = 'Attachment references';
        context.empty = 'Select an attachment to see which pages use it.';
      } else {
        context.title = attachment.name;
        context.empty = references.length ? '' : 'Not referenced by any page.';
        context.backlinks = references.flatMap((reference) => {
          const page = byId.get(reference.pageId);
          return page
            ? [
                {
                  id: page.id,
                  title: page.title || 'Untitled',
                  iconHTML: iconFor(page),
                  count: reference.count,
                  words: runtime.countWords(page),
                  detail: `${reference.count} reference${reference.count === 1 ? '' : 's'}`,
                },
              ]
            : [];
        });
      }
    } else {
      context.title = 'Attachments';
      context.empty = `${gallery.count} files`;
    }
  } else if (!current || document.currentPageId === '__home__') {
    context.title = 'No note selected';
    context.empty = 'Open a page to see its outline and linked mentions.';
  } else if (document.rightPanelMode === 'backlinks') {
    context.title = 'Linked mentions';
    context.backlinks = runtime.pagesLinkingTo(current.id).map((page) => ({
      id: page.id,
      title: page.title || 'Untitled',
      iconHTML: iconFor(page),
      count: runtime.pageLinkCountTo(page, current.id),
      words: runtime.countWords(page),
    }));
    if (!context.backlinks.length)
      context.empty = 'No backlinks yet. Add a Link to page block from another note.';
  } else {
    context.headings = runtime
      .flattenBlocks(current.blocks)
      .filter((block) => ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(block.type) && block.text?.trim())
      .map((block) => ({ id: block.id, text: block.text || '', level: block.type.slice(1) }));
    if (!context.headings.length)
      context.empty = 'No headings in this note. Add H1 through H6 blocks to build an outline.';
  }
  const ui: WorkspaceUI = {
    theme: document.theme,
    access,
    sidebarOpen: document.sidebarOpen,
    rightSidebarOpen: document.rightSidebarOpen,
    leftPanelMode: document.leftPanelMode,
    rightPanelMode: document.rightPanelMode,
    mainView: document.mainView,
    currentPageId: document.currentPageId,
    activeVaultId,
    locations: locations.map((location) => ({ ...location })),
    tabs,
    tree,
    favorites,
    recent,
    graph,
    gallery,
    context,
  };
  const serialized = JSON.stringify(ui);
  if (serialized === lastSerialized) return;
  lastSerialized = serialized;
  // DOM adapters query chrome synchronously after an action. Commit before returning.
  const previous = useWorkspaceStore.getState().ui;
  const navigated =
    previous.activeVaultId !== ui.activeVaultId ||
    previous.locations.find((item) => item.active)?.id !==
      ui.locations.find((item) => item.active)?.id ||
    previous.mainView !== ui.mainView ||
    previous.currentPageId !== ui.currentPageId ||
    previous.tabs.find((tab) => tab.active)?.id !== ui.tabs.find((tab) => tab.active)?.id;
  flushSync(() => useWorkspaceStore.setState({ ui, ...(navigated ? { gitDiff: null } : {}) }));
}

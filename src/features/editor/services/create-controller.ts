// @ts-nocheck
import { APP_NAME } from './../../../app-identity';
// Runtime ownership: rich text DOM and existing file synchronization algorithms.
import { STORAGE_CONFIG } from '@/config';
import { hydrateStaticIcons, iconMarkup } from '@/icons';
import {
  createStorageGateway,
  hasForbiddenFilesystemNameCharacters,
  validateFilesystemName,
} from '@/storage';
import { ControllerLifecycle } from '@/shared/lib/controller-lifecycle';
import { withHtmlModuleClasses, withModuleClasses } from '@/shared/lib/css-classes';
import { uiStyles } from './ui-styles';
import { publishWorkspace } from '@/store/workspace.store';
import type { WorkspaceController, EditorRuntime } from '../types';
import { registerSettings } from '@/features/settings/services/register';
import { registerWorkspace } from '@/features/workspace/services/register';
import { registerHistory } from '@/features/history/services/register';
import { registerNavigation } from '@/features/navigation/services/register';
import { registerNotes } from '@/features/notes/services/register';
import { registerAttachments } from '@/features/attachments/services/register';
import { registerGraph } from '@/features/graph/services/register';
import { registerDashboard } from '@/features/dashboard/services/register';
import { registerEditor } from '@/features/editor/services/register';
import { registerTables } from '@/features/tables/services/register';
import { registerCode } from '@/features/code/services/register';
import { registerInteractions } from '@/features/interactions/services/register';
import { registerMarkdown } from '@/features/markdown/services/register';
import { registerCommands } from '@/features/commands/services/register';

export function createWorkspaceController(): WorkspaceController {
  const lifecycle = new ControllerLifecycle();
  let publicationDepth = 0;
  const runtime: EditorRuntime = {
    lifecycle,
    publish: () => {
      if (!lifecycle.disposed && publicationDepth === 0)
        publishWorkspace(state, workspaceAccess, workspaceLocations, activeVaultId, runtime);
    },
    deferPublication: (update) => {
      publicationDepth++;
      try {
        update();
      } finally {
        publicationDepth--;
        runtime.publish();
      }
    },
  };
  Object.defineProperties(runtime, {
    confirmedPageDeletions: { value: new Set<string>() },
    gitOperationActive: { value: false, writable: true },
    htmlWithStyles: { value: (html: string) => withHtmlModuleClasses(uiStyles, html) },
    classWithStyles: { value: (classes: string) => withModuleClasses(uiStyles, classes) },
    localStorageGateway: { get: () => localStorageGateway },
    storageGateway: {
      get: () => storageGateway,
      set: (value) => {
        storageGateway = value;
      },
    },
    uid: { get: () => uid },
    clone: { get: () => clone },
    DEFAULT_PAGE_ICON: { get: () => DEFAULT_PAGE_ICON },
    DEFAULT_FOLDER_ICON: { get: () => DEFAULT_FOLDER_ICON },
    MAIN_EDITOR_GROUP: { get: () => MAIN_EDITOR_GROUP },
    DEFAULT_SHORTCUTS: { get: () => DEFAULT_SHORTCUTS },
    SHORTCUT_ACTIONS: { get: () => SHORTCUT_ACTIONS },
    RESERVED_SHORTCUTS: { get: () => RESERVED_SHORTCUTS },
    DEFAULT_WORKSPACE: { get: () => DEFAULT_WORKSPACE },
    DEFAULT_BROWSER_WORKSPACE: { get: () => DEFAULT_BROWSER_WORKSPACE },
    BLOCK_TYPES: { get: () => BLOCK_TYPES },
    CODE_LANGUAGES: { get: () => CODE_LANGUAGES },
    CODE_KEYWORDS: { get: () => CODE_KEYWORDS },
    EMOJI_CATALOG: { get: () => EMOJI_CATALOG },
    ICON_OPTIONS: { get: () => ICON_OPTIONS },
    vaultRegistry: {
      get: () => vaultRegistry,
      set: (value) => {
        vaultRegistry = value;
      },
    },
    activeVaultId: {
      get: () => activeVaultId,
      set: (value) => {
        activeVaultId = value;
      },
    },
    workspaceLocations: {
      get: () => workspaceLocations,
      set: (value) => {
        workspaceLocations = value;
      },
    },
    workspaceLocationSwitching: {
      get: () => workspaceLocationSwitching,
      set: (value) => {
        workspaceLocationSwitching = value;
      },
    },
    workspaceLocationClosing: {
      get: () => workspaceLocationClosing,
      set: (value) => {
        workspaceLocationClosing = value;
      },
    },
    browserWorkspaceCopying: {
      get: () => browserWorkspaceCopying,
      set: (value) => {
        browserWorkspaceCopying = value;
      },
    },
    pendingWorkspaceCloseId: {
      get: () => pendingWorkspaceCloseId,
      set: (value) => {
        pendingWorkspaceCloseId = value;
      },
    },
    deleteConfirmResolver: {
      get: () => deleteConfirmResolver,
      set: (value) => {
        deleteConfirmResolver = value;
      },
    },
    state: {
      get: () => state,
      set: (value) => {
        state = value;
      },
    },
    workspaceAccess: {
      get: () => workspaceAccess,
      set: (value) => {
        workspaceAccess = value;
      },
    },
    lastSyncedWorkspace: {
      get: () => lastSyncedWorkspace,
      set: (value) => {
        lastSyncedWorkspace = value;
      },
    },
    workspacePermissionCheck: {
      get: () => workspacePermissionCheck,
      set: (value) => {
        workspacePermissionCheck = value;
      },
    },
    lastReadOnlyNoticeAt: {
      get: () => lastReadOnlyNoticeAt,
      set: (value) => {
        lastReadOnlyNoticeAt = value;
      },
    },
    storageDbPromise: {
      get: () => storageDbPromise,
      set: (value) => {
        storageDbPromise = value;
      },
    },
    storageWriteChain: {
      get: () => storageWriteChain,
      set: (value) => {
        storageWriteChain = value;
      },
    },
    attachmentObjectUrls: { get: () => attachmentObjectUrls },
    pendingAttachmentLoads: { get: () => pendingAttachmentLoads },
    attachmentCacheGeneration: {
      get: () => attachmentCacheGeneration,
      set: (value) => {
        attachmentCacheGeneration = value;
      },
    },
    attachmentListItems: {
      get: () => attachmentListItems,
      set: (value) => {
        attachmentListItems = value;
      },
    },
    attachmentListLoaded: {
      get: () => attachmentListLoaded,
      set: (value) => {
        attachmentListLoaded = value;
      },
    },
    attachmentListLoading: {
      get: () => attachmentListLoading,
      set: (value) => {
        attachmentListLoading = value;
      },
    },
    attachmentListError: {
      get: () => attachmentListError,
      set: (value) => {
        attachmentListError = value;
      },
    },
    attachmentListRequest: {
      get: () => attachmentListRequest,
      set: (value) => {
        attachmentListRequest = value;
      },
    },
    attachmentGalleryPage: {
      get: () => attachmentGalleryPage,
      set: (value) => {
        attachmentGalleryPage = value;
      },
    },
    selectedAttachmentPath: {
      get: () => selectedAttachmentPath,
      set: (value) => {
        selectedAttachmentPath = value;
      },
    },
    ATTACHMENT_GALLERY_PAGE_SIZE: { get: () => ATTACHMENT_GALLERY_PAGE_SIZE },
    eventsBound: {
      get: () => eventsBound,
      set: (value) => {
        eventsBound = value;
      },
    },
    activeSlashBlockId: {
      get: () => activeSlashBlockId,
      set: (value) => {
        activeSlashBlockId = value;
      },
    },
    slashIndex: {
      get: () => slashIndex,
      set: (value) => {
        slashIndex = value;
      },
    },
    activeEmojiBlockId: {
      get: () => activeEmojiBlockId,
      set: (value) => {
        activeEmojiBlockId = value;
      },
    },
    emojiIndex: {
      get: () => emojiIndex,
      set: (value) => {
        emojiIndex = value;
      },
    },
    emojiTokenStart: {
      get: () => emojiTokenStart,
      set: (value) => {
        emojiTokenStart = value;
      },
    },
    emojiTokenEnd: {
      get: () => emojiTokenEnd,
      set: (value) => {
        emojiTokenEnd = value;
      },
    },
    emojiMatches: {
      get: () => emojiMatches,
      set: (value) => {
        emojiMatches = value;
      },
    },
    commandIndex: {
      get: () => commandIndex,
      set: (value) => {
        commandIndex = value;
      },
    },
    shortcutCaptureAction: {
      get: () => shortcutCaptureAction,
      set: (value) => {
        shortcutCaptureAction = value;
      },
    },
    dragBlockId: {
      get: () => dragBlockId,
      set: (value) => {
        dragBlockId = value;
      },
    },
    dragTabId: {
      get: () => dragTabId,
      set: (value) => {
        dragTabId = value;
      },
    },
    dragPageId: {
      get: () => dragPageId,
      set: (value) => {
        dragPageId = value;
      },
    },
    dragPageIds: {
      get: () => dragPageIds,
      set: (value) => {
        dragPageIds = value;
      },
    },
    dragFolderPath: {
      get: () => dragFolderPath,
      set: (value) => {
        dragFolderPath = value;
      },
    },
    pageDrop: {
      get: () => pageDrop,
      set: (value) => {
        pageDrop = value;
      },
    },
    folderDrop: {
      get: () => folderDrop,
      set: (value) => {
        folderDrop = value;
      },
    },
    filesTreeSelectionCleared: {
      get: () => filesTreeSelectionCleared,
      set: (value) => {
        filesTreeSelectionCleared = value;
      },
    },
    filesTreeSelection: {
      get: () => filesTreeSelection,
      set: (value) => {
        filesTreeSelection = value;
      },
    },
    filesTreeSelectionAnchor: {
      get: () => filesTreeSelectionAnchor,
      set: (value) => {
        filesTreeSelectionAnchor = value;
      },
    },
    filesTreeSelectionScope: {
      get: () => filesTreeSelectionScope,
      set: (value) => {
        filesTreeSelectionScope = value;
      },
    },
    treeContextSelection: {
      get: () => treeContextSelection,
      set: (value) => {
        treeContextSelection = value;
      },
    },
    dockDrop: {
      get: () => dockDrop,
      set: (value) => {
        dockDrop = value;
      },
    },
    tableAxisDrag: {
      get: () => tableAxisDrag,
      set: (value) => {
        tableAxisDrag = value;
      },
    },
    activeImageBlockId: {
      get: () => activeImageBlockId,
      set: (value) => {
        activeImageBlockId = value;
      },
    },
    activeImageLinkBlockId: {
      get: () => activeImageLinkBlockId,
      set: (value) => {
        activeImageLinkBlockId = value;
      },
    },
    activeImageCropBlockId: {
      get: () => activeImageCropBlockId,
      set: (value) => {
        activeImageCropBlockId = value;
      },
    },
    imageCropSession: {
      get: () => imageCropSession,
      set: (value) => {
        imageCropSession = value;
      },
    },
    activePageLinkBlockId: {
      get: () => activePageLinkBlockId,
      set: (value) => {
        activePageLinkBlockId = value;
      },
    },
    pageLinkPickerIndex: {
      get: () => pageLinkPickerIndex,
      set: (value) => {
        pageLinkPickerIndex = value;
      },
    },
    hoveredLinkAnchor: {
      get: () => hoveredLinkAnchor,
      set: (value) => {
        hoveredLinkAnchor = value;
      },
    },
    linkHoverHideTimer: {
      get: () => linkHoverHideTimer,
      set: (value) => {
        linkHoverHideTimer = value;
      },
    },
    standaloneLinkEditorOpen: {
      get: () => standaloneLinkEditorOpen,
      set: (value) => {
        standaloneLinkEditorOpen = value;
      },
    },
    pageOperationEpoch: {
      get: () => pageOperationEpoch,
      set: (value) => {
        pageOperationEpoch = value;
      },
    },
    multiBlockSelection: {
      get: () => multiBlockSelection,
      set: (value) => {
        multiBlockSelection = value;
      },
    },
    selectedTableBlockId: {
      get: () => selectedTableBlockId,
      set: (value) => {
        selectedTableBlockId = value;
      },
    },
    tableCellSelection: {
      get: () => tableCellSelection,
      set: (value) => {
        tableCellSelection = value;
      },
    },
    inlineSelectionState: {
      get: () => inlineSelectionState,
      set: (value) => {
        inlineSelectionState = value;
      },
    },
    inlineSelectionUpdateTimer: {
      get: () => inlineSelectionUpdateTimer,
      set: (value) => {
        inlineSelectionUpdateTimer = value;
      },
    },
    inlinePointerSelectionActive: {
      get: () => inlinePointerSelectionActive,
      set: (value) => {
        inlinePointerSelectionActive = value;
      },
    },
    inlineKeyboardSelectionActive: {
      get: () => inlineKeyboardSelectionActive,
      set: (value) => {
        inlineKeyboardSelectionActive = value;
      },
    },
    saveTimer: {
      get: () => saveTimer,
      set: (value) => {
        saveTimer = value;
      },
    },
    deferredInstallPrompt: {
      get: () => deferredInstallPrompt,
      set: (value) => {
        deferredInstallPrompt = value;
      },
    },
    historyTimer: {
      get: () => historyTimer,
      set: (value) => {
        historyTimer = value;
      },
    },
    historySuspended: {
      get: () => historySuspended,
      set: (value) => {
        historySuspended = value;
      },
    },
    HISTORY_LIMIT: { get: () => HISTORY_LIMIT },
    HISTORY_MERGE_DELAY: { get: () => HISTORY_MERGE_DELAY },
    historyByVault: { get: () => historyByVault },
    NAVIGATION_HISTORY_LIMIT: { get: () => NAVIGATION_HISTORY_LIMIT },
    navigationHistoryByVault: { get: () => navigationHistoryByVault },
    $: { get: () => $ },
    els: { get: () => els },
    baseEditorElements: { get: () => baseEditorElements },
    vaultDialogMode: {
      get: () => vaultDialogMode,
      set: (value) => {
        vaultDialogMode = value;
      },
    },
    newFolderDialogParentPath: {
      get: () => newFolderDialogParentPath,
      set: (value) => {
        newFolderDialogParentPath = value;
      },
    },
    newFolderDialogSubmitting: {
      get: () => newFolderDialogSubmitting,
      set: (value) => {
        newFolderDialogSubmitting = value;
      },
    },
    INLINE_FORMAT_TYPES: { get: () => INLINE_FORMAT_TYPES },
    INLINE_COLOR_NAMES: { get: () => INLINE_COLOR_NAMES },
    simpleTableHandleHover: {
      get: () => simpleTableHandleHover,
      set: (value) => {
        simpleTableHandleHover = value;
      },
    },
    mermaidPreviewTimers: { get: () => mermaidPreviewTimers },
    mermaidRenderTokens: { get: () => mermaidRenderTokens },
    mermaidRenderSequence: {
      get: () => mermaidRenderSequence,
      set: (value) => {
        mermaidRenderSequence = value;
      },
    },
    STORAGE_CONFIG: { get: () => STORAGE_CONFIG },
    hydrateStaticIcons: { get: () => hydrateStaticIcons },
    iconMarkup: { get: () => iconMarkup },
    createStorageGateway: { get: () => createStorageGateway },
    hasForbiddenFilesystemNameCharacters: { get: () => hasForbiddenFilesystemNameCharacters },
    validateFilesystemName: { get: () => validateFilesystemName },
  });
  registerSettings(runtime);
  registerWorkspace(runtime);
  registerHistory(runtime);
  registerNavigation(runtime);
  registerNotes(runtime);
  registerAttachments(runtime);
  registerGraph(runtime);
  registerDashboard(runtime);
  registerEditor(runtime);
  registerTables(runtime);
  registerCode(runtime);
  registerInteractions(runtime);
  registerMarkdown(runtime);
  registerCommands(runtime);

  const localStorageGateway = runtime.createStorageGateway(runtime.STORAGE_CONFIG);
  let storageGateway = runtime.localStorageGateway;
  const uid = (prefix = 'id') =>
    `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
  const clone = (obj) => JSON.parse(JSON.stringify(obj));
  const DEFAULT_PAGE_ICON = 'lucide:file-text';
  const DEFAULT_FOLDER_ICON = 'lucide:folder';
  const MAIN_EDITOR_GROUP = 'editor_main';
  const DEFAULT_SHORTCUTS = Object.freeze({
    undo: 'Mod+Z',
    redo: 'Mod+Shift+Z',
    search: 'Mod+K',
    favorite: 'Mod+Shift+F',
    comments: 'Mod+Alt+M',
    share: 'Mod+Alt+S',
    toggleLeftSidebar: 'Mod+Alt+L',
    toggleRightSidebar: 'Mod+Alt+R',
    toggleTheme: 'Mod+Shift+L',
    settings: 'Mod+Alt+,',
    newPage: 'Mod+Alt+N',
    graph: 'Mod+Alt+G',
    navigateBack: 'Mod+Alt+PageUp',
    navigateForward: 'Mod+Alt+PageDown',
    reopenClosedTab: 'Mod+Alt+T',
    splitRight: 'Mod+Alt+ArrowRight',
    splitDown: 'Mod+Alt+ArrowDown',
    mergePanes: 'Mod+Alt+Backspace',
  });
  const SHORTCUT_ACTIONS = [
    { id: 'undo', label: 'Undo' },
    { id: 'redo', label: 'Redo' },
    { id: 'search', label: 'Open search' },
    { id: 'favorite', label: 'Toggle page favorite' },
    { id: 'comments', label: 'Open page comments' },
    { id: 'share', label: 'Share current page' },
    { id: 'navigateBack', label: 'Navigate back' },
    { id: 'navigateForward', label: 'Navigate forward' },
    { id: 'reopenClosedTab', label: 'Reopen closed tab' },
    { id: 'toggleLeftSidebar', label: 'Toggle left sidebar' },
    { id: 'toggleRightSidebar', label: 'Toggle right sidebar' },
    { id: 'toggleTheme', label: 'Cycle theme' },
    { id: 'settings', label: 'Open settings' },
    { id: 'newPage', label: 'Create a new page' },
    { id: 'graph', label: 'Open graph view' },
    { id: 'splitRight', label: 'Split editor right' },
    { id: 'splitDown', label: 'Split editor down' },
    { id: 'mergePanes', label: 'Merge editor panes' },
  ];
  const RESERVED_SHORTCUTS = new Set([
    'Mod+B',
    'Mod+I',
    'Mod+U',
    'Mod+E',
    'Mod+F',
    'Mod+H',
    'Mod+J',
    'Mod+L',
    'Mod+N',
    'Mod+O',
    'Mod+P',
    'Mod+R',
    'Mod+S',
    'Mod+T',
    'Mod+Shift+S',
    'Mod+Shift+G',
    'Mod+Shift+O',
    'Mod+Shift+T',
    'Mod+Shift+W',
    'Mod+ENTER',
    'Mod+TAB',
    'Mod+W',
  ]);
  const DEFAULT_WORKSPACE = {
    name: 'Default Space',
    theme: 'system',
    pageFont: 'system',
    treeIconSize: 14,
    spellcheckEnabled: false,
    showCustomPageIcons: false,
    showFilesAndTabIcons: true,
    showBreadcrumbIcons: false,
    folderNotesEnabled: true,
    shortcuts: { ...runtime.DEFAULT_SHORTCUTS },
    currentPageId: '__home__',
    activeTabId: null,
    activeEditorGroupId: runtime.MAIN_EDITOR_GROUP,
    editorLayout: { type: 'group', id: runtime.MAIN_EDITOR_GROUP, activeTabId: null },
    openTabs: [],
    sidebarOpen: true,
    leftPanelMode: 'files',
    pages: [],
    folders: [],
    activeFolderPath: '',
    editorScrollPositions: {},
  };
  const DEFAULT_BROWSER_WORKSPACE = {
    ...runtime.DEFAULT_WORKSPACE,
    gettingStartedInitialized: true,
    currentPageId: 'page_getting_started',
    activeTabId: 'tab_getting_started',
    editorLayout: {
      type: 'group',
      id: runtime.MAIN_EDITOR_GROUP,
      activeTabId: 'tab_getting_started',
    },
    openTabs: [
      {
        id: 'tab_getting_started',
        kind: 'page',
        pageId: 'page_getting_started',
        groupId: runtime.MAIN_EDITOR_GROUP,
      },
    ],
    pages: [
      {
        id: 'page_getting_started',
        parentId: null,
        folderId: null,
        title: 'Getting Started',
        favorite: false,
        expanded: true,
        folderNote: false,
        blocks: [
          {
            id: 'getting_started_text',
            type: 'text',
            text: 'Laplace is a local-first Markdown workspace for writing and organizing your notes. Install it as a Progressive Web App (PWA) to work offline once the app has loaded.',
          },
          {
            id: 'getting_started_heading_1',
            type: 'h1',
            text: 'Heading 1',
          },
          {
            id: 'getting_started_heading_2',
            type: 'h2',
            text: 'Heading 2',
          },
          {
            id: 'getting_started_heading_3',
            type: 'h3',
            text: 'Heading 3',
          },
          {
            id: 'getting_started_heading_4',
            type: 'h4',
            text: 'Heading 4',
          },
          {
            id: 'getting_started_heading_5',
            type: 'h5',
            text: 'Heading 5',
          },
          {
            id: 'getting_started_heading_6',
            type: 'h6',
            text: 'Heading 6',
          },
          {
            id: 'getting_started_bullet_first',
            type: 'bullet',
            text: 'First bulleted item',
          },
          {
            id: 'getting_started_bullet_nested',
            type: 'bullet',
            text: 'Nested bulleted item',
            indent: 1,
          },
          {
            id: 'getting_started_bullet_second',
            type: 'bullet',
            text: 'Second bulleted item',
          },
          {
            id: 'getting_started_number_first',
            type: 'number',
            text: 'First numbered item',
          },
          {
            id: 'getting_started_number_second',
            type: 'number',
            text: 'Second numbered item',
          },
          {
            id: 'getting_started_todo_pending',
            type: 'todo',
            text: 'An unfinished task',
            checked: false,
          },
          {
            id: 'getting_started_todo_done',
            type: 'todo',
            text: 'A completed task',
            checked: true,
          },
          {
            id: 'getting_started_quote',
            type: 'quote',
            text: 'A quote can stand on its own.',
            quoteDepth: 1,
          },
          {
            id: 'getting_started_quote_nested',
            type: 'quote',
            text: 'A nested quote adds another level.',
            quoteDepth: 2,
          },
          {
            id: 'getting_started_callout',
            type: 'callout',
            text: 'A callout highlights a useful idea.',
          },
          {
            id: 'getting_started_inline_equation',
            type: 'text',
            text: 'A paragraph with an inline equation: $E = mc^2$.',
          },
          {
            id: 'getting_started_divider',
            type: 'divider',
          },
          {
            id: 'getting_started_code',
            type: 'code',
            language: 'javascript',
            text: 'function square(x) {\n  return x * x;\n}\n\nconsole.log(square(5));',
            codeWrap: false,
            codeLineNumbers: true,
          },
          {
            id: 'getting_started_mermaid',
            type: 'code',
            language: 'mermaid',
            text: 'flowchart LR\n  A[Idea] --> B[Draft]\n  B --> C[Review]\n  C --> D[Publish]',
            mermaidPreview: true,
            mermaidViewMode: 'preview',
          },
          {
            id: 'getting_started_latex',
            type: 'code',
            language: 'latex',
            text: '\\begin{aligned}\n(x + y)^2 &= (x + y)(x + y) \\\\\n          &= x^2 + xy + yx + y^2 \\\\\n          &= x^2 + 2xy + y^2\n\\end{aligned}',
            mathViewMode: 'preview',
          },
          {
            id: 'getting_started_table',
            type: 'table',
            tableRows: [
              ['Item', 'Quantity', 'Status'],
              ['Notebook', '2', 'Ready'],
              ['Pencil', '4', 'Pending'],
            ],
            tableColumnAlignments: ['left', 'center', 'left'],
            tableHeaderRow: true,
            tableHeaderColumn: false,
          },
          {
            id: 'getting_started_image',
            type: 'image',
            src: 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22640%22%20height%3D%22240%22%20viewBox%3D%220%200%20640%20240%22%3E%3Crect%20width%3D%22640%22%20height%3D%22240%22%20rx%3D%2216%22%20fill%3D%22%23eef2ff%22%2F%3E%3Ccircle%20cx%3D%22160%22%20cy%3D%22120%22%20r%3D%2264%22%20fill%3D%22%23818cf8%22%2F%3E%3Crect%20x%3D%22280%22%20y%3D%2256%22%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2216%22%20fill%3D%22%2338bdf8%22%2F%3E%3Cpath%20d%3D%22M448%20184%20512%2056%20576%20184Z%22%20fill%3D%22%2334d399%22%2F%3E%3C%2Fsvg%3E',
            alt: 'Circle, square and triangle',
            caption: 'Image example',
            imageWidth: 480,
            imageAlign: 'center',
          },
          {
            id: 'getting_started_page',
            type: 'page',
            pageId: 'page_getting_started_example',
          },
          {
            id: 'getting_started_page_link',
            type: 'page-link',
            pageId: 'page_getting_started_example',
          },
        ],
      },
      {
        id: 'page_getting_started_example',
        parentId: 'page_getting_started',
        folderId: null,
        title: 'Example page',
        favorite: false,
        expanded: true,
        folderNote: false,
        blocks: [
          {
            id: 'getting_started_child_text',
            type: 'text',
            text: 'A paragraph inside a child page.',
          },
        ],
      },
    ],
  };
  const BLOCK_TYPES = [
    { type: 'text', icon: 'text', name: 'Text', desc: 'Plain text block', group: 'Basic' },
    {
      type: 'page',
      icon: 'file-plus',
      name: 'Page',
      desc: 'Create a subpage inside this note',
      group: 'Basic',
    },
    {
      type: 'page-link',
      icon: 'link-2',
      name: 'Link to page',
      desc: 'Link to an existing page without nesting it',
      group: 'Basic',
    },
    {
      type: 'h1',
      icon: 'heading-1',
      name: 'Heading 1',
      desc: 'Large section heading',
      group: 'Basic',
    },
    {
      type: 'h2',
      icon: 'heading-2',
      name: 'Heading 2',
      desc: 'Medium section heading',
      group: 'Basic',
    },
    {
      type: 'h3',
      icon: 'heading-3',
      name: 'Heading 3',
      desc: 'Small section heading',
      group: 'Basic',
    },
    {
      type: 'h4',
      icon: 'heading-4',
      name: 'Heading 4',
      desc: 'Compact section heading',
      group: 'Basic',
    },
    {
      type: 'h5',
      icon: 'heading-5',
      name: 'Heading 5',
      desc: 'Small section heading',
      group: 'Basic',
    },
    {
      type: 'h6',
      icon: 'heading-6',
      name: 'Heading 6',
      desc: 'Small section heading',
      group: 'Basic',
    },
    {
      type: 'bullet',
      icon: 'list',
      name: 'Bulleted list',
      desc: 'Create a simple bulleted list',
      group: 'Basic',
    },
    {
      type: 'number',
      icon: 'list-ordered',
      name: 'Numbered list',
      desc: 'Create a numbered list',
      group: 'Basic',
    },
    {
      type: 'todo',
      icon: 'list-checks',
      name: 'To-do list',
      desc: 'Track tasks with a checkbox',
      group: 'Basic',
    },
    { type: 'quote', icon: 'quote', name: 'Quote', desc: 'Capture a quote', group: 'Advanced' },
    {
      type: 'callout',
      icon: 'lightbulb',
      name: 'Callout',
      desc: 'Highlight useful information',
      group: 'Advanced',
    },
    { type: 'code', icon: 'code', name: 'Code', desc: 'Code snippet', group: 'Advanced' },
    {
      type: 'inline-equation',
      icon: 'radical',
      name: 'Inline equation',
      desc: 'Insert and edit a LaTeX equation',
      group: 'Advanced',
    },
    {
      type: 'divider',
      icon: 'minus',
      name: 'Divider',
      desc: 'Horizontal separator',
      group: 'Advanced',
    },
    {
      type: 'image',
      icon: 'image',
      name: 'Image',
      desc: 'Upload or embed an image',
      group: 'Media',
    },
    {
      type: 'table',
      icon: 'table-2',
      name: 'Table',
      desc: 'Simple editable table',
      group: 'Layout',
    },
  ];
  const CODE_LANGUAGES = [
    ['plain', 'Plain text'],
    ['bash', 'Bash'],
    ['javascript', 'JavaScript'],
    ['typescript', 'TypeScript'],
    ['html', 'HTML'],
    ['css', 'CSS'],
    ['json', 'JSON'],
    ['csharp', 'C#'],
    ['cpp', 'C / C++'],
    ['python', 'Python'],
    ['sql', 'SQL'],
    ['java', 'Java'],
    ['rust', 'Rust'],
    ['go', 'Go'],
    ['xml', 'XML'],
    ['yaml', 'YAML'],
    ['markdown', 'Markdown'],
    ['mermaid', 'Mermaid'],
    ['latex', 'LaTeX / Math'],
  ];
  const CODE_KEYWORDS = {
    javascript:
      'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return static super switch this throw try typeof var void while with yield async await of true false null undefined',
    typescript:
      'abstract any as asserts bigint boolean break case catch class const constructor continue declare default delete do else enum export extends false finally for from function get if implements import in infer instanceof interface is keyof let module namespace never new null number object of private protected public readonly require return set static string super switch symbol this throw true try type typeof undefined unique unknown var void while with yield async await',
    csharp:
      'abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while async await record var',
    cpp: 'alignas alignof and asm auto bitand bitor bool break case catch char class compl concept const consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept not nullptr operator or private protected public register reinterpret_cast requires return short signed sizeof static static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename union unsigned using virtual void volatile wchar_t while xor',
    python:
      'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield',
    bash: 'if then else elif fi case esac for select while until do done in function time coproc true false',
    sql: 'select from where join inner left right full outer on as insert into values update set delete create alter drop table view index primary key foreign references null not and or group by order having limit offset distinct union all case when then else end asc desc with',
    java: 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null',
    rust: 'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while',
    go: 'break default func interface select case defer go map struct chan else goto package switch const fallthrough if range type continue for import return var true false nil',
    css: 'important inherit initial unset revert auto none block inline flex grid absolute relative fixed sticky',
    yaml: 'true false null yes no on off',
    markdown: 'true false null',
    mermaid:
      'flowchart graph sequenceDiagram classDiagram stateDiagram-v2 erDiagram journey gantt pie quadrantChart requirementDiagram gitGraph mindmap timeline sankey-beta xychart-beta block-beta packet-beta architecture-beta C4Context C4Container C4Component C4Dynamic subgraph end participant actor loop alt else opt par rect critical break note autonumber title section direction TB TD BT RL LR class classDef state click style linkStyle %% init true false',
  };
  const EMOJI_CATALOG = [
    { emoji: '😀', name: 'grinning face smile happy' },
    { emoji: '😃', name: 'smiley happy joy' },
    { emoji: '😄', name: 'smile happy laugh' },
    { emoji: '😁', name: 'grin happy' },
    { emoji: '😆', name: 'laugh satisfied' },
    { emoji: '😅', name: 'sweat smile' },
    { emoji: '😂', name: 'joy tears laugh' },
    { emoji: '🤣', name: 'rofl rolling laugh' },
    { emoji: '😊', name: 'blush smile' },
    { emoji: '🙂', name: 'slightly smiling' },
    { emoji: '🙃', name: 'upside down' },
    { emoji: '😉', name: 'wink' },
    { emoji: '😍', name: 'heart eyes love' },
    { emoji: '🥰', name: 'love hearts' },
    { emoji: '😘', name: 'kiss' },
    { emoji: '😎', name: 'cool sunglasses' },
    { emoji: '🤓', name: 'nerd glasses' },
    { emoji: '🧐', name: 'monocle thinking' },
    { emoji: '🤔', name: 'thinking' },
    { emoji: '🤨', name: 'raised eyebrow' },
    { emoji: '😐', name: 'neutral' },
    { emoji: '😑', name: 'expressionless' },
    { emoji: '😶', name: 'silent' },
    { emoji: '🙄', name: 'eye roll' },
    { emoji: '😴', name: 'sleep sleeping' },
    { emoji: '🤯', name: 'mind blown explode' },
    { emoji: '🥳', name: 'party celebrate' },
    { emoji: '🤩', name: 'star struck' },
    { emoji: '😢', name: 'cry sad' },
    { emoji: '😭', name: 'sob crying' },
    { emoji: '😡', name: 'angry mad' },
    { emoji: '🤬', name: 'swearing angry' },
    { emoji: '😱', name: 'scream shocked' },
    { emoji: '😬', name: 'grimace' },
    { emoji: '🫠', name: 'melting face' },
    { emoji: '🫡', name: 'salute' },
    { emoji: '👍', name: 'thumbs up like yes' },
    { emoji: '👎', name: 'thumbs down dislike no' },
    { emoji: '👏', name: 'clap applause' },
    { emoji: '🙌', name: 'raised hands celebrate' },
    { emoji: '👋', name: 'wave hello' },
    { emoji: '🤝', name: 'handshake deal' },
    { emoji: '🙏', name: 'pray thanks please' },
    { emoji: '💪', name: 'muscle strong' },
    { emoji: '👌', name: 'ok hand' },
    { emoji: '✌️', name: 'victory peace' },
    { emoji: '🤞', name: 'fingers crossed luck' },
    { emoji: '👉', name: 'point right' },
    { emoji: '👈', name: 'point left' },
    { emoji: '☝️', name: 'point up' },
    { emoji: '👇', name: 'point down' },
    { emoji: '🫶', name: 'heart hands love' },
    { emoji: '❤️', name: 'red heart love' },
    { emoji: '🧡', name: 'orange heart' },
    { emoji: '💛', name: 'yellow heart' },
    { emoji: '💚', name: 'green heart' },
    { emoji: '💙', name: 'blue heart' },
    { emoji: '💜', name: 'purple heart' },
    { emoji: '🖤', name: 'black heart' },
    { emoji: '🤍', name: 'white heart' },
    { emoji: '💔', name: 'broken heart' },
    { emoji: '💯', name: 'hundred perfect' },
    { emoji: '💥', name: 'boom collision' },
    { emoji: '✨', name: 'sparkles shine' },
    { emoji: '⭐', name: 'star favorite' },
    { emoji: '🌟', name: 'glowing star' },
    { emoji: '🔥', name: 'fire hot' },
    { emoji: '⚡', name: 'lightning bolt fast' },
    { emoji: '☀️', name: 'sun sunny' },
    { emoji: '🌤️', name: 'sun cloud weather' },
    { emoji: '☁️', name: 'cloud' },
    { emoji: '🌧️', name: 'rain weather' },
    { emoji: '❄️', name: 'snow cold' },
    { emoji: '🌈', name: 'rainbow' },
    { emoji: '🌙', name: 'moon night' },
    { emoji: '🌍', name: 'earth world globe' },
    { emoji: '🌱', name: 'seedling grow' },
    { emoji: '🌿', name: 'herb leaf' },
    { emoji: '🌳', name: 'tree nature' },
    { emoji: '🌸', name: 'flower blossom' },
    { emoji: '🍀', name: 'clover luck' },
    { emoji: '🐱', name: 'cat' },
    { emoji: '🐶', name: 'dog' },
    { emoji: '🦊', name: 'fox' },
    { emoji: '🐼', name: 'panda' },
    { emoji: '🐸', name: 'frog' },
    { emoji: '🦄', name: 'unicorn' },
    { emoji: '🐉', name: 'dragon' },
    { emoji: '☕', name: 'coffee drink' },
    { emoji: '🍵', name: 'tea drink' },
    { emoji: '🍕', name: 'pizza food' },
    { emoji: '🍔', name: 'burger food' },
    { emoji: '🍎', name: 'apple food' },
    { emoji: '🍓', name: 'strawberry fruit' },
    { emoji: '🍰', name: 'cake dessert' },
    { emoji: '🎂', name: 'birthday cake' },
    { emoji: '🚀', name: 'rocket launch' },
    { emoji: '✈️', name: 'airplane travel' },
    { emoji: '🚗', name: 'car vehicle' },
    { emoji: '🚲', name: 'bike bicycle' },
    { emoji: '🏠', name: 'house home' },
    { emoji: '🏢', name: 'office building' },
    { emoji: '🏆', name: 'trophy winner' },
    { emoji: '🥇', name: 'gold medal winner' },
    { emoji: '🎯', name: 'target goal' },
    { emoji: '🎮', name: 'game controller gaming' },
    { emoji: '🎲', name: 'dice game' },
    { emoji: '🎵', name: 'music note' },
    { emoji: '🎧', name: 'headphones audio' },
    { emoji: '🎬', name: 'movie cinema' },
    { emoji: '📷', name: 'camera photo' },
    { emoji: '🎨', name: 'art palette design' },
    { emoji: '💡', name: 'idea light bulb' },
    { emoji: '🧠', name: 'brain think' },
    { emoji: '👀', name: 'eyes look watch' },
    { emoji: '🔍', name: 'search magnify' },
    { emoji: '🔎', name: 'search right magnify' },
    { emoji: '🔔', name: 'bell notification' },
    { emoji: '📌', name: 'pin pinned' },
    { emoji: '📍', name: 'location pin' },
    { emoji: '📄', name: 'page document file' },
    { emoji: '📝', name: 'memo note write' },
    { emoji: '📚', name: 'books library' },
    { emoji: '📖', name: 'book read' },
    { emoji: '📁', name: 'folder files' },
    { emoji: '🗂️', name: 'card index folders' },
    { emoji: '📊', name: 'chart analytics' },
    { emoji: '📈', name: 'chart up growth' },
    { emoji: '📉', name: 'chart down' },
    { emoji: '📅', name: 'calendar date' },
    { emoji: '🗓️', name: 'calendar schedule' },
    { emoji: '⏰', name: 'alarm clock time' },
    { emoji: '⌛', name: 'hourglass time' },
    { emoji: '✅', name: 'check done complete' },
    { emoji: '☑️', name: 'checkbox done' },
    { emoji: '❌', name: 'cross x no' },
    { emoji: '⚠️', name: 'warning alert' },
    { emoji: '🚨', name: 'siren alert' },
    { emoji: '❓', name: 'question help' },
    { emoji: '❗', name: 'exclamation important' },
    { emoji: '➕', name: 'plus add' },
    { emoji: '➖', name: 'minus remove' },
    { emoji: '➡️', name: 'arrow right' },
    { emoji: '⬅️', name: 'arrow left' },
    { emoji: '⬆️', name: 'arrow up' },
    { emoji: '⬇️', name: 'arrow down' },
    { emoji: '🔗', name: 'link chain' },
    { emoji: '🔒', name: 'lock private secure' },
    { emoji: '🔓', name: 'unlock open' },
    { emoji: '🔑', name: 'key access' },
    { emoji: '🛠️', name: 'tools build' },
    { emoji: '🔧', name: 'wrench tool' },
    { emoji: '⚙️', name: 'gear settings' },
    { emoji: '🧰', name: 'toolbox' },
    { emoji: '💻', name: 'laptop computer code' },
    { emoji: '🖥️', name: 'desktop computer' },
    { emoji: '⌨️', name: 'keyboard' },
    { emoji: '🖱️', name: 'mouse computer' },
    { emoji: '📱', name: 'phone mobile' },
    { emoji: '🔋', name: 'battery power' },
    { emoji: '🧩', name: 'puzzle component' },
    { emoji: '🧪', name: 'test tube experiment' },
    { emoji: '🔬', name: 'microscope science' },
    { emoji: '🧬', name: 'dna science' },
    { emoji: '🤖', name: 'robot bot ai' },
    { emoji: '👾', name: 'alien monster game' },
    { emoji: '💾', name: 'disk save' },
    { emoji: '🗄️', name: 'database cabinet' },
    { emoji: '🗺️', name: 'map roadmap' },
    { emoji: '🧭', name: 'compass direction' },
    { emoji: '💬', name: 'comment chat' },
    { emoji: '🗨️', name: 'speech chat' },
    { emoji: '📣', name: 'megaphone announce' },
    { emoji: '✉️', name: 'mail email' },
    { emoji: '📦', name: 'package box' },
    { emoji: '🎁', name: 'gift present' },
    { emoji: '🔖', name: 'bookmark' },
    { emoji: '🏷️', name: 'tag label' },
    { emoji: '💰', name: 'money bag' },
    { emoji: '💳', name: 'credit card' },
    { emoji: '🪙', name: 'coin money' },
    { emoji: '📎', name: 'paperclip attachment' },
    { emoji: '✏️', name: 'pencil edit' },
    { emoji: '✍️', name: 'writing hand' },
    { emoji: '🧹', name: 'broom clean' },
    { emoji: '🗑️', name: 'trash delete' },
    { emoji: '🕹️', name: 'joystick game' },
    { emoji: '🎙️', name: 'microphone audio' },
  ];
  const ICON_OPTIONS = runtime.EMOJI_CATALOG.map((item) => item.emoji);
  let vaultRegistry = { activeVaultId: null, vaults: [] };
  let activeVaultId = null;
  let workspaceLocations = [
    { id: 'browser', name: 'Browser storage', kind: 'browser', active: true },
  ];
  let workspaceLocationSwitching = false;
  let workspaceLocationClosing = false;
  let browserWorkspaceCopying = false;
  let pendingWorkspaceCloseId = null;
  let deleteConfirmResolver = null;
  let state = runtime.normalizeWorkspace(runtime.clone(runtime.DEFAULT_WORKSPACE));
  let workspaceAccess = 'checking';
  let lastSyncedWorkspace = null;
  let workspacePermissionCheck = null;
  let lastReadOnlyNoticeAt = 0;
  let storageDbPromise = null;
  let storageWriteChain = Promise.resolve();
  const attachmentObjectUrls = new Map();
  const pendingAttachmentLoads = new Map();
  let attachmentCacheGeneration = 0;
  let attachmentListItems = [];
  let attachmentListLoaded = false;
  let attachmentListLoading = false;
  let attachmentListError = '';
  let attachmentListRequest = 0;
  let attachmentGalleryPage = 0;
  let selectedAttachmentPath = null;
  const ATTACHMENT_GALLERY_PAGE_SIZE = 24;
  let eventsBound = false;
  let activeSlashBlockId = null;
  let slashIndex = 0;
  let activeEmojiBlockId = null;
  let emojiIndex = 0;
  let emojiTokenStart = -1;
  let emojiTokenEnd = -1;
  let emojiMatches = [];
  let commandIndex = 0;
  let shortcutCaptureAction = null;
  let dragBlockId = null;
  let dragTabId = null;
  let dragPageId = null;
  let dragPageIds = null;
  let dragFolderPath = null;
  let pageDrop = null;
  let folderDrop = null;
  let filesTreeSelectionCleared = false;
  let filesTreeSelection = new Set();
  let filesTreeSelectionAnchor = null;
  let filesTreeSelectionScope = null;
  let treeContextSelection = null;
  let dockDrop = null;
  let tableAxisDrag = null;
  let activeImageBlockId = null;
  let activeImageLinkBlockId = null;
  let activeImageCropBlockId = null;
  let imageCropSession = null;
  let activePageLinkBlockId = null;
  let pageLinkPickerIndex = 0;
  let hoveredLinkAnchor = null;
  let linkHoverHideTimer = null;
  let standaloneLinkEditorOpen = false;
  let pageOperationEpoch = 0;
  let multiBlockSelection = null;
  let selectedTableBlockId = null;
  let tableCellSelection = null;
  let inlineSelectionState = null;
  let inlineSelectionUpdateTimer = null;
  let inlinePointerSelectionActive = false;
  let inlineKeyboardSelectionActive = false;
  let saveTimer = null;
  let deferredInstallPrompt = null;
  let historyTimer = null;
  let historySuspended = false;
  const HISTORY_LIMIT = 100;
  const HISTORY_MERGE_DELAY = 650;
  const historyByVault = new Map();
  const NAVIGATION_HISTORY_LIMIT = 100;
  const navigationHistoryByVault = new Map();
  const $ = (id) => document.getElementById(id);
  const els = {
    sidebar: runtime.$('sidebar'),
    sidebarToggle: runtime.$('sidebarToggle'),
    sidebarOpen: runtime.$('sidebarOpen'),
    rightSidebar: runtime.$('rightSidebar'),
    rightSidebarContent: runtime.$('rightSidebarContent'),
    rightSidebarToggle: runtime.$('rightSidebarToggle'),
    favoritesList: runtime.$('favoritesList'),
    pageTree: runtime.$('pageTree'),
    breadcrumbs: runtime.$('breadcrumbs'),
    editorTabs: runtime.$('editorTabs'),
    tabsScroll: runtime.$('tabsScroll'),
    editorView: runtime.$('editorView'),
    pageEditor: runtime.$('pageEditor'),
    attachmentsView: runtime.$('attachmentsView'),
    attachmentPreview: runtime.$('attachmentPreview'),
    attachmentPreviewImage: runtime.$('attachmentPreviewImage'),
    attachmentPreviewTitle: runtime.$('attachmentPreviewTitle'),
    attachmentPreviewPath: runtime.$('attachmentPreviewPath'),
    editorDock: runtime.$('editorDock'),
    homeView: runtime.$('homeView'),
    graphView: runtime.$('graphView'),
    pageTitle: runtime.$('pageTitle'),
    pageIcon: runtime.$('pageIcon'),
    blockEditor: runtime.$('blockEditor'),
    emptyHint: runtime.$('emptyHint'),
    pageComments: runtime.$('pageComments'),
    pageMetaMenu: runtime.$('pageMetaMenu'),
    commandPalette: runtime.$('commandPalette'),
    commandSearch: runtime.$('commandSearch'),
    commandResults: runtime.$('commandResults'),
    slashMenu: runtime.$('slashMenu'),
    slashSearch: runtime.$('slashSearch'),
    slashResults: runtime.$('slashResults'),
    emojiMenu: runtime.$('emojiMenu'),
    emojiResults: runtime.$('emojiResults'),
    blockMenu: runtime.$('blockMenu'),
    textFormatToolbar: runtime.$('textFormatToolbar'),
    inlineEquationPanel: runtime.$('inlineEquationPanel'),
    linkEditPanel: runtime.$('linkEditPanel'),
    shareModal: runtime.$('shareModal'),
    settingsModal: runtime.$('settingsModal'),
    themeToggle: runtime.$('themeToggle'),
    pageFont: runtime.$('pageFont'),
    treeIconSize: runtime.$('treeIconSize'),
    spellcheckEnabled: runtime.$('spellcheckEnabled'),
    showCustomPageIcons: runtime.$('showCustomPageIcons'),
    showFilesAndTabIcons: runtime.$('showFilesAndTabIcons'),
    showBreadcrumbIcons: runtime.$('showBreadcrumbIcons'),
    folderNotesEnabled: runtime.$('folderNotesEnabled'),
    shortcutList: runtime.$('shortcutList'),
    imageFileInput: runtime.$('imageFileInput'),
    pageIconFileInput: runtime.$('pageIconFileInput'),
    vaultSelect: runtime.$('vaultSelect'),
    createVaultBtn: runtime.$('createVaultBtn'),
    renameVaultBtn: runtime.$('renameVaultBtn'),
    deleteVaultBtn: runtime.$('deleteVaultBtn'),
    newFolderBtn: runtime.$('newFolderBtn'),
    refreshNotesBtn: runtime.$('refreshNotesBtn'),
    revealCurrentFileBtn: runtime.$('revealCurrentFileBtn'),
    chooseDirectoryBtn: runtime.$('chooseDirectoryBtn'),
    closeWorkspaceBtn: runtime.$('closeWorkspaceBtn'),
    saveBrowserWorkspaceBtn: runtime.$('saveBrowserWorkspaceBtn'),
    workspaceSelect: runtime.$('workspaceSelect'),
    workspaceWritePermissionBtn: runtime.$('workspaceWritePermissionBtn'),
    installAppRow: runtime.$('installAppRow'),
    installAppBtn: runtime.$('installAppBtn'),
    workspaceCloseDialog: runtime.$('workspaceCloseDialog'),
    workspaceCloseTitle: runtime.$('workspaceCloseTitle'),
    workspaceCloseMessage: runtime.$('workspaceCloseMessage'),
    workspaceCloseConfirm: runtime.$('workspaceCloseConfirm'),
    workspaceCloseCancel: runtime.$('workspaceCloseCancel'),
    deleteConfirmDialog: runtime.$('deleteConfirmDialog'),
    deleteConfirmTitle: runtime.$('deleteConfirmTitle'),
    deleteConfirmMessage: runtime.$('deleteConfirmMessage'),
    deleteConfirmAccept: runtime.$('deleteConfirmAccept'),
    deleteConfirmCancel: runtime.$('deleteConfirmCancel'),
    vaultDialog: runtime.$('vaultDialog'),
    vaultDialogTitle: runtime.$('vaultDialogTitle'),
    vaultDialogInput: runtime.$('vaultDialogInput'),
    vaultDialogError: runtime.$('vaultDialogError'),
    vaultDialogConfirm: runtime.$('vaultDialogConfirm'),
    newFolderDialog: runtime.$('newFolderDialog'),
    newFolderNameInput: runtime.$('newFolderNameInput'),
    newFolderNameError: runtime.$('newFolderNameError'),
    newFolderConfirm: runtime.$('newFolderConfirm'),
    newFolderCancel: runtime.$('newFolderCancel'),
    toast: runtime.$('toast'),
    workspaceAccessNotice: runtime.$('workspaceAccessNotice'),
    workspaceAccessMessage: runtime.$('workspaceAccessMessage'),
    workspaceReconnectBtn: runtime.$('workspaceReconnectBtn'),
  };
  const baseEditorElements = {
    pageTitle: runtime.els.pageTitle,
    pageIcon: runtime.els.pageIcon,
    pageComments: runtime.els.pageComments,
    blockEditor: runtime.els.blockEditor,
    emptyHint: runtime.els.emptyHint,
  };
  let vaultDialogMode = null;
  let newFolderDialogParentPath = '';
  let newFolderDialogSubmitting = false;
  const INLINE_FORMAT_TYPES = new Set([
    'bold',
    'italic',
    'underline',
    'strike',
    'code',
    'color',
    'background',
  ]);
  const INLINE_COLOR_NAMES = new Set([
    'gray',
    'brown',
    'orange',
    'yellow',
    'green',
    'blue',
    'purple',
    'pink',
    'red',
  ]);
  let simpleTableHandleHover = { blockId: null, row: null, col: null };
  const mermaidPreviewTimers = new Map();
  const mermaidRenderTokens = new Map();
  let mermaidRenderSequence = 0;

  return {
    start: async () => {
      await runtime.bootstrap();
      runtime.publish();
    },
    dispose: () => {
      if (lifecycle.disposed) return;
      runtime.flushHistoryPending();
      if (
        runtime.saveTimer &&
        activeVaultId &&
        lastSyncedWorkspace &&
        workspaceAccess === 'writable'
      )
        void runtime.persistStateNow();
      runtime.clearAttachmentObjectUrls();
      runtime.closeInlineEquation?.();
      runtime.closeMermaidViewer?.();
      runtime.clearMultiBlockSelection();
      document.getElementById('multiBlockSelectionLayer')?.remove();
      lifecycle.dispose();
      deleteConfirmResolver?.(false);
    },
    invoke: (name, ...args) => {
      if (lifecycle.disposed || typeof runtime[name] !== 'function') return;
      const result = runtime[name](...args);
      runtime.publish();
      return result;
    },
    getDocument: () => structuredClone(state),
    flush: () => runtime.persistStateNow(),
  };
}

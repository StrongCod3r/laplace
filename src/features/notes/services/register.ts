// @ts-nocheck
import { STARTUP_THEME_KEY } from './../../../app-identity';
// Existing editor algorithms, isolated behind the typed controller boundary.
import type { EditorRuntime } from '@/features/editor/types';
import { useWorkspaceStore } from '@/store/workspace.store';

export function registerNotes(runtime: EditorRuntime) {
  function renderRightSidebar() {
    if (!runtime.els.rightSidebarContent) return;
    document
      .querySelectorAll('[data-right-mode]')
      .forEach((btn) =>
        btn.classList.toggle('active', btn.dataset.rightMode === runtime.state.rightPanelMode),
      );
    // The store builds the outline/backlinks; do not calculate them twice.
    runtime.publish();
  }

  function fileTreeScope() {
    return (runtime.vaultRegistry.workspaceId || 'browser') + ':' + runtime.activeVaultId;
  }

  function activeTabPageForFiles() {
    if (
      runtime.state.mainView === 'graph' ||
      runtime.state.mainView === 'attachments' ||
      runtime.state.currentPageId === '__home__'
    )
      return null;
    const tab = (runtime.state.openTabs || []).find(
      (item) => item.id === runtime.state.activeTabId,
    );
    return (
      runtime.pageById(tab?.kind === 'page' ? tab.pageId : runtime.state.currentPageId) || null
    );
  }

  function fileTreeKeyForPage(page) {
    if (!page) return null;
    const folderNote = runtime.folderNoteFolderForPage(page);
    return folderNote ? `folder:${folderNote.id}` : `page:${page.id}`;
  }

  function fileTreeRowKey(row) {
    return row.dataset.itemType === 'folder'
      ? 'folder:' + row.dataset.folderId
      : 'page:' + row.dataset.pageId;
  }

  function fileTreeRows() {
    return [
      ...runtime.els.pageTree.querySelectorAll(
        '.folder-tree-row[data-folder-id],.page-tree-row[data-page-id]',
      ),
    ];
  }

  function resetFilesTreeSelection(key = null, cleared = false) {
    runtime.filesTreeSelection = new Set(key ? [key] : []);
    runtime.filesTreeSelectionAnchor = key;
    runtime.filesTreeSelectionScope = runtime.fileTreeScope();
    runtime.filesTreeSelectionCleared = cleared;
  }

  function syncFilesTreeSelection() {
    if (runtime.filesTreeSelectionScope !== runtime.fileTreeScope())
      runtime.resetFilesTreeSelection();
    const rows = runtime.fileTreeRows(),
      visible = new Set(rows.map(runtime.fileTreeRowKey));
    for (const key of runtime.filesTreeSelection)
      if (!visible.has(key)) runtime.filesTreeSelection.delete(key);
    if (!visible.has(runtime.filesTreeSelectionAnchor)) runtime.filesTreeSelectionAnchor = null;
    if (!runtime.filesTreeSelection.size && !runtime.filesTreeSelectionCleared) {
      const active = rows.find((row) =>
        runtime.state.activeFolderPath
          ? row.dataset.folderPath === runtime.state.activeFolderPath
          : row.dataset.pageId === runtime.state.currentPageId,
      );
      if (active) {
        const key = runtime.fileTreeRowKey(active);
        runtime.filesTreeSelection.add(key);
        runtime.filesTreeSelectionAnchor = key;
      }
    }
    runtime.els.pageTree.setAttribute('role', 'tree');
    runtime.els.pageTree.setAttribute('aria-label', 'Files');
    runtime.els.pageTree.setAttribute('aria-multiselectable', 'true');
    rows.forEach((row) => {
      const selected = runtime.filesTreeSelection.has(runtime.fileTreeRowKey(row));
      row.classList.toggle('selected', selected);
      row.classList.toggle('active', selected && row.dataset.itemType === 'note');
      row.setAttribute('role', 'treeitem');
      row.setAttribute('aria-selected', String(selected));
    });
  }

  function selectFilesTreeRow(row, event = {}) {
    runtime.syncFilesTreeSelection();
    const key = runtime.fileTreeRowKey(row),
      keys = runtime.fileTreeRows().map(runtime.fileTreeRowKey);
    const additive = event.ctrlKey || event.metaKey;
    if (event.shiftKey) {
      const anchor = keys.includes(runtime.filesTreeSelectionAnchor)
        ? runtime.filesTreeSelectionAnchor
        : key;
      const start = keys.indexOf(anchor),
        end = keys.indexOf(key);
      if (!additive) runtime.filesTreeSelection.clear();
      keys
        .slice(Math.min(start, end), Math.max(start, end) + 1)
        .forEach((item) => runtime.filesTreeSelection.add(item));
      runtime.filesTreeSelectionAnchor = anchor;
    } else if (additive) {
      if (runtime.filesTreeSelection.has(key)) runtime.filesTreeSelection.delete(key);
      else runtime.filesTreeSelection.add(key);
      runtime.filesTreeSelectionAnchor = key;
    } else {
      runtime.resetFilesTreeSelection(key);
    }
    runtime.filesTreeSelectionCleared = !runtime.filesTreeSelection.size;
    runtime.syncFilesTreeSelection();
  }

  function selectedFileTreeItems(keys = runtime.filesTreeSelection) {
    return [...keys]
      .map((key) => {
        const separator = key.indexOf(':'),
          type = key.slice(0, separator),
          id = key.slice(separator + 1);
        const value = type === 'folder' ? runtime.folderById(id) : runtime.pageById(id);
        return value ? { type, value, key } : null;
      })
      .filter(Boolean);
  }

  function revealCurrentFile() {
    const page = runtime.activeTabPageForFiles();
    if (!page) {
      runtime.toast('Open a page to reveal it in Files.');
      return;
    }
    const folderNote = runtime.state.folderNotesEnabled
      ? runtime.folderNoteFolderForPage(page)
      : null;
    const targetPath = folderNote?.path || runtime.pageFolderPath(page);
    let currentPath = '';
    for (const segment of runtime.normalizeFolderPath(targetPath).split('/').filter(Boolean)) {
      currentPath = [currentPath, segment].filter(Boolean).join('/');
      const folder = runtime.folderByPath(currentPath);
      if (folder) folder.expanded = true;
    }
    let ancestor = page;
    while (ancestor?.parentId) {
      ancestor = runtime.pageById(ancestor.parentId);
      if (ancestor) ancestor.expanded = true;
    }
    const targetPathKey = runtime.normalizeFolderPath(targetPath).toLocaleLowerCase();
    for (const candidate of runtime.state.pages) {
      const implicitPath = runtime.implicitPageFolderPath(candidate).toLocaleLowerCase();
      if (targetPathKey === implicitPath || targetPathKey.startsWith(`${implicitPath}/`))
        candidate.expanded = true;
    }
    runtime.state.leftPanelMode = 'files';
    runtime.state.sidebarOpen = true;
    if (folderNote) {
      const folder = runtime.folderById(folderNote.id);
      if (folder) folder.expanded = true;
      runtime.state.activeFolderPath = folderNote.path;
      runtime.resetFilesTreeSelection(`folder:${folderNote.id}`);
    } else {
      runtime.state.activeFolderPath = '';
      runtime.resetFilesTreeSelection(`page:${page.id}`);
    }
    runtime.scheduleSave();
    runtime.renderSidebar();
    runtime.lifecycle.frame(() => {
      const rows = folderNote
        ? [...runtime.els.pageTree.querySelectorAll('.folder-tree-row[data-folder-path]')]
        : [...runtime.els.pageTree.querySelectorAll('.page-tree-row[data-page-id]')];
      const row = folderNote
        ? rows.find((item) => item.dataset.folderPath === folderNote.path)
        : rows.find((item) => item.dataset.pageId === page.id);
      row?.scrollIntoView({ block: 'nearest' });
    });
  }

  function renderSidebar() {
    const mode = ['files', 'favorites', 'git'].includes(runtime.state.leftPanelMode)
      ? runtime.state.leftPanelMode
      : 'files';
    document
      .querySelectorAll('[data-left-panel]')
      .forEach((panel) => panel.classList.toggle('hidden', panel.dataset.leftPanel !== mode));
    const favs = runtime.state.pages.filter((p) => p.favorite);
    runtime.publish();
    const hiddenPaths = runtime.implicitPageFolderPaths();
    const renderContents = (path) => {
      const folders = (runtime.state.folders || [])
        .filter(
          (folder) =>
            runtime.folderParentPath(folder.path) === path && !hiddenPaths.has(folder.path),
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      const pages = runtime.pagesInFolder(path);
      return [
        ...folders.map((folder) => runtime.folderTreeHTML(folder, renderContents)),
        ...pages.map((page) => runtime.treeNodeHTML(page)),
      ].join('');
    };
    runtime.publish();
    runtime.syncFilesTreeSelection();
    runtime.updateWorkspaceChrome();
    runtime.lifecycle.frame(runtime.updateSidebarOverflow);

    runtime.publish();
  }

  function setFilesTreeExpanded(expanded) {
    for (const folder of runtime.state.folders || []) folder.expanded = expanded;
    for (const page of runtime.state.pages || []) page.expanded = expanded;
    runtime.scheduleSave();
    runtime.renderSidebar();
  }

  function updateSidebarOverflow() {
    const scroller = document.querySelector(
      '#sidebar [data-left-panel]:not(.hidden) .sidebar-scroll',
    );
    if (!scroller) return;
    // Measure from a clean, non-scrollable state so a stale scrollbar cannot keep itself alive.
    scroller.classList.remove('can-scroll');
    const overflow = Math.ceil(scroller.scrollHeight - scroller.clientHeight);
    const canScroll = overflow > 6;
    scroller.classList.toggle('can-scroll', canScroll);
    if (!canScroll) scroller.scrollTop = 0;
  }

  function treeNodeHTML(page) {
    const kids = runtime.childrenOf(page.id);
    const childFolderPath = runtime.implicitPageFolderPath(page);
    const hiddenPaths = runtime.implicitPageFolderPaths();
    const extraFolders = (runtime.state.folders || [])
      .filter((folder) => folder.path === childFolderPath && hiddenPaths.has(folder.path))
      .filter(
        (folder) =>
          runtime.state.pages.some(
            (item) => !item.parentId && runtime.pageFolderPath(item) === folder.path,
          ) ||
          runtime.state.folders.some(
            (item) =>
              runtime.folderParentPath(item.path) === folder.path && !hiddenPaths.has(item.path),
          ),
      )
      .map((folder) => runtime.folderTreeHTML(folder, runtime.renderFolderContentsForPage))
      .join('');
    const hasChildren = kids.length > 0 || extraFolders.length > 0;
    return runtime.htmlWithStyles(
      `${runtime.treeRowHTML(page, 0, true, hasChildren)}${hasChildren && page.expanded !== false ? `<div class="page-children">${kids.map(runtime.treeNodeHTML).join('')}${extraFolders}</div>` : ''}`,
    );
  }

  function renderFolderContentsForPage(path) {
    const hiddenPaths = runtime.implicitPageFolderPaths();
    const folders = (runtime.state.folders || [])
      .filter(
        (folder) => runtime.folderParentPath(folder.path) === path && !hiddenPaths.has(folder.path),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    const pages = runtime.pagesInFolder(path);
    return [
      ...folders.map((folder) =>
        runtime.folderTreeHTML(folder, runtime.renderFolderContentsForPage),
      ),
      ...pages.map((page) => runtime.treeNodeHTML(page)),
    ].join('');
  }

  function folderTreeHTML(folder, renderContents) {
    const children = renderContents(folder.path);
    const expanded = folder.expanded !== false;
    return runtime.htmlWithStyles(`<div class="folder-tree-row ${!runtime.filesTreeSelectionCleared && runtime.state.activeFolderPath === folder.path ? 'selected' : ''}" data-item-type="folder" data-folder-id="${folder.id}" data-folder-path="${runtime.escapeHtml(folder.path)}" draggable="true">
      <button class="tree-expand" data-action="toggle-folder" title="${expanded ? 'Collapse' : 'Expand'} folder" aria-label="${expanded ? 'Collapse' : 'Expand'} folder">${runtime.chevronSvg(expanded ? 'down' : 'right', 'tree-chevron')}</button>
      <button class="folder-select-btn" data-action="select-folder" title="Use ${runtime.escapeHtml(folder.name)} as the current folder"><span class="tree-icon folder-icon" aria-hidden="true">${expanded ? runtime.iconMarkup('folder-open') : runtime.pageIconMarkup(folder.icon || runtime.DEFAULT_FOLDER_ICON)}</span><span class="tree-title">${runtime.escapeHtml(folder.name)}</span></button>
    </div>${expanded && children ? `<div class="page-children">${children}</div>` : ''}`);
  }

  function folderParentPath(path) {
    const parts = runtime.normalizeFolderPath(path).split('/');
    parts.pop();
    return parts.join('/');
  }

  function pageFolderPath(page) {
    if (page?.parentId) {
      const parent = runtime.pageById(page.parentId);
      if (parent)
        return `${runtime.pageFolderPath(parent)}/${runtime.safeFileSegment(parent.title)}`.replace(
          /^\//,
          '',
        );
    }
    return runtime.folderPathForId(page?.folderId);
  }

  function implicitPageFolderPath(page) {
    return `${runtime.pageFolderPath(page)}/${runtime.safeFileSegment(page.title)}`.replace(
      /^\//,
      '',
    );
  }

  function implicitPageFolderPaths() {
    const paths = new Set();
    const explicitFolders = new Set(
      runtime.state.folders
        .filter((folder) => folder.explicit !== false)
        .map((folder) => runtime.normalizeFolderPath(folder.path).toLocaleLowerCase()),
    );
    for (const page of runtime.state.pages) {
      const path = runtime.implicitPageFolderPath(page);
      if (explicitFolders.has(runtime.normalizeFolderPath(path).toLocaleLowerCase())) continue;
      // A matching directory name alone does not make the directory belong to this note.
      if (runtime.childrenOf(page.id).length) paths.add(path);
    }
    return paths;
  }

  function treeRowHTML(
    page,
    depth = 0,
    allowExpand = true,
    hasChildren = runtime.childrenOf(page.id).length > 0,
  ) {
    return runtime.htmlWithStyles(`<div class="page-tree-row ${!runtime.filesTreeSelectionCleared && !runtime.state.activeFolderPath && page.id === runtime.state.currentPageId ? 'active' : ''}" data-item-type="note" data-page-id="${page.id}" draggable="true" style="padding-left:${depth * 8}px">
      ${allowExpand && hasChildren ? `<button class="tree-expand" data-action="toggle-page" title="Expand" aria-label="${page.expanded === false ? 'Expand' : 'Collapse'}">${runtime.chevronSvg(page.expanded === false ? 'right' : 'down', 'tree-chevron')}</button>` : `<span style="width:18px"></span>`}
      <button class="tree-page-btn" data-action="open-page" title="Open page · Middle-click for new tab"><span class="tree-icon">${runtime.pageIconMarkup(runtime.pageIconFor(page))}</span><span class="tree-title">${runtime.escapeHtml(page.title || 'Untitled')}</span></button>
    </div>`);
  }

  function pageIsDescendant(pageId, ancestorId) {
    let page = runtime.pageById(pageId);
    while (page?.parentId) {
      if (page.parentId === ancestorId) return true;
      page = runtime.pageById(page.parentId);
    }
    return false;
  }

  function pageDropMode(event, row) {
    const rect = row.getBoundingClientRect();
    const relative = (event.clientY - rect.top) / Math.max(1, rect.height);
    return relative < 0.3 ? 'before' : relative > 0.7 ? 'after' : 'inside';
  }

  function clearPageDropIndicators() {
    document
      .querySelectorAll('.page-drop-before,.page-drop-after,.page-drop-inside')
      .forEach((row) =>
        row.classList.remove('page-drop-before', 'page-drop-after', 'page-drop-inside'),
      );
    document
      .querySelectorAll('.folder-tree-row.page-drop-folder')
      .forEach((row) => row.classList.remove('page-drop-folder'));
    document
      .querySelectorAll('.sidebar-scroll.page-drop-root')
      .forEach((sidebar) => sidebar.classList.remove('page-drop-root'));
    document
      .querySelectorAll('.block-editor.page-link-drop-target')
      .forEach((editor) => editor.classList.remove('page-link-drop-target'));
    document
      .querySelectorAll('.page-link-drop-before,.page-link-drop-after')
      .forEach((row) => row.classList.remove('page-link-drop-before', 'page-link-drop-after'));
    runtime.pageDrop = null;
    runtime.folderDrop = null;
  }

  function canDropPage(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return false;
    return !runtime.pageIsDescendant(targetId, sourceId);
  }

  function movePageByDrop(sourceId, targetId = null, mode = 'root') {
    const source = runtime.pageById(sourceId),
      target = targetId ? runtime.pageById(targetId) : null;
    if (!source || (target && !runtime.canDropPage(sourceId, targetId))) return false;
    if (target && mode === 'inside') return runtime.movePageIntoNoteFolder(source, target);
    const sourceIndex = runtime.state.pages.indexOf(source);
    if (sourceIndex < 0) return false;
    const parentId = target?.parentId || null;
    const folderId = target
      ? target.folderId
      : mode === 'root'
        ? null
        : runtime.folderByPath(runtime.state.activeFolderPath)?.id || null;
    const title = runtime.titleForPageDestination(source, parentId, folderId);
    if (!title) return false;
    runtime.state.pages.splice(sourceIndex, 1);
    source.folderNote = false;
    source.title = title;
    source.parentId = parentId;
    source.folderId = folderId;
    if (target && mode !== 'inside') {
      const targetIndex = runtime.state.pages.indexOf(target);
      runtime.state.pages.splice(Math.max(0, targetIndex + (mode === 'after' ? 1 : 0)), 0, source);
    } else runtime.state.pages.push(source);
    if (parentId) {
      const parent = runtime.pageById(parentId);
      if (parent) parent.expanded = true;
    }
    runtime.scheduleSave();
    runtime.renderAll();
    return true;
  }

  function ensureFolderEntries(path) {
    let currentPath = '';
    for (const segment of runtime.normalizeFolderPath(path).split('/').filter(Boolean)) {
      currentPath = [currentPath, segment].filter(Boolean).join('/');
      let folder = runtime.folderByPath(currentPath);
      if (!folder) {
        folder = {
          id: runtime.folderIdForPath(currentPath),
          path: currentPath,
          name: segment,
          icon: runtime.DEFAULT_FOLDER_ICON,
          expanded: true,
          explicit: false,
        };
        runtime.state.folders.push(folder);
      } else folder.expanded = true;
    }
    return runtime.folderByPath(runtime.normalizeFolderPath(path));
  }

  function folderPathForPageContents(page) {
    const containingFolder =
      page && !page.parentId && page.folderId ? runtime.folderById(page.folderId) : null;
    const matchesFolder =
      containingFolder &&
      String(page.title || 'Untitled').toLocaleLowerCase() ===
        String(containingFolder.name || '').toLocaleLowerCase();
    return matchesFolder ? containingFolder.path : runtime.implicitPageFolderPath(page);
  }

  function movePageIntoNoteFolder(source, target) {
    const sourceIndex = runtime.state.pages.indexOf(source);
    if (sourceIndex < 0) return false;
    const folderPath = runtime.folderPathForPageContents(target),
      targetName = String(target.title || 'Untitled').toLocaleLowerCase();
    const targetAlreadyFolderNote =
      !target.parentId &&
      target.folderId &&
      runtime.folderById(target.folderId)?.path === folderPath;
    const conflictingNote = runtime.state.pages.find(
      (page) =>
        page.id !== target.id &&
        page.id !== source.id &&
        String(page.title || 'Untitled').toLocaleLowerCase() === targetName &&
        (page.parentId === target.id ||
          (!page.parentId && runtime.pageFolderPath(page) === folderPath)),
    );
    if (conflictingNote) {
      runtime.toast(`A note named "${conflictingNote.title}" already exists in that folder.`);
      return false;
    }
    const title = runtime.uniqueDirectoryName(
      source.title,
      folderPath,
      { pageId: source.id, reservedNames: [target.title], checkFolders: false },
      3,
      'suffix',
    );
    if (!title) return false;
    const folder = runtime.ensureFolderEntries(folderPath);
    if (!folder) return false;
    const targetChildren = targetAlreadyFolderNote ? [] : runtime.childrenOf(target.id).slice();
    runtime.state.pages.splice(sourceIndex, 1);
    target.parentId = null;
    target.folderId = folder.id;
    target.folderNote = true;
    target.expanded = true;
    for (const child of targetChildren) {
      child.parentId = null;
      child.folderId = folder.id;
      child.folderNote = false;
    }
    source.title = title;
    source.parentId = null;
    source.folderId = folder.id;
    source.folderNote = false;
    folder.expanded = true;
    runtime.state.pages.push(source);
    runtime.scheduleSave();
    runtime.renderAll();
    return true;
  }

  async function convertPageToFolder(pageId) {
    const page = runtime.pageById(pageId);
    if (!page) return false;
    if (runtime.workspaceAccess !== 'writable') {
      runtime.toast('Grant write access to convert this note into a folder.');
      return false;
    }
    if (runtime.representedFolderForPage(page)) {
      runtime.toast('This note is already a folder.');
      return false;
    }
    const originalName = String(page.title || 'Untitled'),
      parentPath = runtime.pageFolderPath(page),
      name = runtime.uniqueDirectoryName(
        originalName,
        parentPath,
        { checkPages: false },
        3,
        'suffix',
      );
    if (!name) return false;
    const folderPath = [parentPath, name].filter(Boolean).join('/');
    const workspaceRef = runtime.state;
    if (
      !(await runtime.askDeleteConfirmation(
        'Convert note to folder?',
        `Convert “${name}” into a folder? The note content will be preserved inside the folder, and its child notes will move into it.`,
        'Convert to Folder',
      ))
    )
      return false;
    if (
      runtime.state !== workspaceRef ||
      runtime.workspaceAccess !== 'writable' ||
      runtime.gitOperationActive ||
      runtime.workspaceLocationSwitching ||
      runtime.pageById(pageId) !== page ||
      String(page.title || 'Untitled') !== originalName ||
      runtime.pageFolderPath(page) !== parentPath ||
      runtime.representedFolderForPage(page) ||
      runtime.directoryNameConflict(name, parentPath, { checkPages: false })
    )
      return false;
    const folder = runtime.ensureFolderEntries(folderPath);
    if (!folder) return false;
    const parent = page.parentId ? runtime.pageById(page.parentId) : null,
      children = runtime.childrenOf(page.id).slice();
    page.title = name;
    page.parentId = null;
    page.folderId = folder.id;
    page.folderNote = runtime.state.folderNotesEnabled;
    page.expanded = true;
    for (const child of children) {
      child.parentId = null;
      child.folderId = folder.id;
      child.folderNote = false;
    }
    if (parent) parent.expanded = true;
    folder.expanded = true;
    runtime.state.activeFolderPath = folder.path;
    runtime.state.leftPanelMode = 'files';
    runtime.state.sidebarOpen = true;
    runtime.resetFilesTreeSelection('folder:' + folder.id);
    runtime.scheduleSave();
    runtime.renderAll();
    runtime.toast(`Converted to folder: ${name}`);
    return true;
  }

  async function convertFolderToNote(path) {
    if (runtime.workspaceAccess !== 'writable') return false;
    const folder = runtime.folderByPath(path);
    if (!folder) return false;
    const confirmingWorkspace = runtime.state;
    if (
      !(await runtime.askDeleteConfirmation(
        'Convert folder to note?',
        `Convert “${folder.name}” into a note? Its child notes, subfolders and other files will move to the parent directory, alongside the new note. Existing names will be preserved by renaming any conflicting items.`,
        'Convert to Note',
      ))
    )
      return false;
    if (
      runtime.state !== confirmingWorkspace ||
      runtime.workspaceAccess !== 'writable' ||
      runtime.gitOperationActive ||
      runtime.workspaceLocationSwitching ||
      runtime.folderByPath(path) !== folder
    )
      return false;
    if (!(await runtime.persistStateNow())) return false;
    const vaultId = runtime.activeVaultId,
      workspaceRef = runtime.state,
      previous = runtime.clone(workspaceRef),
      snapshot = runtime.clone(previous),
      parentPath = runtime.folderParentPath(folder.path),
      parentFolder = runtime.folderByPath(parentPath),
      prefix = `${folder.path}/`,
      join = (name) => [parentPath, name].filter(Boolean).join('/'),
      occupied = new Set(),
      transfers = [];
    let parentDirectory = null,
      sourceDirectory = null;
    const created = [];
    try {
      const oldFiles = runtime.serializeMarkdownWorkspace(runtime.clone(previous));
      for (const file of oldFiles)
        if (runtime.folderParentPath(file.path) === parentPath)
          occupied.add(file.path.split('/').at(-1).toLocaleLowerCase());
      for (const item of snapshot.folders)
        if (runtime.folderParentPath(item.path) === parentPath)
          occupied.add(item.name.toLocaleLowerCase());
      if (!parentPath)
        for (const name of [
          runtime.STORAGE_CONFIG.indexeddb.appDirectory,
          runtime.STORAGE_CONFIG.indexeddb.attachmentsDirectory,
          'attachments',
        ])
          occupied.add(name.toLocaleLowerCase());
      if (runtime.localStorageGateway.hasDirectory?.()) {
        parentDirectory = await runtime.localStorageGateway.getGitDirectory();
        for (const segment of parentPath.split('/').filter(Boolean))
          parentDirectory = await parentDirectory.getDirectoryHandle(segment);
        sourceDirectory = await parentDirectory.getDirectoryHandle(folder.name);
        for await (const [name] of parentDirectory.entries())
          occupied.add(name.toLocaleLowerCase());
      }
      const reserveName = (base, extension = '') => {
        let name = base,
          counter = 1;
        while (occupied.has(`${name}${extension}`.toLocaleLowerCase()))
          name = runtime.counterNameSuffix(
            base,
            counter++,
            new TextEncoder().encode(extension).length,
          );
        const error = runtime.validateFilesystemName(
          name,
          new TextEncoder().encode(extension).length,
        );
        if (error) throw new Error(error);
        occupied.add(`${name}${extension}`.toLocaleLowerCase());
        return name;
      };
      let note = snapshot.pages.find(
        (page) =>
          !page.parentId &&
          page.folderId === folder.id &&
          (page.folderNote === true ||
            String(page.title).toLocaleLowerCase() === folder.name.toLocaleLowerCase()),
      );
      if (!note) {
        note = {
          id: runtime.uid('page'),
          title: folder.name,
          favorite: false,
          expanded: true,
          blocks: [runtime.newTextBlock()],
        };
        snapshot.pages.push(note);
      }
      note.title = reserveName(folder.name, '.md');
      note.parentId = null;
      note.folderId = parentFolder?.id || null;
      note.folderNote = false;
      for (const page of snapshot.pages) {
        if (page.id === note.id) continue;
        if (page.parentId !== note.id && (page.parentId || page.folderId !== folder.id)) continue;
        page.parentId = null;
        page.title = reserveName(page.title, '.md');
        page.folderId = parentFolder?.id || null;
        page.folderNote = false;
      }
      const childFolders = snapshot.folders.filter(
        (item) => runtime.folderParentPath(item.path) === folder.path,
      );
      for (const child of childFolders) {
        const oldPath = child.path;
        const rootNote = snapshot.pages.find(
          (page) =>
            !page.parentId &&
            page.folderId === child.id &&
            String(page.title).toLocaleLowerCase() === child.name.toLocaleLowerCase(),
        );
        let name = reserveName(child.name);
        while (
          rootNote &&
          snapshot.pages.some(
            (page) =>
              page.id !== rootNote.id &&
              !page.parentId &&
              page.folderId === child.id &&
              String(page.title).toLocaleLowerCase() === name.toLocaleLowerCase(),
          )
        )
          name = reserveName(child.name);
        const newPath = join(name);
        transfers.push({ source: oldPath.split('/').at(-1), target: name, kind: 'directory' });
        runtime.renameFolderPathsInWorkspace(snapshot, oldPath, newPath, name);
      }
      snapshot.folders = snapshot.folders.filter((item) => item.id !== folder.id);
      snapshot.activeFolderPath = '';
      // Unmanaged files (including attachments) must survive removal of the original directory.
      const tracked = new Set(oldFiles.map((file) => file.path.toLocaleLowerCase()));
      if (sourceDirectory) {
        const planned = new Set(transfers.map((item) => item.source));
        for await (const [name, entry] of sourceDirectory.entries()) {
          if (planned.has(name) || tracked.has(`${prefix}${name}`.toLocaleLowerCase())) continue;
          const dot = entry.kind === 'file' ? name.lastIndexOf('.') : -1;
          const extension = dot > 0 ? name.slice(dot) : '';
          const target = `${reserveName(extension ? name.slice(0, dot) : name, extension)}${extension}`;
          transfers.push({ source: name, target, kind: entry.kind });
        }
      }
      const files = runtime.serializeMarkdownWorkspace(snapshot);
      const copyUnmanaged = async (from, to, sourcePath) => {
        for await (const [name, entry] of from.entries()) {
          const filePath = `${sourcePath}/${name}`;
          if (tracked.has(filePath.toLocaleLowerCase())) continue;
          if (entry.kind === 'directory')
            await copyUnmanaged(
              entry,
              await to.getDirectoryHandle(name, { create: true }),
              filePath,
            );
          else {
            const writer = await (await to.getFileHandle(name, { create: true })).createWritable();
            await writer.write(await entry.getFile());
            await writer.close();
          }
        }
      };
      await runtime.queueStorageWrite(async () => {
        if (runtime.state !== workspaceRef || runtime.activeVaultId !== vaultId)
          throw new Error('The workspace changed during conversion.');
        if (parentDirectory) {
          for (const item of transfers) {
            for await (const [name] of parentDirectory.entries())
              if (name.toLocaleLowerCase() === item.target.toLocaleLowerCase())
                throw new Error(`An item named "${item.target}" already exists.`);
            if (item.kind === 'directory') {
              const target = await parentDirectory.getDirectoryHandle(item.target, {
                create: true,
              });
              created.push(item.target);
              await copyUnmanaged(
                await sourceDirectory.getDirectoryHandle(item.source),
                target,
                `${prefix}${item.source}`,
              );
            } else {
              const target = await parentDirectory.getFileHandle(item.target, { create: true });
              created.push(item.target);
              const writer = await target.createWritable();
              await writer.write(
                await (await sourceDirectory.getFileHandle(item.source)).getFile(),
              );
              await writer.close();
            }
          }
          await runtime.localStorageGateway.writeMarkdownFiles(files, { allowDeletes: true });
          snapshot.markdownFilesInitialized = true;
        }
        await runtime.storageGateway.saveWorkspace(vaultId, snapshot);
        if (parentDirectory) await runtime.localStorageGateway.removeFolder(folder.path);
      });
      runtime.state = snapshot;
      runtime.lastSyncedWorkspace = runtime.clone(snapshot);
      runtime.recordHistory();
      runtime.resetFilesTreeSelection(`page:${note.id}`);
      runtime.createTab(note.id, true, snapshot.activeEditorGroupId);
      runtime.renderAll();
      runtime.scheduleSave();
      runtime.toast(`Converted to note: ${note.title}`);
      return true;
    } catch (error) {
      await runtime
        .queueStorageWrite(async () => {
          if (parentDirectory) {
            await runtime.localStorageGateway.writeMarkdownFiles(
              runtime.serializeMarkdownWorkspace(previous),
              { allowDeletes: true },
            );
            for (const name of created)
              await parentDirectory.removeEntry(name, { recursive: true });
          }
          await runtime.storageGateway.saveWorkspace(vaultId, previous);
        })
        .catch((rollbackError) =>
          console.error('Could not restore the folder after conversion.', rollbackError),
        );
      runtime.toast(error?.message || 'Could not convert that folder to a note.');
      return false;
    }
  }

  function movePageToFolder(sourceId, path = '') {
    return runtime.movePagesToFolder([sourceId], path);
  }

  function movePagesToFolder(sourceIds, path = '') {
    const pages = [...new Set(sourceIds)].map((id) => runtime.pageById(id)).filter(Boolean);
    if (!pages.length) return false;
    const folderPath = runtime.normalizeFolderPath(path);
    const folderId = runtime.folderByPath(folderPath)?.id || null;
    const selectedIds = new Set(pages.map((page) => page.id));
    const roots = pages.filter((page) => {
      let parent = page.parentId ? runtime.pageById(page.parentId) : null;
      while (parent) {
        if (selectedIds.has(parent.id)) return false;
        parent = parent.parentId ? runtime.pageById(parent.parentId) : null;
      }
      return true;
    });
    const reservedNames = [];
    const moves = [];
    for (const page of roots) {
      const title = runtime.uniqueDirectoryName(
        page.title,
        folderPath,
        {
          pageId: page.id,
          excludedPageIds: [...selectedIds],
          reservedNames,
          checkFolders: false,
        },
        3,
        'suffix',
      );
      if (!title) return false;
      reservedNames.push(title);
      moves.push({ page, title });
    }
    for (const { page, title } of moves) {
      page.title = title;
      page.parentId = null;
      page.folderId = folderId;
      page.folderNote = false;
    }
    runtime.state.activeFolderPath = folderPath;
    runtime.scheduleSave();
    runtime.renderAll();
    return true;
  }

  function canDropFolder(sourcePath, targetPath) {
    const source = runtime.normalizeFolderPath(sourcePath),
      target = runtime.normalizeFolderPath(targetPath);
    if (!source || source.toLocaleLowerCase() === target.toLocaleLowerCase()) return false;
    return !target.toLocaleLowerCase().startsWith(`${source.toLocaleLowerCase()}/`);
  }

  async function moveFolderByDrop(sourcePath, targetPath = '', { copy = false } = {}) {
    if (runtime.workspaceAccess !== 'writable') return false;
    const source = runtime.folderByPath(sourcePath);
    if (!source || !runtime.canDropFolder(source.path, targetPath)) return false;
    const parentPath = runtime.normalizeFolderPath(targetPath);
    if (
      !copy &&
      parentPath.toLocaleLowerCase() === runtime.folderParentPath(source.path).toLocaleLowerCase()
    )
      return false;
    if (
      !parentPath &&
      [
        runtime.STORAGE_CONFIG.indexeddb.attachmentsDirectory,
        runtime.STORAGE_CONFIG.indexeddb.appDirectory,
        'attachments',
      ].some((name) => name.toLocaleLowerCase() === source.name.toLocaleLowerCase())
    ) {
      runtime.toast('That folder name is reserved for app data or attachments.');
      return false;
    }
    const validationError = runtime.validateFilesystemName(source.name);
    if (validationError) {
      runtime.toast(validationError);
      return false;
    }
    const newName = runtime.uniqueFolderName(source, parentPath, { copy });
    if (!newName) return false;
    const newPath = [parentPath, newName].filter(Boolean).join('/');

    const oldPath = source.path,
      oldWorkspace = runtime.clone(runtime.state),
      vaultId = runtime.activeVaultId,
      workspaceRef = runtime.state;
    runtime.lifecycle.clearTimeout(runtime.saveTimer);
    runtime.saveTimer = null;
    if (copy) {
      const root = oldPath.toLocaleLowerCase(),
        inside = (path) =>
          path.toLocaleLowerCase() === root || path.toLocaleLowerCase().startsWith(root + '/');
      const copied = {
        folders: runtime.clone(runtime.state.folders.filter((folder) => inside(folder.path))),
        pages: runtime.clone(
          runtime.state.pages.filter((page) => inside(runtime.pageFolderPath(page))),
        ),
      };
      runtime.renameFolderPathsInWorkspace(copied, oldPath, newPath, newName);
      const pageIds = new Map(copied.pages.map((page) => [page.id, runtime.uid('page')]));
      const remapLinks = (value) => {
        if (!value || typeof value !== 'object') return;
        if (pageIds.has(value.pageId)) value.pageId = pageIds.get(value.pageId);
        for (const child of Object.values(value)) remapLinks(child);
      };
      for (const page of copied.pages) {
        page.id = pageIds.get(page.id);
        page.parentId = pageIds.get(page.parentId) || null;
        page.blocks = page.blocks.map(runtime.cloneBlockWithNewIds);
        remapLinks(page.blocks);
        page.favorite = false;
      }
      runtime.state.folders.push(...copied.folders);
      runtime.state.pages.push(...copied.pages);
    } else runtime.renameFolderPathsInWorkspace(runtime.state, oldPath, newPath, newName);
    const movedFolder = runtime.folderByPath(newPath),
      targetFolder = parentPath ? runtime.folderByPath(parentPath) : null;
    if (movedFolder) movedFolder.expanded = true;
    if (targetFolder) targetFolder.expanded = true;
    runtime.recordHistory('merge');
    runtime.flushHistoryPending(vaultId);
    const snapshot = runtime.clone(runtime.state);
    let physicalMoveCompleted = false;
    try {
      await runtime.queueStorageWrite(async () => {
        await runtime.externalizeEmbeddedImages(snapshot, workspaceRef);
        const markdownFiles = runtime.localStorageGateway.hasDirectory?.()
          ? runtime.serializeMarkdownWorkspace(snapshot)
          : null;
        if (runtime.localStorageGateway.hasDirectory?.()) {
          const transfer = copy
            ? runtime.localStorageGateway.copyFolder
            : runtime.localStorageGateway.renameFolder;
          if (!transfer)
            throw new Error('Folder transfer is not available for the selected notes folder.');
          await transfer.call(runtime.localStorageGateway, oldPath, newPath);
          physicalMoveCompleted = true;
        }
        if (markdownFiles) {
          snapshot.markdownFilesInitialized = true;
          if (runtime.state === workspaceRef) {
            runtime.state.markdownFilesInitialized = true;
            for (const item of snapshot.pages) {
              const current = runtime.pageById(item.id);
              if (current) current.filePath = item.filePath;
            }
          }
        }
        if (markdownFiles && runtime.localStorageGateway.writeMarkdownFiles)
          await runtime.localStorageGateway.writeMarkdownFiles(markdownFiles, {
            allowDeletes: true,
          });
        await runtime.storageGateway.saveWorkspace(vaultId, snapshot);
      });
      runtime.lastSyncedWorkspace = runtime.clone(snapshot);
      if (runtime.state === workspaceRef) runtime.renderAll();
      runtime.toast(`Folder ${copy ? 'duplicated' : 'moved'}: ${newName}`);
      return true;
    } catch (error) {
      if (!physicalMoveCompleted) {
        if (runtime.state === workspaceRef) {
          runtime.state = runtime.normalizeWorkspace(oldWorkspace);
          const history = runtime.historyForVault(vaultId);
          history.present = runtime.clone(runtime.state);
          history.pending = null;
          runtime.lifecycle.clearTimeout(runtime.historyTimer);
          runtime.historyTimer = null;
          runtime.renderAll();
        }
        try {
          const rollback = runtime.clone(oldWorkspace);
          await runtime.queueStorageWrite(async () => {
            const markdownFiles = runtime.localStorageGateway.hasDirectory?.()
              ? runtime.serializeMarkdownWorkspace(rollback)
              : null;
            if (markdownFiles && runtime.localStorageGateway.writeMarkdownFiles)
              await runtime.localStorageGateway.writeMarkdownFiles(markdownFiles, {
                allowDeletes: true,
              });
            await runtime.storageGateway.saveWorkspace(vaultId, rollback);
          });
          runtime.lastSyncedWorkspace = runtime.clone(oldWorkspace);
        } catch (rollbackError) {
          console.error('Could not restore a folder after a failed move.', rollbackError);
        }
      } else {
        let recovered = false;
        try {
          await runtime.queueStorageWrite(async () => {
            const markdownFiles = runtime.localStorageGateway.hasDirectory?.()
              ? runtime.serializeMarkdownWorkspace(snapshot)
              : null;
            snapshot.markdownFilesInitialized =
              Boolean(markdownFiles) || snapshot.markdownFilesInitialized;
            if (markdownFiles && runtime.localStorageGateway.writeMarkdownFiles)
              await runtime.localStorageGateway.writeMarkdownFiles(markdownFiles, {
                allowDeletes: true,
              });
            await runtime.storageGateway.saveWorkspace(vaultId, snapshot);
          });
          runtime.lastSyncedWorkspace = runtime.clone(snapshot);
          recovered = true;
        } catch (recoveryError) {
          console.error(
            'Could not finish saving the workspace after moving a folder.',
            recoveryError,
          );
        }
        if (recovered) {
          if (runtime.state === workspaceRef) runtime.renderAll();
          runtime.toast(`Folder ${copy ? 'duplicated' : 'moved'}: ${newName}`);
          return true;
        }
      }
      console.error('Could not transfer the folder.', error);
      runtime.toast(error?.message || 'Could not transfer that folder.');
      return false;
    }
  }

  function removePagesFromWorkspace(ids) {
    for (const id of ids) runtime.confirmedPageDeletions.add(id);
    if (ids.has(runtime.state.currentPageId)) runtime.cancelPageOperations();
    runtime.state.pages = runtime.state.pages.filter((p) => !ids.has(p.id));
    runtime.state.openTabs = (runtime.state.openTabs || []).filter(
      (tab) => tab.kind === 'graph' || !ids.has(tab.pageId),
    );
    runtime.repairEditorGroups();
    if (!(runtime.state.openTabs || []).some((tab) => tab.id === runtime.state.activeTabId))
      runtime.state.activeTabId = null;
    if (ids.has(runtime.state.currentPageId)) {
      const next = runtime.state.openTabs.at(-1) || null;
      if (next?.kind === 'graph') {
        runtime.state.activeTabId = next.id;
        runtime.state.mainView = 'graph';
        runtime.state.currentPageId = runtime.state.pages[0]?.id || '__home__';
      } else if (next?.kind === 'attachments') {
        runtime.state.activeTabId = next.id;
        runtime.state.mainView = 'attachments';
        runtime.state.currentPageId = runtime.state.pages[0]?.id || '__home__';
      } else {
        runtime.state.activeTabId = next?.id || null;
        runtime.state.currentPageId = next?.pageId || runtime.state.pages[0]?.id || '__home__';
        runtime.state.mainView = 'page';
      }
    }
  }

  async function deletePage(id) {
    const page = runtime.pageById(id);
    if (!page) return;
    const title = page.title || 'Untitled';
    if (
      !(await runtime.askDeleteConfirmation(
        'Delete note?',
        `Delete “${title}” and its child notes?`,
      ))
    )
      return;
    if (!runtime.pageById(id)) return;
    const ids = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of runtime.state.pages) {
        if (p.parentId && ids.has(p.parentId) && !ids.has(p.id)) {
          ids.add(p.id);
          changed = true;
        }
      }
    }
    runtime.removePagesFromWorkspace(ids);
    runtime.resetFilesTreeSelection();
    runtime.scheduleSave();
    runtime.renderAll();
    runtime.toast('Page moved to trash');
  }

  function duplicatePage(id) {
    const p = runtime.pageById(id);
    if (!p) return;
    const title = runtime.uniqueNoteTitle(p.title, p.parentId, p.folderId);
    if (!title) return;
    const cp = runtime.clone(p);
    cp.id = runtime.uid('page');
    delete cp.filePath;
    cp.title = title;
    cp.blocks = cp.blocks.map(runtime.cloneBlockWithNewIds);
    cp.favorite = false;
    cp.folderNote = false;
    runtime.state.pages.push(cp);
    runtime.scheduleSave();
    runtime.openPage(cp.id);
    runtime.toast('Page duplicated');
  }

  function openPage(id, { newTab = false, preserveTreeSelection = false } = {}) {
    useWorkspaceStore.getState().setGitDiff(null);
    const page = runtime.pageById(id);
    if (!page) return;
    if (!preserveTreeSelection) runtime.resetFilesTreeSelection(runtime.fileTreeKeyForPage(page));
    runtime.state.mainView = 'page';
    if (newTab) runtime.createTab(id, true);
    else runtime.replaceActiveTab(id);
    runtime.scheduleSave('view');
    runtime.renderAll();
  }

  function renderPageComments() {
    const p = runtime.currentPage();
    const comments = p.comments || [];
    runtime.els.pageComments.innerHTML =
      runtime.htmlWithStyles(`<div class="comments-head"><div class="comments-title">Page comments${comments.length ? ` · ${comments.length}` : ''}</div><button class="comments-close" data-comments-close title="Close">${runtime.iconMarkup('x', '14px')}</button></div>
      <div class="comment-composer"><div class="comment-avatar">YOU</div><div class="comment-input-wrap"><textarea class="comment-input" data-comment-input placeholder="Add a comment…"></textarea><div class="comment-actions"><button class="comment-submit" data-comment-submit>Comment</button></div></div></div>
      <div class="comments-list">${comments.length ? comments.map(runtime.commentHTML).join('') : '<div class="comments-empty">No comments yet.</div>'}</div>`);
  }

  function commentHTML(c) {
    return runtime.htmlWithStyles(
      `<div class="comment-item"><div class="comment-avatar">YOU</div><div class="comment-body"><div class="comment-meta"><span class="comment-author">You</span><span class="comment-time">${runtime.escapeHtml(runtime.formatCommentTime(c.createdAt))}</span><button class="comment-delete" data-comment-delete="${c.id}" title="Delete comment">${runtime.iconMarkup('x', '14px')}</button></div><div class="comment-text">${runtime.escapeHtml(c.text || '')}</div></div></div>`,
    );
  }

  function formatCommentTime(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function addPageComment() {
    const input = runtime.els.pageComments.querySelector('[data-comment-input]');
    const text = input?.value.trim();
    if (!text) return;
    const p = runtime.currentPage();
    if (!p.comments) p.comments = [];
    p.comments.push({ id: runtime.uid('comment'), text, createdAt: new Date().toISOString() });
    runtime.scheduleSave();
    runtime.renderPageComments();
    runtime.lifecycle.frame(() =>
      runtime.els.pageComments.querySelector('[data-comment-input]')?.focus(),
    );
  }

  function deletePageComment(id) {
    const p = runtime.currentPage();
    p.comments = (p.comments || []).filter((c) => c.id !== id);
    runtime.scheduleSave();
    runtime.renderPageComments();
  }

  function applyTheme() {
    let dark = false;
    if (runtime.state.theme === 'dark') dark = true;
    else if (runtime.state.theme === 'system')
      dark = matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.toggle('dark', dark);
    // Keep the previous preview while the controller still has its default theme.
    if (runtime.activeVaultId) {
      document.documentElement.dataset.startupTheme = dark ? 'dark' : 'light';
      try {
        localStorage.setItem(STARTUP_THEME_KEY, runtime.state.theme);
      } catch {
        // Theme previews must also work when browser storage is unavailable.
      }
    }
    runtime.updateSettingsText();
    runtime.scheduleMermaidPreviews();
  }

  Object.assign(runtime, {
    renderRightSidebar,
    fileTreeScope,
    activeTabPageForFiles,
    fileTreeKeyForPage,
    fileTreeRowKey,
    fileTreeRows,
    resetFilesTreeSelection,
    syncFilesTreeSelection,
    selectFilesTreeRow,
    selectedFileTreeItems,
    revealCurrentFile,
    renderSidebar,
    setFilesTreeExpanded,
    updateSidebarOverflow,
    treeNodeHTML,
    renderFolderContentsForPage,
    folderTreeHTML,
    folderParentPath,
    pageFolderPath,
    implicitPageFolderPath,
    implicitPageFolderPaths,
    treeRowHTML,
    pageIsDescendant,
    pageDropMode,
    clearPageDropIndicators,
    canDropPage,
    movePageByDrop,
    ensureFolderEntries,
    folderPathForPageContents,
    movePageIntoNoteFolder,
    convertPageToFolder,
    convertFolderToNote,
    movePageToFolder,
    movePagesToFolder,
    canDropFolder,
    moveFolderByDrop,
    removePagesFromWorkspace,
    deletePage,
    duplicatePage,
    openPage,
    renderPageComments,
    commentHTML,
    formatCommentTime,
    addPageComment,
    deletePageComment,
    applyTheme,
  });
}

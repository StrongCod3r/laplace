// @ts-nocheck
import { APP_NAME, DEFAULT_VAULT_NAME } from './../../../app-identity';
// Existing editor algorithms, isolated behind the typed controller boundary.
import type { EditorRuntime } from '@/features/editor/types';
import { useWorkspaceStore } from '@/store/workspace.store';
import type { GitSettings } from '@/features/git/services/git-client';
import type { GitAuthentication } from '@/features/git/services/git-credentials';
import type { GitClient } from '@/features/git/services/git-worker-client';
import type { DirectoryHandle } from '@/features/git/services/directory-fs';

export function registerWorkspace(runtime: EditorRuntime) {
  async function createWebWorkspace(
    settings: GitSettings,
    authentication: GitAuthentication,
  ): Promise<void> {
    if (
      runtime.lifecycle.disposed ||
      runtime.gitOperationActive ||
      runtime.workspaceLocationSwitching ||
      runtime.workspaceLocationClosing
    )
      throw new Error('Wait for the workspace operation to finish.');
    const gateway = runtime.localStorageGateway;
    runtime.workspaceLocationSwitching = true;
    runtime.syncWorkspaceLocationActions();
    let client: GitClient | undefined;
    let directory: { id: string; handle: DirectoryHandle } | undefined;
    let registered = false;
    try {
      directory = await gateway.createWebDirectory();
      const { createGitClient } = await import('@/features/git/services/git-worker-client');
      client = await createGitClient(directory.handle);
      client.authenticate(authentication.username, authentication.token);
      await client.clone(settings);
      if (runtime.lifecycle.disposed) throw new Error('Workspace closed while cloning.');
      const { saveGitCredentials } = await import('@/features/git/services/git-credentials');
      await saveGitCredentials(directory.id, settings.url, authentication);
      const name = new URL(settings.url).pathname
        .split('/')
        .filter(Boolean)
        .at(-1)
        .replace(/\.git$/, '');
      await gateway.registerWebDirectory(directory.id, `${name} (Web)`, directory.handle);
      registered = true;
      await runtime.refreshWorkspaceSelector();
    } finally {
      try {
        client?.dispose();
        if (directory && !registered) {
          const root = await navigator.storage.getDirectory();
          const parent = await root.getDirectoryHandle('laplace-web');
          await parent.removeEntry(directory.id, { recursive: true });
        }
      } finally {
        runtime.workspaceLocationSwitching = false;
        runtime.syncWorkspaceLocationActions();
      }
    }
    if (!(await runtime.switchWorkspaceLocation(directory.id)))
      throw new Error('Repository cloned. Select the web workspace to retry opening it.');
  }

  async function getGitDirectory() {
    return runtime.localStorageGateway.getGitDirectory?.();
  }

  async function beginGitOperation() {
    if (
      runtime.gitOperationActive ||
      runtime.workspaceLocationSwitching ||
      runtime.workspaceLocationClosing
    )
      throw new Error('Wait for the workspace operation to finish.');
    if (runtime.workspaceAccess !== 'writable' || !runtime.localStorageGateway.hasDirectory?.())
      throw new Error('Select a local folder and grant write access.');
    runtime.gitOperationActive = true;
    runtime.workspaceLocationSwitching = true;
    useWorkspaceStore.getState().setGitBusy(true);
    runtime.syncWorkspaceLocationActions();
    try {
      await runtime.workspacePermissionCheck;
      runtime.cancelPageOperations();
      runtime.flushHistoryPending(runtime.activeVaultId);
      if (runtime.saveTimer && !(await runtime.persistStateNow()))
        throw new Error('Could not save the notes before running Git.');
      await runtime.storageWriteChain;
      runtime.setWorkspaceAccess('checking');
      return await getGitDirectory();
    } catch (error) {
      runtime.gitOperationActive = false;
      runtime.workspaceLocationSwitching = false;
      useWorkspaceStore.getState().setGitBusy(false);
      const permission = await runtime.localStorageGateway
        .getDirectoryPermission?.()
        .catch(() => 'none');
      runtime.setWorkspaceAccess(runtime.accessModeForPermission(permission));
      runtime.syncWorkspaceLocationActions();
      throw error;
    }
  }

  async function endGitOperation(reload = false) {
    if (!runtime.gitOperationActive) return;
    try {
      if (reload) {
        runtime.vaultRegistry = await runtime.loadVaultRegistry();
        runtime.activeVaultId = runtime.vaultRegistry.activeVaultId;
        runtime.state = await runtime.loadState(runtime.activeVaultId, { fromGit: true });
        runtime.state.leftPanelMode = 'git';
        runtime.state.sidebarOpen = true;
        runtime.clearAttachmentObjectUrls();
        runtime.invalidateAttachmentList();
        runtime.initializeHistoryForVault(runtime.activeVaultId, { reset: true });
        runtime.lastSyncedWorkspace = runtime.clone(runtime.state);
      }
      const permission = await runtime.localStorageGateway.getDirectoryPermission?.();
      runtime.setWorkspaceAccess(runtime.accessModeForPermission(permission));
      runtime.applyTheme();
      runtime.renderAll();
    } catch (error) {
      runtime.setWorkspaceAccess('blocked');
      throw error;
    } finally {
      runtime.gitOperationActive = false;
      runtime.workspaceLocationSwitching = false;
      useWorkspaceStore.getState().setGitBusy(false);
      runtime.syncWorkspaceLocationActions();
    }
  }

  function isExternalPageIcon(icon) {
    const value = String(icon || '').trim();
    return (
      /^https?:\/\//i.test(value) ||
      /^data:image\/(?:png|jpe?g|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon)[;,]/i.test(value)
    );
  }

  function normalizePageIcon(icon) {
    return String(icon ?? '').trim() || runtime.DEFAULT_PAGE_ICON;
  }

  function normalizeTreeIconSize(value) {
    const size = Number(value);
    return Number.isFinite(size) ? Math.max(12, Math.min(32, Math.round(size))) : 14;
  }

  function pageIconMarkup(icon, fallback = runtime.DEFAULT_PAGE_ICON) {
    const value = String(icon || fallback || '');
    if (runtime.isExternalPageIcon(value))
      return runtime.htmlWithStyles(
        `<img class="external-page-icon" src="${runtime.escapeHtml(value)}" alt="" draggable="false">`,
      );
    const lucideName = value.startsWith('lucide:')
      ? value.slice(7)
      : { '📄': 'file-text', '📁': 'folder', '📂': 'folder-open' }[value] || '';
    if (lucideName) return runtime.iconMarkup(lucideName);
    return runtime.escapeHtml(value);
  }

  function normalizeExternalIconUrl(value) {
    let raw = String(value || '').trim();
    if (!raw) return '';
    if (/^data:image\/(?:png|jpe?g|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon)[;,]/i.test(raw))
      return raw;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = 'https://' + raw;
    try {
      const u = new URL(raw);
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
    } catch {
      return '';
    }
  }

  function makeBlankWorkspace() {
    return {
      name: '',
      gettingStartedInitialized: true,
      theme: runtime.state?.theme || 'system',
      pageFont: 'system',
      treeIconSize: 14,
      spellcheckEnabled: false,
      showCustomPageIcons: false,
      showFilesAndTabIcons: true,
      showBreadcrumbIcons: false,
      folderNotesEnabled: true,
      currentPageId: '__home__',
      activeTabId: null,
      activeEditorGroupId: runtime.MAIN_EDITOR_GROUP,
      editorLayout: { type: 'group', id: runtime.MAIN_EDITOR_GROUP, activeTabId: null },
      openTabs: [],
      sidebarOpen: true,
      rightSidebarOpen: true,
      leftPanelMode: 'files',
      rightPanelMode: 'outline',
      mainView: 'page',
      sidebarWidth: 276,
      rightSidebarWidth: 286,
      shortcuts: { ...runtime.DEFAULT_SHORTCUTS },
      pages: [],
      folders: [],
      activeFolderPath: '',
      editorScrollPositions: {},
    };
  }

  function normalizeWorkspace(parsed) {
    if (!parsed || !Array.isArray(parsed.pages)) parsed = runtime.clone(runtime.DEFAULT_WORKSPACE);
    parsed.pages.forEach((p) => {
      if ('cover' in p) delete p.cover;
      const icon = String(p.icon ?? '').trim();
      if (p.iconIsCustom === true && icon) {
        p.icon = runtime.normalizePageIcon(icon);
      } else if (
        !icon ||
        icon === runtime.DEFAULT_PAGE_ICON ||
        icon === runtime.DEFAULT_FOLDER_ICON ||
        icon === '📄' ||
        icon === '📁'
      ) {
        delete p.icon;
        delete p.iconIsCustom;
      } else {
        p.icon = runtime.normalizePageIcon(icon);
        p.iconIsCustom = true;
      }
      p.blocks = runtime.normalizeBlockTree(p.blocks);
    });
    if (!Array.isArray(parsed.folders)) parsed.folders = [];
    parsed.folders = parsed.folders
      .filter((folder) => folder && typeof folder.path === 'string')
      .map((folder) => ({
        id: folder.id || runtime.folderIdForPath(folder.path),
        path: runtime.normalizeFolderPath(folder.path),
        name: folder.name || folder.path.split('/').at(-1) || '',
        icon: folder.icon || runtime.DEFAULT_FOLDER_ICON,
        expanded: folder.expanded !== false,
        explicit: folder.explicit !== false,
      }));
    if (typeof parsed.activeFolderPath !== 'string') parsed.activeFolderPath = '';
    const savedScrollPositions = parsed.editorScrollPositions;
    parsed.editorScrollPositions = {};
    if (
      savedScrollPositions &&
      typeof savedScrollPositions === 'object' &&
      !Array.isArray(savedScrollPositions)
    )
      for (const [tabId, position] of Object.entries(savedScrollPositions)) {
        const top = Number(position?.top);
        if (tabId && Number.isFinite(top))
          parsed.editorScrollPositions[tabId] = { top: Math.min(10_000_000, Math.max(0, top)) };
      }
    const pageIds = new Set(parsed.pages.map((p) => p.id));
    parsed.editorLayout = runtime.normalizeEditorLayout(parsed.editorLayout);
    const groups = runtime.editorGroups(parsed.editorLayout);
    const groupIds = new Set(groups.map((group) => group.id));
    const fallbackGroup = groups[0].id;
    if (!['page', 'graph', 'attachments'].includes(parsed.mainView)) parsed.mainView = 'page';
    if (!Array.isArray(parsed.openTabs)) parsed.openTabs = [];
    parsed.openTabs = parsed.openTabs
      .map((tab) => {
        if (typeof tab === 'string')
          return pageIds.has(tab)
            ? { id: runtime.uid('tab'), kind: 'page', pageId: tab, groupId: fallbackGroup }
            : null;
        if (!tab || typeof tab !== 'object') return null;
        const groupId = groupIds.has(tab.groupId) ? tab.groupId : fallbackGroup;
        if (tab.kind === 'graph' || tab.view === 'graph')
          return { id: tab.id || runtime.uid('tab'), kind: 'graph', groupId };
        if (tab.kind === 'attachments')
          return { id: tab.id || runtime.uid('tab'), kind: 'attachments', groupId };
        const pageId = tab.pageId || (pageIds.has(tab.id) ? tab.id : null);
        return pageId && pageIds.has(pageId)
          ? {
              id: tab.id && tab.pageId ? tab.id : runtime.uid('tab'),
              kind: 'page',
              pageId,
              groupId,
            }
          : null;
      })
      .filter(Boolean);
    if (parsed.currentPageId !== '__home__' && !pageIds.has(parsed.currentPageId))
      parsed.currentPageId =
        parsed.openTabs.find((t) => t.kind !== 'graph' && t.pageId)?.pageId ||
        parsed.pages[0]?.id ||
        '__home__';
    if (parsed.mainView === 'graph') {
      let active =
        parsed.openTabs.find((t) => t.id === parsed.activeTabId && t.kind === 'graph') ||
        parsed.openTabs.find((t) => t.kind === 'graph');
      if (!active) {
        active = { id: runtime.uid('tab'), kind: 'graph', groupId: fallbackGroup };
        parsed.openTabs.push(active);
      }
      parsed.activeTabId = active.id;
    } else if (parsed.mainView === 'attachments') {
      let active =
        parsed.openTabs.find((t) => t.id === parsed.activeTabId && t.kind === 'attachments') ||
        parsed.openTabs.find((t) => t.kind === 'attachments');
      if (!active) {
        active = { id: runtime.uid('tab'), kind: 'attachments', groupId: fallbackGroup };
        parsed.openTabs.push(active);
      }
      parsed.activeTabId = active.id;
    } else if (parsed.currentPageId !== '__home__') {
      let active =
        parsed.openTabs.find(
          (t) =>
            t.id === parsed.activeTabId && t.kind !== 'graph' && t.pageId === parsed.currentPageId,
        ) || parsed.openTabs.find((t) => t.kind !== 'graph' && t.pageId === parsed.currentPageId);
      if (!active) {
        active = {
          id: runtime.uid('tab'),
          kind: 'page',
          pageId: parsed.currentPageId,
          groupId: fallbackGroup,
        };
        parsed.openTabs.push(active);
      }
      parsed.activeTabId = active.id;
    } else parsed.activeTabId = null;
    const activeTab = parsed.openTabs.find((tab) => tab.id === parsed.activeTabId);
    parsed.activeEditorGroupId =
      activeTab?.groupId ||
      (groupIds.has(parsed.activeEditorGroupId) ? parsed.activeEditorGroupId : fallbackGroup);
    for (const group of groups) {
      const tabs = parsed.openTabs.filter((tab) => tab.groupId === group.id);
      if (!tabs.some((tab) => tab.id === group.activeTabId))
        group.activeTabId = tabs[0]?.id || null;
    }
    if (activeTab)
      runtime.editorGroup(parsed.editorLayout, activeTab.groupId).activeTabId = activeTab.id;
    if (typeof parsed.sidebarOpen !== 'boolean') parsed.sidebarOpen = true;
    if (typeof parsed.rightSidebarOpen !== 'boolean') parsed.rightSidebarOpen = true;
    if (!['files', 'favorites', 'git'].includes(parsed.leftPanelMode))
      parsed.leftPanelMode = 'files';
    if (!['outline', 'backlinks'].includes(parsed.rightPanelMode))
      parsed.rightPanelMode = 'outline';
    if (!Number.isFinite(parsed.sidebarWidth)) parsed.sidebarWidth = 276;
    if (!Number.isFinite(parsed.rightSidebarWidth)) parsed.rightSidebarWidth = 286;
    const legacyIconSizes = [parsed.noteIconSize, parsed.folderIconSize]
      .map(Number)
      .filter(Number.isFinite);
    parsed.treeIconSize = runtime.normalizeTreeIconSize(
      parsed.treeIconSize ??
        (legacyIconSizes.length
          ? legacyIconSizes.reduce((sum, size) => sum + size, 0) / legacyIconSizes.length
          : 14),
    );
    parsed.pageFont = runtime.normalizePageFont(parsed.pageFont);
    parsed.spellcheckEnabled = parsed.spellcheckEnabled === true;
    parsed.showCustomPageIcons = parsed.showCustomPageIcons === true;
    parsed.showFilesAndTabIcons = parsed.showFilesAndTabIcons !== false;
    parsed.showBreadcrumbIcons = parsed.showBreadcrumbIcons === true;
    parsed.folderNotesEnabled = parsed.folderNotesEnabled !== false;
    parsed.pages.forEach((page) => {
      const folder = page.folderId
        ? parsed.folders.find((item) => item.id === page.folderId)
        : null;
      const matchesFolderName =
        !page.parentId &&
        folder &&
        String(page.title || 'Untitled').toLocaleLowerCase() ===
          String(folder.name || '').toLocaleLowerCase();
      if (parsed.folderNotesEnabled) {
        page.folderNote = page.folderNote === true || Boolean(matchesFolderName);
      } else {
        page.folderNote = false;
      }
    });
    delete parsed.noteIconSize;
    delete parsed.folderIconSize;
    parsed.shortcuts = runtime.normalizeWorkspaceShortcuts(parsed.shortcuts);
    return parsed;
  }

  function normalizeEditorLayout(node, seen = new Set()) {
    if (node?.type === 'split' && node.first && node.second) {
      return {
        type: 'split',
        direction: node.direction === 'column' ? 'column' : 'row',
        ratio: Math.max(0.2, Math.min(0.8, Number(node.ratio) || 0.5)),
        first: runtime.normalizeEditorLayout(node.first, seen),
        second: runtime.normalizeEditorLayout(node.second, seen),
      };
    }
    let id = typeof node?.id === 'string' && node.id ? node.id : runtime.MAIN_EDITOR_GROUP;
    if (seen.has(id)) id = runtime.uid('editor_group');
    seen.add(id);
    return { type: 'group', id, activeTabId: node?.activeTabId || null };
  }

  function editorGroups(node, out = []) {
    if (node?.type === 'split') {
      runtime.editorGroups(node.first, out);
      runtime.editorGroups(node.second, out);
    } else if (node?.type === 'group') out.push(node);
    return out;
  }

  function editorGroup(node, id) {
    return runtime.editorGroups(node).find((group) => group.id === id) || null;
  }

  function queueStorageWrite(operation) {
    runtime.storageWriteChain = runtime.storageWriteChain.then(operation, operation);
    return runtime.storageWriteChain;
  }

  function storageProviderLabel() {
    return runtime.localStorageGateway.getDirectoryName?.() || 'Browser storage';
  }

  function workspaceLocationKey() {
    return (
      runtime.workspaceLocations.find((item) => item.active)?.id ||
      (runtime.localStorageGateway.hasDirectory?.() ? 'local-folder' : 'browser')
    );
  }

  function historyKeyForVault(vaultId) {
    return `${runtime.workspaceLocationKey()}:${vaultId}`;
  }

  function renderWorkspaceSelector() {
    const select = runtime.els.workspaceSelect;
    if (!select) return;
    const options = runtime.workspaceLocations.length
      ? runtime.workspaceLocations
      : [{ id: 'browser', name: 'Browser storage', kind: 'browser', active: true }];
    runtime.publish();
    select.value = options.find((item) => item.active)?.id || 'browser';
    runtime.syncWorkspaceLocationActions();

    runtime.publish();
  }

  function syncWorkspaceLocationActions() {
    const button = runtime.els.closeWorkspaceBtn,
      selected = runtime.workspaceLocations.find(
        (item) => item.id === runtime.els.workspaceSelect?.value,
      );
    if (button) {
      const disabled =
        !selected ||
        runtime.workspaceLocationSwitching ||
        runtime.workspaceLocationClosing ||
        runtime.browserWorkspaceCopying;
      button.disabled = disabled;
      button.title =
        selected?.kind === 'browser' ? 'Clear Browser workspace' : 'Close selected workspace';
      button.setAttribute(
        'aria-label',
        selected?.kind === 'browser'
          ? 'Clear Browser workspace'
          : `Close ${selected?.name || 'selected workspace'}`,
      );
    }
    const copyButton = runtime.els.saveBrowserWorkspaceBtn,
      browserActive = runtime.workspaceLocations.find((item) => item.active)?.id === 'browser';
    copyButton?.classList.toggle('hidden', !browserActive);
    if (copyButton)
      copyButton.disabled =
        !browserActive ||
        runtime.workspaceAccess !== 'writable' ||
        runtime.workspaceLocationSwitching ||
        runtime.workspaceLocationClosing ||
        runtime.browserWorkspaceCopying;
  }

  async function refreshWorkspaceSelector() {
    runtime.workspaceLocations = await runtime.localStorageGateway.listWorkspaceLocations();
    if (
      runtime.localStorageGateway.hasDirectory?.() &&
      !runtime.workspaceLocations.some((item) => item.active)
    ) {
      await runtime.localStorageGateway.registerCurrentDirectoryWorkspace();
      runtime.workspaceLocations = await runtime.localStorageGateway.listWorkspaceLocations();
    }
    runtime.renderWorkspaceSelector();
  }

  function syncWorkspaceEditorAccess() {
    document
      .querySelectorAll(
        '[contenteditable="true"],[contenteditable="plaintext-only"],[data-workspace-editable]',
      )
      .forEach((element) => {
        if (runtime.workspaceAccess === 'writable') {
          if (element.hasAttribute('data-workspace-editable')) {
            element.setAttribute(
              'contenteditable',
              element.getAttribute('data-workspace-editable'),
            );
            element.removeAttribute('data-workspace-editable');
          }
        } else {
          if (!element.hasAttribute('data-workspace-editable')) {
            element.setAttribute(
              'data-workspace-editable',
              element.getAttribute('contenteditable'),
            );
          }
          element.setAttribute('contenteditable', 'false');
        }
      });
    runtime.syncSpellcheckElements(document);
  }

  function syncSpellcheckElements(root) {
    const spellcheck = String(runtime.state.spellcheckEnabled !== false);
    if (root?.matches?.('[contenteditable="true"],[contenteditable="plaintext-only"]'))
      root.setAttribute('spellcheck', spellcheck);
    root
      ?.querySelectorAll?.('[contenteditable="true"],[contenteditable="plaintext-only"]')
      .forEach((element) => element.setAttribute('spellcheck', spellcheck));
  }

  function setWorkspaceAccess(mode) {
    runtime.workspaceAccess = mode;
    document.body.classList.toggle('workspace-read-only', mode !== 'writable');
    document.body.classList.toggle('workspace-access-blocked', mode === 'blocked');
    runtime.syncWorkspaceEditorAccess();
    if (runtime.els.workspaceAccessNotice) {
      runtime.els.workspaceAccessNotice.classList.toggle('hidden', mode !== 'blocked');
      runtime.els.workspaceAccessNotice.setAttribute('aria-hidden', String(mode !== 'blocked'));
    }
    runtime.els.workspaceWritePermissionBtn?.classList.toggle('hidden', mode !== 'readonly');
    if (runtime.els.workspaceAccessMessage) {
      runtime.els.workspaceAccessMessage.textContent =
        mode === 'blocked'
          ? 'Cannot confirm that the local copy is synchronized. Select this workspace again and grant read and write access to continue.'
          : '';
    }
    runtime
      .$('workspaceDisconnectCloseBtn')
      ?.classList.toggle('hidden', !runtime.localStorageGateway.hasDirectory?.());
    runtime.syncWorkspaceLocationActions();

    runtime.publish();
  }

  function accessModeForPermission(permission) {
    if (!runtime.localStorageGateway.hasDirectory?.() || permission === 'none') return 'writable';
    if (permission === 'readwrite') return 'writable';
    if (permission === 'read') return 'readonly';
    return 'blocked';
  }

  async function applyWorkspacePermission(permission, { reload = true } = {}) {
    if (runtime.gitOperationActive) return;
    const next = runtime.accessModeForPermission(permission),
      previous = runtime.workspaceAccess;
    if (next === previous) {
      if (next === 'readonly' && reload && runtime.activeVaultId) {
        try {
          const previousSynced =
            runtime.lastSyncedWorkspace && runtime.clone(runtime.lastSyncedWorkspace);
          runtime.lifecycle.clearTimeout(runtime.saveTimer);
          runtime.saveTimer = null;
          const latest = await runtime.loadState(runtime.activeVaultId);
          if (!runtime.sameWorkspaceContent(latest, previousSynced)) {
            runtime.state = latest;
            runtime.lastSyncedWorkspace = runtime.clone(latest);
            runtime.initializeHistoryForVault(runtime.activeVaultId, { reset: true });
            runtime.renderAll();
          }
        } catch (error) {
          console.error('Could not verify the read-only workspace cache.', error);
          runtime.setWorkspaceAccess('blocked');
          if (runtime.els.workspaceAccessMessage)
            runtime.els.workspaceAccessMessage.textContent =
              'Could not confirm that the cache matches the local files. Select the workspace and grant access again.';
        }
      }
      return;
    }
    if (next === 'blocked') {
      runtime.lifecycle.clearTimeout(runtime.saveTimer);
      runtime.saveTimer = null;
      runtime.setWorkspaceAccess('blocked');
      if (runtime.els.workspaceAccessMessage)
        runtime.els.workspaceAccessMessage.textContent =
          'Workspace access was lost. The cache remains locked until it can be verified against local files. Select the workspace and grant read and write access.';
      return;
    }
    if (
      reload &&
      runtime.activeVaultId &&
      (previous === 'writable' || previous === 'readonly' || previous === 'blocked')
    ) {
      runtime.lifecycle.clearTimeout(runtime.saveTimer);
      runtime.saveTimer = null;
      runtime.setWorkspaceAccess('checking');
      try {
        if (
          previous === 'blocked' ||
          (previous === 'readonly' &&
            next === 'writable' &&
            runtime.localStorageGateway.hasDirectory?.())
        ) {
          runtime.vaultRegistry = await runtime.loadVaultRegistry();
          runtime.activeVaultId = runtime.vaultRegistry.activeVaultId;
        }
        runtime.state = await runtime.loadState(runtime.activeVaultId);
        runtime.lastSyncedWorkspace = runtime.clone(runtime.state);
        runtime.initializeHistoryForVault(runtime.activeVaultId, { reset: true });
        runtime.setWorkspaceAccess(next);
        runtime.renderAll();
        if (next === 'readonly')
          runtime.toast(
            'Workspace synchronized with read-only access. Click “Grant write access” to request permission and edit.',
          );
      } catch (error) {
        console.error('Could not synchronize the workspace after a permission change.', error);
        runtime.setWorkspaceAccess('blocked');
        if (runtime.els.workspaceAccessMessage)
          runtime.els.workspaceAccessMessage.textContent =
            'Could not verify synchronization with local files. Select the workspace and grant read and write access to continue.';
      }
      return;
    }
    runtime.setWorkspaceAccess(next);
  }

  async function checkWorkspacePermission({ reload = true } = {}) {
    if (runtime.workspacePermissionCheck) return runtime.workspacePermissionCheck;
    runtime.workspacePermissionCheck = (async () => {
      const permission = (await runtime.localStorageGateway.getDirectoryPermission?.()) || 'none';
      await runtime.applyWorkspacePermission(permission, { reload });
    })().finally(() => {
      runtime.workspacePermissionCheck = null;
    });
    return runtime.workspacePermissionCheck;
  }

  function restoreSynchronizedWorkspace(
    message = 'This workspace is read-only. Grant write access to edit.',
  ) {
    if (runtime.lastSyncedWorkspace) {
      const current = runtime.state,
        restored = runtime.normalizeWorkspace(runtime.clone(runtime.lastSyncedWorkspace));
      for (const key of [
        'currentPageId',
        'activeTabId',
        'activeEditorGroupId',
        'editorLayout',
        'openTabs',
        'mainView',
        'sidebarOpen',
        'rightSidebarOpen',
        'leftPanelMode',
        'rightPanelMode',
        'sidebarWidth',
        'rightSidebarWidth',
        'activeFolderPath',
        'editorScrollPositions',
      ]) {
        if (key in current) restored[key] = runtime.clone(current[key]);
      }
      const pageIds = new Set(restored.pages.map((page) => page.id));
      restored.openTabs = (restored.openTabs || []).filter(
        (tab) => tab.kind === 'graph' || tab.kind === 'attachments' || pageIds.has(tab.pageId),
      );
      const currentPages = new Map((current.pages || []).map((page) => [page.id, page]));
      for (const page of restored.pages) {
        if (typeof currentPages.get(page.id)?.expanded === 'boolean')
          page.expanded = currentPages.get(page.id).expanded;
      }
      const currentFolders = new Map((current.folders || []).map((folder) => [folder.id, folder]));
      for (const folder of restored.folders || []) {
        if (typeof currentFolders.get(folder.id)?.expanded === 'boolean')
          folder.expanded = currentFolders.get(folder.id).expanded;
      }
      runtime.state = restored;
      runtime.repairEditorGroups();
      runtime.renderAll();
    }
    if (Date.now() - runtime.lastReadOnlyNoticeAt > 1800) {
      runtime.toast(message);
      runtime.lastReadOnlyNoticeAt = Date.now();
    }
  }

  function sameWorkspaceContent(a, b) {
    try {
      const project = (snapshot) => {
        const value = runtime.clone(snapshot || {});
        for (const key of [
          'currentPageId',
          'activeTabId',
          'activeEditorGroupId',
          'editorLayout',
          'openTabs',
          'mainView',
          'sidebarOpen',
          'rightSidebarOpen',
          'leftPanelMode',
          'rightPanelMode',
          'sidebarWidth',
          'rightSidebarWidth',
          'activeFolderPath',
          'editorScrollPositions',
          'markdownFilesInitialized',
        ])
          delete value[key];
        for (const page of value.pages || []) {
          delete page.expanded;
          delete page.filePath;
        }
        for (const folder of value.folders || []) delete folder.expanded;
        return value;
      };
      return JSON.stringify(project(a)) === JSON.stringify(project(b));
    } catch {
      return false;
    }
  }

  function sanitizeVaultRegistry(saved) {
    if (!saved?.vaults?.length) return null;
    const vaults = saved.vaults
      .filter((v) => v?.id && v?.name)
      .map((v) => ({ id: String(v.id), name: String(v.name) }));
    if (!vaults.length) return null;
    const activeVaultId = vaults.some((v) => v.id === saved.activeVaultId)
      ? String(saved.activeVaultId)
      : vaults[0].id;
    return {
      workspaceId:
        typeof saved.workspaceId === 'string' && saved.workspaceId ? saved.workspaceId : null,
      activeVaultId,
      vaults,
    };
  }

  async function loadVaultRegistry() {
    const saved = await runtime.storageGateway.loadRegistry();
    const existing = runtime.sanitizeVaultRegistry(saved);
    if (existing) {
      if (!existing.workspaceId) {
        existing.workspaceId = runtime.uid('workspace');
        if (
          !runtime.localStorageGateway.hasDirectory?.() ||
          (await runtime.localStorageGateway.getDirectoryPermission?.()) === 'readwrite'
        ) {
          await runtime.storageGateway.saveRegistry(existing);
        }
      }
      return existing;
    }

    if (runtime.localStorageGateway.hasDirectory?.()) {
      const permission = await runtime.localStorageGateway.getDirectoryPermission?.();
      if (permission === 'read') {
        const id = runtime.uid('vault');
        return { workspaceId: null, activeVaultId: id, vaults: [{ id, name: 'Local workspace' }] };
      }
      if (permission !== 'readwrite')
        throw new Error(
          'This folder has no workspace configuration. Grant write access to initialize it, or choose another workspace.',
        );
    }

    const id = runtime.uid('vault');
    const name =
      (runtime.DEFAULT_WORKSPACE.name || DEFAULT_VAULT_NAME).trim() || DEFAULT_VAULT_NAME;
    const registry = {
      workspaceId: runtime.uid('workspace'),
      activeVaultId: id,
      vaults: [{ id, name }],
    };
    const workspace = runtime.normalizeWorkspace(
      runtime.clone(
        runtime.localStorageGateway.hasDirectory?.()
          ? runtime.DEFAULT_WORKSPACE
          : runtime.DEFAULT_BROWSER_WORKSPACE,
      ),
    );
    workspace.name = name;
    await runtime.storageGateway.saveRegistry(runtime.clone(registry));
    await runtime.storageGateway.saveWorkspace(id, workspace);
    return registry;
  }

  function saveVaultRegistry() {
    const snapshot = runtime.clone(runtime.vaultRegistry);
    return runtime
      .queueStorageWrite(async () => {
        await runtime.storageGateway.saveRegistry(snapshot);
      })
      .catch((error) => {
        console.error(`Could not save vault registry to ${runtime.storageProviderLabel()}`, error);
        runtime.toast(`Could not save vault information to ${runtime.storageProviderLabel()}.`);
      });
  }

  function activeVaultMeta() {
    return (
      runtime.vaultRegistry.vaults.find((v) => v.id === runtime.activeVaultId) ||
      runtime.vaultRegistry.vaults[0]
    );
  }

  async function chooseMarkdownDirectory() {
    if (runtime.gitOperationActive) return;
    let directorySelected = false;
    try {
      if (
        !runtime.localStorageGateway.pickDirectory ||
        !runtime.localStorageGateway.activatePickedDirectory
      )
        throw new Error('Folder access is not available in this browser.');
      const previousName =
        runtime.activeVaultMeta()?.name || runtime.state.name || DEFAULT_VAULT_NAME;
      await runtime.localStorageGateway.pickDirectory();
      if (runtime.workspaceAccess === 'writable') {
        runtime.flushHistoryPending(runtime.activeVaultId);
        if (!(await runtime.persistStateNow()))
          throw new Error('Could not save the current workspace before switching.');
        await runtime.saveVaultRegistry();
      }
      await runtime.localStorageGateway.activatePickedDirectory();
      directorySelected = true;
      runtime.invalidateAttachmentList();
      runtime.setWorkspaceAccess('checking');
      runtime.clearAttachmentObjectUrls();
      const directoryRegistry = runtime.sanitizeVaultRegistry(
        await runtime.storageGateway.loadRegistry(),
      );
      const disk = await runtime.localStorageGateway.readMarkdownFiles();
      if (directoryRegistry) {
        if (!directoryRegistry.workspaceId)
          directoryRegistry.workspaceId = runtime.uid('workspace');
        runtime.vaultRegistry = directoryRegistry;
        runtime.activeVaultId = directoryRegistry.activeVaultId;
        await runtime.storageGateway.saveRegistry(runtime.vaultRegistry);
        runtime.state = await runtime.loadState(runtime.activeVaultId);
      } else {
        const id = runtime.uid('vault');
        const name = runtime.localStorageGateway.getDirectoryName?.() || previousName;
        runtime.vaultRegistry = {
          workspaceId: runtime.uid('workspace'),
          activeVaultId: id,
          vaults: [{ id, name }],
        };
        runtime.activeVaultId = id;
        if (disk.files.length) {
          runtime.state = runtime.normalizeWorkspace(
            runtime.workspaceFromMarkdown(
              runtime.clone(runtime.DEFAULT_WORKSPACE),
              disk.files,
              disk.directories,
            ),
          );
          runtime.state.name = name;
        } else {
          runtime.state = runtime.normalizeWorkspace(runtime.makeBlankWorkspace());
          runtime.state.name = name;
          runtime.mergeMarkdownDirectories(runtime.state, disk.directories);
        }
        await runtime.storageGateway.saveRegistry(runtime.vaultRegistry);
      }
      runtime.lastSyncedWorkspace = runtime.clone(runtime.state);
      runtime.confirmedPageDeletions.clear();
      runtime.setWorkspaceAccess('writable');
      for (const folder of runtime.state.folders || [])
        if (folder.path) await runtime.localStorageGateway.createFolder?.(folder.path);
      if (!(await runtime.persistStateNow()))
        throw new Error(
          'Could not synchronize the selected workspace. Grant access again and retry.',
        );
      await runtime.localStorageGateway.registerCurrentDirectoryWorkspace();
      await runtime.refreshWorkspaceSelector();
      runtime.initializeHistoryForVault(runtime.activeVaultId, { reset: true });
      runtime.applyTheme();
      runtime.renderAll();
      runtime.toast(
        `Workspace: ${runtime.localStorageGateway.getDirectoryName?.() || 'Selected folder'}`,
      );
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('Could not open the selected notes folder.', error);
      if (directorySelected) {
        try {
          await runtime.localStorageGateway.registerCurrentDirectoryWorkspace();
          await runtime.refreshWorkspaceSelector();
        } catch {}
        runtime.setWorkspaceAccess('blocked');
        if (runtime.els.workspaceAccessMessage)
          runtime.els.workspaceAccessMessage.textContent =
            'Could not identify or synchronize the selected workspace. Select the correct folder again and grant read and write access.';
      }
      runtime.toast(error?.message || 'Could not open that folder.');
    }
  }

  async function restoreBrowserStorageWorkspace() {
    await runtime.localStorageGateway.activateWorkspaceLocation('browser');
    runtime.invalidateAttachmentList();
    runtime.clearAttachmentObjectUrls();
    await runtime.refreshWorkspaceSelector();
    runtime.vaultRegistry = await runtime.loadVaultRegistry();
    runtime.activeVaultId = runtime.vaultRegistry.activeVaultId;
    runtime.state = await runtime.loadState(runtime.activeVaultId);
    runtime.lastSyncedWorkspace = runtime.clone(runtime.state);
    runtime.initializeHistoryForVault(runtime.activeVaultId, { reset: true });
    runtime.setWorkspaceAccess('writable');
    runtime.applyTheme();
    runtime.renderAll();
  }

  async function saveBrowserWorkspaceLocally() {
    if (
      runtime.browserWorkspaceCopying ||
      runtime.workspaceLocationSwitching ||
      runtime.workspaceLocationClosing
    )
      return;
    if (
      runtime.localStorageGateway.hasDirectory?.() ||
      runtime.workspaceLocations.find((item) => item.active)?.id !== 'browser'
    )
      return;
    if (runtime.workspaceAccess !== 'writable') {
      runtime.toast('Wait until Browser storage is ready before saving it locally.');
      return;
    }
    let destinationActivated = false;
    runtime.browserWorkspaceCopying = true;
    runtime.syncWorkspaceLocationActions();
    try {
      if (
        !runtime.localStorageGateway.pickDirectory ||
        !runtime.localStorageGateway.activatePickedDirectory
      )
        throw new Error('Local folders are not available in this browser.');
      runtime.flushHistoryPending(runtime.activeVaultId);
      if (!(await runtime.persistStateNow()))
        throw new Error('Could not save Browser storage before copying it.');
      const sourceWorkspace = runtime.clone(runtime.state),
        sourceVault = runtime.clone(runtime.activeVaultMeta());
      const sourceAttachments = [];
      for (const item of await runtime.localStorageGateway.listAttachments()) {
        const blob = await runtime.localStorageGateway.readAttachment(item.path);
        if (!blob) throw new Error(`Could not read attachment ${item.name} from Browser storage.`);
        sourceAttachments.push({ path: item.path, blob });
      }

      await runtime.localStorageGateway.pickDirectory();
      await runtime.localStorageGateway.activatePickedDirectory();
      destinationActivated = true;
      runtime.setWorkspaceAccess('checking');
      runtime.invalidateAttachmentList();
      runtime.clearAttachmentObjectUrls();
      const destinationRegistry = await runtime.storageGateway.loadRegistry();
      const disk = await runtime.localStorageGateway.readMarkdownFiles();
      const destinationAttachments = await runtime.localStorageGateway.listAttachments();
      if (
        destinationRegistry != null ||
        disk.files.length ||
        disk.directories.length ||
        destinationAttachments.length
      ) {
        throw new Error('Choose an empty local folder to save a copy of Browser storage.');
      }

      const vaultId = runtime.uid('vault'),
        vaultName = sourceVault?.name || sourceWorkspace.name || 'Local workspace';
      const registry = {
        workspaceId: runtime.uid('workspace'),
        activeVaultId: vaultId,
        vaults: [{ id: vaultId, name: vaultName }],
      };
      const localWorkspace = runtime.normalizeWorkspace(sourceWorkspace);
      localWorkspace.name = vaultName;
      const markdownFiles = runtime.serializeMarkdownWorkspace(localWorkspace);
      localWorkspace.markdownFilesInitialized = true;

      runtime.toast('Copying Browser storage to the selected folder…');
      for (const folder of localWorkspace.folders || [])
        if (folder.path) await runtime.localStorageGateway.createFolder?.(folder.path);
      for (const item of sourceAttachments)
        await runtime.localStorageGateway.writeAttachment(item.path, item.blob);
      if (markdownFiles.length && runtime.localStorageGateway.writeMarkdownFiles)
        await runtime.localStorageGateway.writeMarkdownFiles(markdownFiles);
      await runtime.storageGateway.saveWorkspace(vaultId, localWorkspace);
      await runtime.storageGateway.saveRegistry(registry);

      runtime.vaultRegistry = registry;
      runtime.activeVaultId = vaultId;
      runtime.state = localWorkspace;
      runtime.lastSyncedWorkspace = runtime.clone(runtime.state);
      await runtime.localStorageGateway.registerCurrentDirectoryWorkspace();
      await runtime.refreshWorkspaceSelector();
      runtime.initializeHistoryForVault(runtime.activeVaultId, { reset: true });
      runtime.setWorkspaceAccess('writable');
      runtime.applyTheme();
      runtime.renderAll();
      runtime.toast('Local copy saved and syncing. Browser storage remains available.');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('Could not save Browser storage to a local folder.', error);
      if (destinationActivated) {
        try {
          await runtime.restoreBrowserStorageWorkspace();
        } catch (restoreError) {
          console.error(
            'Could not return to Browser storage after the local copy failed.',
            restoreError,
          );
          runtime.setWorkspaceAccess('blocked');
          runtime.renderAll();
        }
      }
      runtime.toast(error?.message || 'Could not save Browser storage locally.');
    } finally {
      runtime.browserWorkspaceCopying = false;
      runtime.syncWorkspaceLocationActions();
    }
  }

  async function switchWorkspaceLocation(id) {
    if (
      runtime.gitOperationActive ||
      runtime.workspaceLocationSwitching ||
      runtime.workspaceLocationClosing ||
      runtime.browserWorkspaceCopying
    )
      return false;
    const destination = runtime.workspaceLocations.find((item) => item.id === id);
    if (!destination) return false;
    if (destination.active) return true;
    runtime.workspaceLocationSwitching = true;
    runtime.syncWorkspaceLocationActions();
    const previousAccess = runtime.workspaceAccess;
    let activated = false;
    try {
      const permission = await runtime.localStorageGateway.requestWorkspaceLocationAccess(id);
      runtime.cancelPageOperations();
      runtime.flushHistoryPending(runtime.activeVaultId);
      if (previousAccess === 'writable' && !(await runtime.persistStateNow()))
        throw new Error('Could not save the current workspace before switching.');
      if (previousAccess === 'writable') await runtime.saveVaultRegistry();
      runtime.setWorkspaceAccess('checking');
      await runtime.localStorageGateway.activateWorkspaceLocation(id, permission);
      activated = true;
      await runtime.refreshWorkspaceSelector();
      runtime.invalidateAttachmentList();
      runtime.clearAttachmentObjectUrls();
      runtime.vaultRegistry = { workspaceId: null, activeVaultId: null, vaults: [] };
      runtime.activeVaultId = null;
      runtime.state = runtime.makeBlankWorkspace();
      runtime.vaultRegistry = await runtime.loadVaultRegistry();
      runtime.activeVaultId = runtime.vaultRegistry.activeVaultId;
      runtime.state = await runtime.loadState(runtime.activeVaultId);
      if (typeof runtime.state.sidebarOpen !== 'boolean') runtime.state.sidebarOpen = true;
      if (typeof runtime.state.rightSidebarOpen !== 'boolean')
        runtime.state.rightSidebarOpen = true;
      if (!['files', 'favorites', 'git'].includes(runtime.state.leftPanelMode))
        runtime.state.leftPanelMode = 'files';
      if (!['outline', 'backlinks'].includes(runtime.state.rightPanelMode))
        runtime.state.rightPanelMode = 'outline';
      if (!['page', 'graph', 'attachments'].includes(runtime.state.mainView))
        runtime.state.mainView = 'page';
      if (!Number.isFinite(runtime.state.sidebarWidth)) runtime.state.sidebarWidth = 276;
      if (!Number.isFinite(runtime.state.rightSidebarWidth)) runtime.state.rightSidebarWidth = 286;
      runtime.initializeHistoryForVault(runtime.activeVaultId, { reset: true });
      runtime.lastSyncedWorkspace = runtime.clone(runtime.state);
      // Enable editing only after the destination has finished hydrating.
      runtime.setWorkspaceAccess(runtime.accessModeForPermission(permission));
      if (permission === 'readwrite' && (await runtime.externalizeEmbeddedImages(runtime.state)))
        await runtime.persistStateNow();
      runtime.applyTheme();
      runtime.renderAll();
      await runtime.refreshWorkspaceSelector();
      runtime.toast(`Workspace: ${destination.name}`);
      return true;
    } catch (error) {
      if (activated) {
        runtime.setWorkspaceAccess('blocked');
        runtime.renderAll();
      } else runtime.setWorkspaceAccess(previousAccess);
      try {
        await runtime.refreshWorkspaceSelector();
      } catch {
        runtime.renderWorkspaceSelector();
      }
      runtime.toast(error?.message || 'Could not switch workspace.');
      return false;
    } finally {
      runtime.workspaceLocationSwitching = false;
      runtime.syncWorkspaceLocationActions();
    }
  }

  function closeWorkspaceCloseDialog() {
    runtime.pendingWorkspaceCloseId = null;
    runtime.els.workspaceCloseDialog?.classList.add('hidden');
    runtime.els.workspaceAccessNotice?.classList.toggle(
      'hidden',
      runtime.workspaceAccess !== 'blocked',
    );
  }

  function requestCloseSelectedWorkspace() {
    if (
      runtime.workspaceLocationClosing ||
      runtime.workspaceLocationSwitching ||
      runtime.browserWorkspaceCopying
    )
      return;
    const id =
      runtime.workspaceAccess === 'blocked'
        ? runtime.workspaceLocations.find((item) => item.active)?.id
        : runtime.els.workspaceSelect?.value;
    const location = runtime.workspaceLocations.find((item) => item.id === id);
    if (!location) return;
    runtime.pendingWorkspaceCloseId = location.id;
    const browser = location.kind === 'browser';
    const web = location.kind === 'web';
    runtime.els.workspaceCloseTitle.textContent = web
      ? 'Delete web workspace?'
      : browser
        ? 'Clear Browser storage?'
        : 'Close workspace?';
    runtime.els.workspaceCloseMessage.textContent = web
      ? `This permanently deletes “${location.name}” from this browser, including changes and commits that have not been pushed. The GitHub repository is unchanged.`
      : browser
        ? 'This permanently deletes all notes, workspace settings, and attachments saved in Browser storage. A new empty workspace will be created. Local folders stay unchanged.'
        : location.active
          ? `This closes “${location.name}” and removes it from the workspace list. Its files will remain in the folder.`
          : `This removes “${location.name}” from the workspace list. Its files will remain in the folder.`;
    runtime.els.workspaceCloseConfirm.textContent = web
      ? 'Delete web workspace'
      : browser
        ? 'Clear workspace'
        : 'Close workspace';
    runtime.els.workspaceCloseConfirm.classList.toggle('destructive', browser || web);
    runtime.els.workspaceAccessNotice?.classList.add('hidden');
    runtime.els.workspaceCloseDialog?.classList.remove('hidden');
    runtime.lifecycle.frame(() => runtime.els.workspaceCloseConfirm?.focus());
  }

  async function clearBrowserStorageWorkspace() {
    runtime.lifecycle.clearTimeout(runtime.saveTimer);
    runtime.saveTimer = null;
    runtime.lifecycle.clearTimeout(runtime.historyTimer);
    runtime.historyTimer = null;
    runtime.cancelPageOperations();
    await runtime.storageWriteChain.catch(() => {});
    for (const key of runtime.historyByVault.keys())
      if (key.startsWith('browser:')) runtime.historyByVault.delete(key);
    for (const key of runtime.navigationHistoryByVault.keys())
      if (key.startsWith('browser:')) runtime.navigationHistoryByVault.delete(key);
    await runtime.localStorageGateway.clearBrowserWorkspace();

    runtime.invalidateAttachmentList();
    runtime.clearAttachmentObjectUrls();
    const id = runtime.uid('vault'),
      name = 'Browser storage';
    runtime.vaultRegistry = {
      workspaceId: runtime.uid('workspace'),
      activeVaultId: id,
      vaults: [{ id, name }],
    };
    runtime.activeVaultId = id;
    runtime.state = runtime.normalizeWorkspace(runtime.clone(runtime.DEFAULT_BROWSER_WORKSPACE));
    runtime.state.name = name;
    await runtime.storageGateway.saveRegistry(runtime.clone(runtime.vaultRegistry));
    await runtime.storageGateway.saveWorkspace(id, runtime.clone(runtime.state));
    runtime.lastSyncedWorkspace = runtime.clone(runtime.state);
    runtime.initializeHistoryForVault(runtime.activeVaultId, { reset: true });
    runtime.setWorkspaceAccess('writable');
    runtime.applyTheme();
    runtime.renderAll();
    await runtime.refreshWorkspaceSelector();
  }

  async function confirmCloseSelectedWorkspace() {
    if (runtime.workspaceLocationClosing || runtime.workspaceLocationSwitching) return;
    if (runtime.gitOperationActive) {
      runtime.toast('Wait for the Git operation to finish before closing this workspace.');
      return;
    }
    const id = runtime.pendingWorkspaceCloseId,
      location = runtime.workspaceLocations.find((item) => item.id === id);
    if (!location) {
      runtime.closeWorkspaceCloseDialog();
      return;
    }
    runtime.workspaceLocationClosing = true;
    if (runtime.els.workspaceCloseConfirm) runtime.els.workspaceCloseConfirm.disabled = true;
    if (runtime.els.workspaceCloseCancel) runtime.els.workspaceCloseCancel.disabled = true;
    runtime.syncWorkspaceLocationActions();
    try {
      if (location.kind === 'browser') {
        await runtime.clearBrowserStorageWorkspace();
        runtime.toast('Browser storage cleared. A new empty workspace is ready.');
      } else {
        if (location.active) {
          await runtime.workspacePermissionCheck;
          runtime.cancelPageOperations();
          runtime.flushHistoryPending(runtime.activeVaultId);
          if (runtime.workspaceAccess === 'writable') {
            if (!(await runtime.persistStateNow()))
              throw new Error('Could not save the workspace before closing it.');
            await runtime.saveVaultRegistry();
          }
          runtime.lifecycle.clearTimeout(runtime.saveTimer);
          runtime.saveTimer = null;
          await runtime.storageWriteChain.catch(() => {});
          // Activate Browser storage directly, even if the disconnected workspace
          // could not hydrate or the selector still contains stale active flags.
          runtime.setWorkspaceAccess('checking');
          await runtime.restoreBrowserStorageWorkspace();
          const latestLocations = await runtime.localStorageGateway.listWorkspaceLocations();
          if (latestLocations.find((item) => item.id === id)?.active)
            throw new Error('Could not activate Browser storage before closing the workspace.');
        }
        await runtime.localStorageGateway.removeWorkspaceLocation(id);
        await runtime.refreshWorkspaceSelector();
        runtime.toast(
          location.kind === 'web'
            ? 'Web workspace deleted from this browser.'
            : location.active
              ? 'Workspace closed and removed from the list. Its files remain in the folder.'
              : 'Workspace removed from the list. Its files remain in the folder.',
        );
      }
    } catch (error) {
      if (runtime.workspaceAccess === 'checking') runtime.setWorkspaceAccess('blocked');
      console.error('Could not close the selected workspace.', error);
      runtime.toast(error?.message || 'Could not close this workspace.');
    } finally {
      runtime.workspaceLocationClosing = false;
      if (runtime.els.workspaceCloseConfirm) runtime.els.workspaceCloseConfirm.disabled = false;
      if (runtime.els.workspaceCloseCancel) runtime.els.workspaceCloseCancel.disabled = false;
      runtime.closeWorkspaceCloseDialog();
      runtime.renderWorkspaceSelector();
    }
  }

  async function requestWorkspaceWriteAccess() {
    if (
      !runtime.localStorageGateway.hasDirectory?.() ||
      !runtime.localStorageGateway.requestDirectoryWritePermission
    ) {
      await runtime.chooseMarkdownDirectory();
      return;
    }
    try {
      const permission = await runtime.localStorageGateway.requestDirectoryWritePermission();
      if (permission === 'readwrite') {
        await runtime.applyWorkspacePermission(permission, { reload: true });
        if (runtime.workspaceAccess === 'writable')
          runtime.toast('Write access granted. Workspace synchronized.');
        return;
      }
      await runtime.applyWorkspacePermission(permission, { reload: false });
      if (permission === 'read')
        runtime.toast(
          'The browser kept the workspace read-only. Grant write access or use the folder button to select another folder.',
        );
      else runtime.toast('Could not restore access. Select the folder again and grant access.');
    } catch (error) {
      console.error('Could not request write access to the selected workspace.', error);
      runtime.toast(error?.message || 'Could not request write access.');
    }
  }

  async function refreshMarkdownWorkspace() {
    if (runtime.gitOperationActive) return;
    if (!runtime.localStorageGateway.hasDirectory?.()) {
      await runtime.chooseMarkdownDirectory();
      return;
    }
    try {
      if (runtime.saveTimer && !(await runtime.persistStateNow()))
        throw new Error('Could not save pending changes before refreshing the workspace.');
      await runtime.storageWriteChain;
      runtime.setWorkspaceAccess('checking');
      const loaded = await runtime.loadState(runtime.activeVaultId);
      if (runtime.lifecycle.disposed) return;
      runtime.state = loaded;
      const permission = await runtime.localStorageGateway.getDirectoryPermission?.();
      runtime.setWorkspaceAccess(runtime.accessModeForPermission(permission));
      if (
        runtime.workspaceAccess === 'writable' &&
        (await runtime.externalizeEmbeddedImages(runtime.state))
      )
        await runtime.persistStateNow();
      runtime.clearAttachmentObjectUrls();
      runtime.invalidateAttachmentList();
      runtime.initializeHistoryForVault(runtime.activeVaultId, { reset: true });
      runtime.applyTheme();
      runtime.renderAll();
      runtime.toast('Notes refreshed from folder');
    } catch (error) {
      if (runtime.lifecycle.disposed) return;
      runtime.setWorkspaceAccess('blocked');
      console.error('Could not refresh Markdown notes.', error);
      runtime.toast(error?.message || 'Could not refresh notes.');
    }
  }

  function folderNoteInFolder(path) {
    const normalized = runtime.normalizeFolderPath(path),
      folder = runtime.folderByPath(normalized);
    if (!folder) return null;
    const key = folder.name.toLocaleLowerCase();
    return (
      runtime.state.pages.find(
        (page) =>
          !page.parentId &&
          runtime.folderPathForId(page.folderId).toLocaleLowerCase() ===
            normalized.toLocaleLowerCase() &&
          (page.folderNote === true ||
            String(page.title || 'Untitled').toLocaleLowerCase() === key),
      ) || null
    );
  }

  function pagesInFolder(path) {
    const normalized = runtime.normalizeFolderPath(path);
    // A folder note keeps its identity while its title differs from the folder during editing.
    return runtime.state.pages.filter(
      (page) =>
        !page.parentId &&
        runtime.pageFolderPath(page) === normalized &&
        !(runtime.state.folderNotesEnabled && runtime.representedFolderForPage(page)),
    );
  }

  function folderNoteFolderForPage(page) {
    if (!runtime.state.folderNotesEnabled) return null;
    return runtime.representedFolderForPage(page);
  }

  function representedFolderForPage(page) {
    if (!page || page.parentId || !page.folderId) return null;
    const folder = runtime.folderById(page.folderId);
    if (!folder) return null;
    const matchesName =
      String(page.title || 'Untitled').toLocaleLowerCase() ===
      String(folder.name || '').toLocaleLowerCase();
    return page.folderNote === true || matchesName ? folder : null;
  }

  function defaultIconForPage(page) {
    if (page && runtime.state.pages.some((item) => item.parentId === page.id))
      return runtime.DEFAULT_FOLDER_ICON;
    if (!runtime.state.folderNotesEnabled) return runtime.DEFAULT_PAGE_ICON;
    const folder =
      page && !page.parentId && page.folderId ? runtime.folderById(page.folderId) : null;
    const matchesName =
      folder &&
      String(page.title || 'Untitled').toLocaleLowerCase() ===
        String(folder.name || '').toLocaleLowerCase();
    return matchesName ? runtime.DEFAULT_FOLDER_ICON : runtime.DEFAULT_PAGE_ICON;
  }

  function pageIconFor(page) {
    const icon = String(page?.icon ?? '').trim();
    return runtime.state.showCustomPageIcons !== false && page?.iconIsCustom === true && icon
      ? icon
      : runtime.defaultIconForPage(page);
  }

  function syncDefaultFolderNoteIcons(enabled) {
    for (const page of runtime.state.pages) {
      if (page.parentId || !page.folderId) continue;
      const folder = runtime.folderById(page.folderId);
      const matchesName =
        folder &&
        String(page.title || 'Untitled').toLocaleLowerCase() ===
          String(folder.name || '').toLocaleLowerCase();
      if (enabled) {
        if (!matchesName) continue;
        page.folderNote = true;
      } else {
        if (page.folderNote || matchesName) {
          page.folderNote = false;
        }
      }
    }
  }

  function renameFolderPathsInWorkspace(workspace, oldPath, newPath, newRootName) {
    const oldNormalized = runtime.normalizeFolderPath(oldPath),
      newNormalized = runtime.normalizeFolderPath(newPath);
    const oldPrefix = `${oldNormalized}/`,
      idMap = new Map();
    const rootFolder = (workspace.folders || []).find(
      (folder) =>
        runtime.normalizeFolderPath(folder.path).toLocaleLowerCase() ===
        oldNormalized.toLocaleLowerCase(),
    );
    const rootNote = (workspace.pages || []).find(
      (page) =>
        !page.parentId &&
        page.folderId === rootFolder?.id &&
        String(page.title || '').toLocaleLowerCase() ===
          String(rootFolder?.name || '').toLocaleLowerCase(),
    );
    if (rootNote) rootNote.title = newRootName;
    for (const folder of workspace.folders || []) {
      const path = runtime.normalizeFolderPath(folder.path),
        lowerPath = path.toLocaleLowerCase(),
        lowerOld = oldNormalized.toLocaleLowerCase();
      if (lowerPath !== lowerOld && !lowerPath.startsWith(`${lowerOld}/`)) continue;
      const nextPath =
        path === oldNormalized
          ? newNormalized
          : `${newNormalized}${path.slice(oldNormalized.length)}`;
      idMap.set(folder.id, runtime.folderIdForPath(nextPath));
      folder.path = nextPath;
      folder.id = runtime.folderIdForPath(nextPath);
      if (path === oldNormalized) folder.name = newRootName;
    }
    for (const page of workspace.pages || []) {
      if (idMap.has(page.folderId)) page.folderId = idMap.get(page.folderId);
      if (typeof page.filePath === 'string') {
        const filePath = runtime.normalizeFolderPath(page.filePath);
        if (filePath.toLocaleLowerCase().startsWith(oldPrefix.toLocaleLowerCase()))
          page.filePath = `${newNormalized}${filePath.slice(oldNormalized.length)}`;
      }
    }
    const activePath = runtime.normalizeFolderPath(workspace.activeFolderPath);
    if (activePath.toLocaleLowerCase() === oldNormalized.toLocaleLowerCase())
      workspace.activeFolderPath = newNormalized;
    else if (activePath.toLocaleLowerCase().startsWith(oldPrefix.toLocaleLowerCase()))
      workspace.activeFolderPath = `${newNormalized}${activePath.slice(oldNormalized.length)}`;
  }

  async function renameFolderForFolderNote(pageId, oldPath, oldTitle, newTitle) {
    const page = runtime.pageById(pageId),
      folder = runtime.folderByPath(oldPath);
    if (
      !page ||
      !folder ||
      page.parentId ||
      page.folderId !== folder.id ||
      (!page.folderNote &&
        String(oldTitle).toLocaleLowerCase() !== String(folder.name).toLocaleLowerCase()) ||
      !runtime.state.folderNotesEnabled
    )
      return;
    const title = String(newTitle || '');
    if (title === folder.name) return;
    const validationError = runtime.validateFilesystemName(title, 3);
    if (validationError) {
      page.title = oldTitle;
      runtime.scheduleSave('merge');
      runtime.renderAll();
      runtime.toast(validationError);
      return;
    }
    const parentPath = runtime.folderParentPath(folder.path),
      newPath = [parentPath, title].filter(Boolean).join('/');
    if (
      !parentPath &&
      [
        runtime.STORAGE_CONFIG.indexeddb.attachmentsDirectory,
        runtime.STORAGE_CONFIG.indexeddb.appDirectory,
        'attachments',
      ].some((name) => name.toLocaleLowerCase() === title.toLocaleLowerCase())
    ) {
      page.title = oldTitle;
      runtime.scheduleSave('merge');
      runtime.renderAll();
      runtime.toast('That folder name is reserved for app data or attachments.');
      return;
    }
    const conflict = (runtime.state.folders || []).find(
      (item) =>
        item.id !== folder.id &&
        runtime.normalizeFolderPath(item.path).toLocaleLowerCase() === newPath.toLocaleLowerCase(),
    );
    if (conflict) {
      page.title = oldTitle;
      runtime.scheduleSave('merge');
      runtime.renderAll();
      runtime.toast(`A folder named "${conflict.name}" already exists.`);
      return;
    }
    const noteConflict = runtime.state.pages.find(
      (item) =>
        item.id !== page.id &&
        !item.parentId &&
        item.folderId === folder.id &&
        String(item.title || 'Untitled').toLocaleLowerCase() === title.toLocaleLowerCase(),
    );
    if (noteConflict) {
      page.title = oldTitle;
      runtime.scheduleSave('merge');
      runtime.renderAll();
      runtime.toast(`A note named "${noteConflict.title}" already exists in this folder.`);
      return;
    }

    const oldWorkspace = runtime.clone(runtime.state),
      oldWorkspacePage = oldWorkspace.pages.find((item) => item.id === pageId),
      vaultId = runtime.activeVaultId,
      workspaceRef = runtime.state;
    if (oldWorkspacePage) oldWorkspacePage.title = oldTitle;
    runtime.lifecycle.clearTimeout(runtime.saveTimer);
    runtime.saveTimer = null;
    runtime.renameFolderPathsInWorkspace(runtime.state, folder.path, newPath, title);
    page.folderNote = true;
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
          if (!runtime.localStorageGateway.renameFolder)
            throw new Error('Folder renaming is not available for the selected notes folder.');
          await runtime.localStorageGateway.renameFolder(oldPath, newPath);
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
      runtime.toast(`Folder renamed: ${title}`);
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
          console.error('Could not restore the folder note after a failed rename.', rollbackError);
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
            'Could not finish saving a folder note rename after moving its directory.',
            recoveryError,
          );
        }
        if (recovered) {
          if (runtime.state === workspaceRef) runtime.renderAll();
          runtime.toast(`Folder renamed: ${title}`);
          return;
        }
      }
      console.error('Could not rename the folder for its folder note.', error);
      runtime.toast(error?.message || 'Could not rename the folder.');
    }
  }

  function selectMarkdownFolder(path, { newTab = false } = {}) {
    const folder = runtime.folderByPath(path);
    if (!folder) return;
    runtime.resetFilesTreeSelection('folder:' + folder.id);
    runtime.state.activeFolderPath = folder.path;
    folder.expanded = true;
    runtime.state.leftPanelMode = 'files';
    runtime.state.sidebarOpen = true;
    if (runtime.state.folderNotesEnabled) {
      let page = runtime.folderNoteInFolder(folder.path);
      if (page) {
        const needsUpdate = !page.folderNote;
        page.folderNote = true;
        if (needsUpdate) runtime.scheduleSave();
        runtime.openPage(page.id, { newTab, preserveTreeSelection: true });
        return;
      }
      const validationError = runtime.validateFilesystemName(folder.name, 3);
      if (validationError) {
        runtime.scheduleSave();
        runtime.renderSidebar();
        runtime.toast(`Cannot create a folder note: ${validationError}`);
        return;
      }
      runtime.createPage(null, runtime.state.activeEditorGroupId, folder.name, true);
      return;
    }
    runtime.scheduleSave();
    runtime.renderSidebar();
  }

  function createMarkdownFolder() {
    runtime.openNewFolderDialog();
  }

  function askDeleteConfirmation(title, message, confirmLabel = 'Delete') {
    if (!runtime.els.deleteConfirmDialog) return Promise.resolve(false);
    if (runtime.deleteConfirmResolver) runtime.settleDeleteConfirmation(false);
    runtime.els.deleteConfirmTitle.textContent = title;
    runtime.els.deleteConfirmMessage.textContent = message;
    runtime.els.deleteConfirmAccept.textContent = confirmLabel;
    runtime.els.deleteConfirmDialog.classList.remove('hidden');
    return new Promise((resolve) => {
      runtime.deleteConfirmResolver = resolve;
      runtime.lifecycle.frame(() => runtime.els.deleteConfirmCancel?.focus());
    });
  }

  function settleDeleteConfirmation(confirmed) {
    const resolve = runtime.deleteConfirmResolver;
    runtime.deleteConfirmResolver = null;
    runtime.els.deleteConfirmDialog?.classList.add('hidden');
    resolve?.(confirmed);
  }

  async function deleteMarkdownFolder(path) {
    let folder = runtime.folderByPath(path);
    if (!folder) return;
    const folderName = folder.name;
    if (
      !(await runtime.askDeleteConfirmation(
        'Delete folder?',
        `Delete “${folderName}” and all files and subfolders inside it?`,
      ))
    )
      return;
    folder = runtime.folderByPath(path);
    if (!folder) return;
    try {
      runtime.flushHistoryPending(runtime.activeVaultId);
      const previousWorkspace = runtime.clone(runtime.state),
        folderPath = runtime.normalizeFolderPath(folder.path),
        prefix = `${folderPath}/`,
        deletedPageIds = new Set();
      const rootFolderPathForPage = (page) => {
        let root = page;
        const visited = new Set();
        while (root.parentId && !visited.has(root.id)) {
          visited.add(root.id);
          const parent = runtime.pageById(root.parentId);
          if (!parent) break;
          root = parent;
        }
        return runtime.folderPathForId(root.folderId);
      };
      for (const page of runtime.state.pages) {
        const pagePath = rootFolderPathForPage(page);
        if (pagePath === folderPath || pagePath.startsWith(prefix)) deletedPageIds.add(page.id);
      }
      for (const id of deletedPageIds) runtime.confirmedPageDeletions.add(id);
      if (deletedPageIds.has(runtime.state.currentPageId)) runtime.cancelPageOperations();
      runtime.state.pages = runtime.state.pages.filter((page) => !deletedPageIds.has(page.id));
      runtime.state.openTabs = (runtime.state.openTabs || []).filter(
        (tab) => tab.kind === 'graph' || !deletedPageIds.has(tab.pageId),
      );
      runtime.repairEditorGroups();
      if (!(runtime.state.openTabs || []).some((tab) => tab.id === runtime.state.activeTabId))
        runtime.state.activeTabId = null;
      if (deletedPageIds.has(runtime.state.currentPageId)) {
        const next = runtime.state.openTabs.at(-1) || null;
        runtime.state.activeTabId = next?.id || null;
        runtime.state.currentPageId =
          next?.kind === 'page' ? next.pageId : runtime.state.pages[0]?.id || '__home__';
        runtime.state.mainView =
          next?.kind === 'graph' ? 'graph' : next?.kind === 'attachments' ? 'attachments' : 'page';
      }
      runtime.state.folders = (runtime.state.folders || []).filter(
        (item) => item.path !== folderPath && !item.path.startsWith(prefix),
      );
      if (
        runtime.state.activeFolderPath === folder.path ||
        runtime.state.activeFolderPath.startsWith(`${folder.path}/`)
      )
        runtime.state.activeFolderPath = '';
      runtime.recordHistory();
      await runtime.persistStateNow(previousWorkspace);
      runtime.applyTheme();
      runtime.renderAll();
      runtime.toast('Folder deleted');
    } catch (error) {
      runtime.toast(error?.message || 'Could not delete that folder.');
    }
  }

  async function loadState(vaultId = runtime.activeVaultId, { fromGit = false } = {}) {
    let workspace = await runtime.storageGateway.loadWorkspace(vaultId);
    if (runtime.lifecycle.disposed)
      throw new DOMException('Workspace loading cancelled.', 'AbortError');
    if (runtime.localStorageGateway.hasDirectory?.()) {
      const permission = await runtime.localStorageGateway.getDirectoryPermission?.();
      if (permission !== 'readwrite' && permission !== 'read')
        throw new Error(
          'The selected workspace cannot be verified. Choose it again and grant access.',
        );
      const disk = await runtime.localStorageGateway.readMarkdownFiles();
      if (runtime.lifecycle.disposed)
        throw new DOMException('Workspace loading cancelled.', 'AbortError');
      const markdownFilesWithoutLegacyMetadata =
        permission === 'readwrite' && !fromGit
          ? runtime.removeLegacyAppFrontmatter(disk.files)
          : null;
      if (disk.files.length || workspace?.markdownFilesInitialized) {
        workspace = runtime.workspaceFromMarkdown(
          workspace || runtime.clone(runtime.DEFAULT_WORKSPACE),
          disk.files,
          disk.directories,
        );
      } else {
        workspace = runtime.clone(workspace || runtime.DEFAULT_WORKSPACE);
        runtime.mergeMarkdownDirectories(workspace, disk.directories);
        if (permission === 'readwrite' && !fromGit) {
          workspace.markdownFilesInitialized = true;
          if (workspace.pages?.length)
            await runtime.localStorageGateway.writeMarkdownFiles(
              runtime.serializeMarkdownWorkspace(workspace),
            );
        }
      }
      if (permission === 'readwrite' && !fromGit) {
        await runtime.storageGateway.saveWorkspace(vaultId, runtime.clone(workspace));
        if (runtime.lifecycle.disposed)
          throw new DOMException('Workspace loading cancelled.', 'AbortError');
        if (markdownFilesWithoutLegacyMetadata && runtime.localStorageGateway.writeMarkdownFiles) {
          try {
            await runtime.localStorageGateway.writeMarkdownFiles(
              markdownFilesWithoutLegacyMetadata,
            );
          } catch (error) {
            console.warn('Could not remove legacy app frontmatter from Markdown files.', error);
          }
        }
      } else await runtime.storageGateway.cacheWorkspace(vaultId, runtime.clone(workspace));
    }
    const storedPages = workspace?.pages || [],
      storedFolders = workspace?.folders || [];
    const hasOnlyBlankUntitled =
      storedPages.length === 1 &&
      storedFolders.length === 0 &&
      storedPages[0]?.title === 'Untitled' &&
      storedPages[0]?.blocks?.length === 1 &&
      storedPages[0].blocks[0]?.type === 'text' &&
      !storedPages[0].blocks[0]?.text;
    if (
      !runtime.localStorageGateway.hasDirectory?.() &&
      workspace &&
      workspace.gettingStartedInitialized !== true &&
      (!(storedPages.length || storedFolders.length) || hasOnlyBlankUntitled)
    ) {
      const starter = runtime.normalizeWorkspace(runtime.clone(runtime.DEFAULT_BROWSER_WORKSPACE));
      workspace = runtime.normalizeWorkspace({
        ...starter,
        ...workspace,
        pages: starter.pages,
        currentPageId: starter.currentPageId,
        activeTabId: starter.activeTabId,
        activeEditorGroupId: starter.activeEditorGroupId,
        editorLayout: starter.editorLayout,
        openTabs: starter.openTabs,
        mainView: 'page',
        gettingStartedInitialized: true,
      });
      await runtime.storageGateway.saveWorkspace(vaultId, runtime.clone(workspace));
    }
    const fallbackWorkspace = runtime.localStorageGateway.hasDirectory?.()
      ? runtime.DEFAULT_WORKSPACE
      : runtime.DEFAULT_BROWSER_WORKSPACE;
    const parsed = runtime.normalizeWorkspace(
      workspace ? runtime.clone(workspace) : runtime.clone(fallbackWorkspace),
    );
    const meta = runtime.vaultRegistry.vaults.find((v) => v.id === vaultId);
    parsed.name = meta?.name || parsed.name || 'Vault';
    runtime.lastSyncedWorkspace = runtime.clone(parsed);
    runtime.confirmedPageDeletions.clear();
    return parsed;
  }

  function persistStateNow(previousWorkspaceForHistory = null) {
    runtime.lifecycle.clearTimeout(runtime.saveTimer);
    runtime.saveTimer = null;
    const vaultId = runtime.activeVaultId;
    if (
      !vaultId ||
      !runtime.lastSyncedWorkspace ||
      runtime.lifecycle.disposed ||
      runtime.workspaceAccess !== 'writable' ||
      runtime.gitOperationActive
    )
      return Promise.resolve(false);
    const workspaceRef = runtime.state;
    const locationKey = runtime.workspaceLocationKey();
    const isCurrentDocument = () =>
      runtime.state === workspaceRef &&
      runtime.activeVaultId === vaultId &&
      runtime.workspaceAccess === 'writable' &&
      runtime.workspaceLocationKey() === locationKey;
    const confirmedDeletions = new Set(runtime.confirmedPageDeletions);
    const snapshot = runtime.clone(runtime.state);
    return runtime
      .queueStorageWrite(async () => {
        // A queued save belongs to the document and folder that requested it.
        if (!isCurrentDocument()) return false;
        const pageIds = new Set(snapshot.pages.map((page) => page.id));
        const unexpectedRemoval = runtime.lastSyncedWorkspace.pages.some(
          (page) =>
            !pageIds.has(page.id) &&
            !confirmedDeletions.has(page.id) &&
            !previousWorkspaceForHistory,
        );
        if (unexpectedRemoval)
          throw new Error(
            'Save blocked: notes disappeared without a confirmed deletion. Reload the workspace.',
          );
        if (runtime.localStorageGateway.hasDirectory?.()) {
          const permission = await runtime.localStorageGateway.getDirectoryPermission?.();
          if (permission !== 'readwrite') {
            await runtime.applyWorkspacePermission(permission, { reload: true });
            if (
              runtime.accessModeForPermission(permission) === 'readonly' &&
              runtime.workspaceAccess === 'readonly'
            )
              runtime.restoreSynchronizedWorkspace();
            return false;
          }
        }
        if (!isCurrentDocument()) return false;
        await runtime.externalizeEmbeddedImages(snapshot, runtime.state);
        if (!isCurrentDocument()) return false;
        const markdownFiles = runtime.localStorageGateway.hasDirectory?.()
          ? runtime.serializeMarkdownWorkspace(snapshot)
          : null;
        const foldersToRemove =
          markdownFiles && previousWorkspaceForHistory
            ? await runtime.prepareHistoryFolderChanges(previousWorkspaceForHistory, snapshot)
            : [];
        if (!isCurrentDocument()) return false;
        if (markdownFiles) {
          snapshot.markdownFilesInitialized = true;
          runtime.state.markdownFilesInitialized = true;
          for (const page of snapshot.pages) {
            const current = runtime.pageById(page.id);
            if (current) current.filePath = page.filePath;
          }
        }
        if (markdownFiles && runtime.localStorageGateway.writeMarkdownFiles)
          await runtime.localStorageGateway.writeMarkdownFiles(markdownFiles, {
            allowDeletes: true,
          });
        if (foldersToRemove.length) await runtime.removeHistoryFolders(foldersToRemove);
        if (!isCurrentDocument()) return false;
        await runtime.storageGateway.saveWorkspace(vaultId, snapshot);
        runtime.lastSyncedWorkspace = runtime.clone(snapshot);
        for (const id of confirmedDeletions) runtime.confirmedPageDeletions.delete(id);
        return true;
      })
      .catch(async (error) => {
        if (runtime.localStorageGateway.hasDirectory?.()) {
          const permission = await runtime.localStorageGateway.getDirectoryPermission?.();
          if (permission !== 'readwrite') {
            await runtime.applyWorkspacePermission(permission, { reload: true });
            return false;
          }
        }
        console.error(`Could not save workspace to ${runtime.storageProviderLabel()}`, error);
        runtime.toast(
          error?.message || `Could not save workspace to ${runtime.storageProviderLabel()}.`,
        );
        return false;
      });
  }

  function persistViewStateNow() {
    const vaultId = runtime.activeVaultId;
    if (
      !vaultId ||
      !runtime.lastSyncedWorkspace ||
      runtime.lifecycle.disposed ||
      runtime.workspaceAccess !== 'writable'
    )
      return Promise.resolve(false);
    if (runtime.saveTimer) return runtime.persistStateNow();
    const workspaceRef = runtime.state;
    const locationKey = runtime.workspaceLocationKey();
    const snapshot = runtime.clone(runtime.state);
    return runtime
      .queueStorageWrite(async () => {
        if (runtime.localStorageGateway.hasDirectory?.()) {
          const permission = await runtime.localStorageGateway.getDirectoryPermission?.();
          if (permission !== 'readwrite') return false;
        }
        if (
          runtime.state !== workspaceRef ||
          runtime.activeVaultId !== vaultId ||
          runtime.workspaceLocationKey() !== locationKey
        )
          return false;
        await runtime.storageGateway.saveWorkspace(vaultId, snapshot);
        if (runtime.lastSyncedWorkspace)
          runtime.lastSyncedWorkspace = {
            ...runtime.lastSyncedWorkspace,
            editorScrollPositions: runtime.clone(snapshot.editorScrollPositions || {}),
          };
        return true;
      })
      .catch((error) => {
        console.warn('Could not save editor scroll position.', error);
        return false;
      });
  }

  function deleteVaultFromStorage(id) {
    return runtime
      .queueStorageWrite(async () => {
        await runtime.storageGateway.deleteWorkspace(id);
      })
      .catch((error) => {
        throw error;
      });
  }

  function renderVaultSelector() {
    if (!runtime.els.vaultSelect) return;
    runtime.els.vaultSelect.innerHTML = runtime.vaultRegistry.vaults
      .map(
        (v) => `<option value="${runtime.escapeHtml(v.id)}">${runtime.escapeHtml(v.name)}</option>`,
      )
      .join('');
    runtime.els.vaultSelect.value = runtime.activeVaultId;
    if (runtime.els.deleteVaultBtn)
      runtime.els.deleteVaultBtn.disabled = runtime.vaultRegistry.vaults.length === 1;
  }

  async function switchVault(id) {
    if (
      !id ||
      id === runtime.activeVaultId ||
      !runtime.vaultRegistry.vaults.some((v) => v.id === id)
    )
      return;
    runtime.cancelPageOperations();
    runtime.flushHistoryPending(runtime.activeVaultId);
    await runtime.persistStateNow();
    runtime.activeVaultId = id;
    runtime.vaultRegistry.activeVaultId = id;
    runtime.invalidateAttachmentList();
    await runtime.saveVaultRegistry();
    runtime.state = await runtime.loadState(id);
    runtime.initializeHistoryForVault(runtime.activeVaultId);
    runtime.applyTheme();
    runtime.renderAll();
    runtime.toast(`Vault: ${runtime.activeVaultMeta()?.name || 'Vault'}`);
  }

  function openNewFolderDialog() {
    if (!runtime.els.newFolderDialog || !runtime.els.newFolderNameInput) return;
    runtime.newFolderDialogParentPath = runtime.normalizeFolderPath(runtime.state.activeFolderPath);
    runtime.newFolderDialogSubmitting = false;
    runtime.els.newFolderNameInput.value = '';
    runtime.els.newFolderNameInput.disabled = false;
    runtime.els.newFolderNameError.textContent = '';
    runtime.els.newFolderConfirm.disabled = false;
    runtime.els.newFolderCancel.disabled = false;
    runtime.els.newFolderDialog.classList.remove('hidden');
    runtime.lifecycle.frame(() => runtime.els.newFolderNameInput.focus());
  }

  function closeNewFolderDialog() {
    if (runtime.newFolderDialogSubmitting) return;
    runtime.els.newFolderDialog?.classList.add('hidden');
    if (runtime.els.newFolderNameError) runtime.els.newFolderNameError.textContent = '';
    runtime.newFolderDialogParentPath = '';
  }

  async function submitNewFolderDialog() {
    if (runtime.newFolderDialogSubmitting || !runtime.els.newFolderNameInput) return;
    const name = runtime.els.newFolderNameInput.value;
    const parentPath = runtime.newFolderDialogParentPath;
    if (!name.trim()) {
      runtime.els.newFolderNameError.textContent = 'Enter a folder name.';
      runtime.els.newFolderNameInput.focus();
      return;
    }
    const validationError = runtime.validateFilesystemName(name);
    if (validationError) {
      runtime.els.newFolderNameError.textContent = validationError;
      runtime.els.newFolderNameInput.focus();
      return;
    }
    if (
      !parentPath &&
      [
        runtime.STORAGE_CONFIG.indexeddb.attachmentsDirectory,
        runtime.STORAGE_CONFIG.indexeddb.appDirectory,
        'attachments',
      ].some((reserved) => name.toLocaleLowerCase() === reserved.toLocaleLowerCase())
    ) {
      runtime.els.newFolderNameError.textContent =
        'That folder name is reserved for app data or attachments. Choose another name.';
      runtime.els.newFolderNameInput.focus();
      return;
    }
    const uniqueName = runtime.uniqueDirectoryName(
      name,
      parentPath,
      { checkPages: false },
      0,
      'suffix',
    );
    if (!uniqueName) {
      runtime.els.newFolderNameError.textContent = 'Enter a shorter folder name.';
      runtime.els.newFolderNameInput.focus();
      return;
    }
    const path = [parentPath, uniqueName].filter(Boolean).join('/');
    runtime.newFolderDialogSubmitting = true;
    runtime.els.newFolderNameInput.disabled = true;
    runtime.els.newFolderConfirm.disabled = true;
    runtime.els.newFolderCancel.disabled = true;
    try {
      if (runtime.localStorageGateway.hasDirectory?.())
        await runtime.localStorageGateway.createFolder(path);
      runtime.filesTreeSelectionCleared = false;
      const id = runtime.folderIdForPath(path);
      runtime.state.folders.push({
        id,
        path,
        name: uniqueName,
        icon: runtime.DEFAULT_FOLDER_ICON,
        expanded: true,
        explicit: true,
      });
      runtime.resetFilesTreeSelection('folder:' + id);
      runtime.state.activeFolderPath = path;
      runtime.state.leftPanelMode = 'files';
      runtime.state.sidebarOpen = true;
      runtime.newFolderDialogSubmitting = false;
      runtime.closeNewFolderDialog();
      if (runtime.state.folderNotesEnabled) runtime.selectMarkdownFolder(path);
      else {
        runtime.scheduleSave();
        runtime.renderSidebar();
      }
      runtime.toast(`Folder created: ${uniqueName}`);
    } catch (error) {
      runtime.newFolderDialogSubmitting = false;
      runtime.els.newFolderNameError.textContent =
        error?.message || 'Could not create that folder.';
      runtime.els.newFolderNameInput.disabled = false;
      runtime.els.newFolderConfirm.disabled = false;
      runtime.els.newFolderCancel.disabled = false;
      runtime.els.newFolderNameInput.focus();
    }
  }

  function createVault() {
    runtime.openVaultDialog('create');
  }

  function renameVault() {
    runtime.openVaultDialog('rename');
  }

  function openVaultDialog(mode) {
    if (!runtime.els.vaultDialog || !runtime.els.vaultDialogInput) return;
    const meta = runtime.activeVaultMeta();
    runtime.vaultDialogMode = mode;
    runtime.els.vaultDialogTitle.textContent = mode === 'rename' ? 'Rename vault' : 'Create vault';
    runtime.els.vaultDialogConfirm.textContent = mode === 'rename' ? 'Rename' : 'Create';
    runtime.els.vaultDialogInput.value = mode === 'rename' ? meta?.name || '' : 'New Vault';
    runtime.els.vaultDialogError.textContent = '';
    runtime.els.vaultDialog.classList.remove('hidden');
    runtime.lifecycle.frame(() => {
      runtime.els.vaultDialogInput.focus();
      runtime.els.vaultDialogInput.select();
    });
  }

  function closeVaultDialog() {
    runtime.vaultDialogMode = null;
    runtime.els.vaultDialog?.classList.add('hidden');
    if (runtime.els.vaultDialogError) runtime.els.vaultDialogError.textContent = '';
  }

  async function submitVaultDialog() {
    if (!runtime.vaultDialogMode || !runtime.els.vaultDialogInput) return;
    const name = runtime.els.vaultDialogInput.value.trim();
    if (!name) {
      runtime.els.vaultDialogError.textContent = 'Enter a vault name.';
      runtime.els.vaultDialogInput.focus();
      return;
    }
    const duplicate = runtime.vaultRegistry.vaults.some(
      (v) =>
        v.name.trim().toLowerCase() === name.toLowerCase() &&
        (runtime.vaultDialogMode !== 'rename' || v.id !== runtime.activeVaultId),
    );
    if (duplicate) {
      runtime.els.vaultDialogError.textContent = 'A vault with this name already exists.';
      runtime.els.vaultDialogInput.focus();
      runtime.els.vaultDialogInput.select();
      return;
    }
    if (runtime.vaultDialogMode === 'create' && runtime.localStorageGateway.hasDirectory?.()) {
      runtime.els.vaultDialogError.textContent =
        'Each local workspace needs its own folder. Add a folder from the workspace selector.';
      return;
    }
    if (runtime.vaultDialogMode === 'create') {
      runtime.cancelPageOperations();
      await runtime.persistStateNow();
      const id = runtime.uid('vault');
      runtime.vaultRegistry.vaults.push({ id, name });
      runtime.vaultRegistry.activeVaultId = id;
      runtime.activeVaultId = id;
      await runtime.saveVaultRegistry();
      runtime.state = runtime.makeBlankWorkspace();
      runtime.state.name = name;
      runtime.lastSyncedWorkspace = runtime.clone(runtime.state);
      runtime.confirmedPageDeletions.clear();
      runtime.initializeHistoryForVault(runtime.activeVaultId, { reset: true });
      await runtime.persistStateNow();
      runtime.applyTheme();
      runtime.closeVaultDialog();
      runtime.renderAll();
      runtime.lifecycle.frame(() => {
        runtime.els.pageTitle?.focus();
        runtime.selectAllContent(runtime.els.pageTitle);
      });
      runtime.toast('Vault created');
      return;
    }
    const meta = runtime.activeVaultMeta();
    if (!meta) return runtime.closeVaultDialog();
    if (name !== meta.name) {
      meta.name = name;
      runtime.state.name = name;
      await runtime.saveVaultRegistry();
      await runtime.persistStateNow();
      runtime.renderVaultSelector();
      runtime.toast('Vault renamed');
    }
    runtime.closeVaultDialog();
  }

  async function deleteVault() {
    const meta = runtime.activeVaultMeta();
    if (!meta || runtime.vaultRegistry.vaults.length <= 1) return;
    if (!confirm(`Delete vault "${meta.name}"? This removes its locally stored pages.`)) return;
    runtime.cancelPageOperations();
    await runtime.persistStateNow();
    await runtime.deleteVaultFromStorage(meta.id);
    const index = runtime.vaultRegistry.vaults.findIndex((v) => v.id === meta.id);
    runtime.vaultRegistry.vaults.splice(index, 1);
    const next =
      runtime.vaultRegistry.vaults[Math.max(0, index - 1)] || runtime.vaultRegistry.vaults[0];
    const historyKey = runtime.historyKeyForVault(meta.id);
    runtime.historyByVault.delete(historyKey);
    for (const key of runtime.navigationHistoryByVault.keys())
      if (key.startsWith(`${historyKey}:`)) runtime.navigationHistoryByVault.delete(key);
    runtime.activeVaultId = next.id;
    runtime.vaultRegistry.activeVaultId = next.id;
    await runtime.saveVaultRegistry();
    runtime.state = await runtime.loadState(runtime.activeVaultId);
    runtime.initializeHistoryForVault(runtime.activeVaultId);
    runtime.applyTheme();
    runtime.renderAll();
    runtime.toast('Vault deleted');
  }

  function currentPage() {
    return (
      runtime.state.pages.find((p) => p.id === runtime.state.currentPageId) ||
      runtime.state.pages[0]
    );
  }

  function pageById(id) {
    return runtime.state.pages.find((p) => p.id === id);
  }

  function childrenOf(id) {
    return runtime.state.pages.filter((p) => p.parentId === id);
  }

  function normalizeFolderPath(path) {
    return String(path || '')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '');
  }

  function folderIdForPath(path) {
    const value = runtime.normalizeFolderPath(path);
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `folder_${(hash >>> 0).toString(36)}`;
  }

  function folderById(id) {
    return (runtime.state.folders || []).find((folder) => folder.id === id);
  }

  function folderByPath(path) {
    const normalized = runtime.normalizeFolderPath(path);
    return (runtime.state.folders || []).find((folder) => folder.path === normalized);
  }

  function folderPathForId(id) {
    return runtime.folderById(id)?.path || '';
  }

  function mergeMarkdownDirectories(workspace, directories) {
    const folders = Array.isArray(workspace.folders) ? workspace.folders : (workspace.folders = []);
    const known = new Set(folders.map((folder) => runtime.normalizeFolderPath(folder.path)));
    for (const rawPath of directories || []) {
      const path = runtime.normalizeFolderPath(rawPath);
      if (!path || known.has(path)) continue;
      folders.push({
        id: runtime.folderIdForPath(path),
        path,
        name: path.split('/').at(-1) || path,
        icon: runtime.DEFAULT_FOLDER_ICON,
        expanded: true,
        explicit: true,
      });
      known.add(path);
    }
  }

  async function hydrateWorkspace() {
    runtime.vaultRegistry = await runtime.loadVaultRegistry();
    if (runtime.lifecycle.disposed) return;
    runtime.activeVaultId = runtime.vaultRegistry.activeVaultId;
    const loaded = await runtime.loadState(runtime.activeVaultId);
    if (runtime.lifecycle.disposed) return;
    runtime.state = loaded;
    if (typeof runtime.state.sidebarOpen !== 'boolean') runtime.state.sidebarOpen = true;
    if (typeof runtime.state.rightSidebarOpen !== 'boolean') runtime.state.rightSidebarOpen = true;
    if (!['files', 'favorites', 'git'].includes(runtime.state.leftPanelMode))
      runtime.state.leftPanelMode = 'files';
    if (!['outline', 'backlinks'].includes(runtime.state.rightPanelMode))
      runtime.state.rightPanelMode = 'outline';
    if (!['page', 'graph', 'attachments'].includes(runtime.state.mainView))
      runtime.state.mainView = 'page';
    if (!Number.isFinite(runtime.state.sidebarWidth)) runtime.state.sidebarWidth = 276;
    if (!Number.isFinite(runtime.state.rightSidebarWidth)) runtime.state.rightSidebarWidth = 286;
    runtime.initializeHistoryForVault(runtime.activeVaultId, { reset: true });
    runtime.lastSyncedWorkspace = runtime.clone(runtime.state);
    await runtime.refreshWorkspaceSelector();
    runtime.applyTheme();
    runtime.renderAll();
  }

  async function externalizeEmbeddedImages(workspace, liveWorkspace = null) {
    let changed = false;
    const livePages = new Map((liveWorkspace?.pages || []).map((page) => [page.id, page]));
    for (const page of workspace?.pages || [])
      for (const block of runtime.flattenBlocks(page.blocks || [])) {
        const source = String(block?.src || '');
        if (block?.type !== 'image' || !/^data:image\//i.test(source)) continue;
        try {
          const response = await fetch(source),
            blob = await response.blob();
          if (!blob.size) continue;
          block.src = await runtime.saveImageBlobAttachment(blob, 'image');
          const livePage = livePages.get(page.id),
            liveBlock =
              livePage &&
              runtime.flattenBlocks(livePage.blocks || []).find((item) => item.id === block.id);
          if (liveBlock?.src === source) liveBlock.src = block.src;
          changed = true;
        } catch (error) {
          console.warn('Could not move an embedded image into the attachments folder.', error);
        }
      }
    return changed;
  }

  async function init() {
    // Render and bind immediately, then hydrate the local workspace.
    runtime.applyTheme();
    runtime.bindEvents();
    runtime.setWorkspaceAccess('checking');
    runtime.renderAll();
    try {
      await runtime.localStorageGateway.initialize();
      if (runtime.lifecycle.disposed) return;
      await runtime.refreshWorkspaceSelector();
      if (runtime.lifecycle.disposed) return;
      await runtime.hydrateWorkspace();
      if (runtime.lifecycle.disposed) return;
      const currentPermission =
        (await runtime.localStorageGateway.getDirectoryPermission?.()) || 'none';
      const currentMode = runtime.accessModeForPermission(currentPermission);
      if (currentMode === 'blocked') throw new Error('Workspace permission is unavailable.');
      runtime.setWorkspaceAccess(currentMode);
      if (currentMode === 'writable' && (await runtime.externalizeEmbeddedImages(runtime.state)))
        await runtime.persistStateNow();
      if (currentMode === 'readonly')
        runtime.toast(
          'Workspace is read-only. Click “Grant write access” to request permission and edit.',
        );
      runtime.lifecycle.interval(() => {
        void runtime.checkWorkspacePermission({ reload: true });
      }, 4000);
      runtime.lifecycle.listen(window, 'focus', () => {
        void runtime.checkWorkspacePermission({ reload: true });
      });
      runtime.lifecycle.listen(document, 'visibilitychange', () => {
        if (!document.hidden) void runtime.checkWorkspacePermission({ reload: true });
      });
    } catch (error) {
      if (runtime.lifecycle.disposed) return;
      const missingFolder =
        error?.name === 'NotFoundError' && runtime.localStorageGateway.hasDirectory?.();
      if (missingFolder) console.warn('The workspace folder is no longer available.', error);
      else
        console.error(`${APP_NAME} ${runtime.storageProviderLabel()} initialization failed`, error);
      runtime.setWorkspaceAccess('blocked');
      runtime.renderAll();
      if (runtime.els.workspaceAccessMessage)
        runtime.els.workspaceAccessMessage.textContent = missingFolder
          ? 'The workspace folder is no longer available. You can close this workspace or select its folder again.'
          : error?.message?.includes('different workspace')
            ? 'The cache belongs to another workspace. Select the correct local workspace to avoid mixing data.'
            : 'Could not verify synchronization with this workspace. Select it again and grant read and write access.';
      runtime.toast(
        missingFolder
          ? 'Workspace folder unavailable. Close it or reconnect its folder.'
          : `${runtime.storageProviderLabel()} could not be initialized. Reconnect the workspace to continue.`,
      );
    }
  }

  function syncFolderNoteSettings() {
    if (runtime.els.folderNotesEnabled)
      runtime.els.folderNotesEnabled.checked = runtime.state.folderNotesEnabled !== false;
  }

  function applyTreeIconSizes() {
    const size = runtime.normalizeTreeIconSize(runtime.state.treeIconSize);
    document.documentElement.style.setProperty('--tree-icon-size', `${size}px`);
  }

  function insertTextAtSelection(root, text) {
    const sel = window.getSelection();
    if (!sel?.rangeCount) {
      root.append(document.createTextNode(text));
      return;
    }
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
      root.append(document.createTextNode(text));
      return;
    }
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  Object.assign(runtime, {
    getGitDirectory,
    beginGitOperation,
    endGitOperation,
    isExternalPageIcon,
    normalizePageIcon,
    normalizeTreeIconSize,
    pageIconMarkup,
    normalizeExternalIconUrl,
    makeBlankWorkspace,
    normalizeWorkspace,
    normalizeEditorLayout,
    editorGroups,
    editorGroup,
    queueStorageWrite,
    storageProviderLabel,
    workspaceLocationKey,
    historyKeyForVault,
    renderWorkspaceSelector,
    syncWorkspaceLocationActions,
    refreshWorkspaceSelector,
    syncWorkspaceEditorAccess,
    syncSpellcheckElements,
    setWorkspaceAccess,
    accessModeForPermission,
    applyWorkspacePermission,
    checkWorkspacePermission,
    restoreSynchronizedWorkspace,
    sameWorkspaceContent,
    sanitizeVaultRegistry,
    loadVaultRegistry,
    saveVaultRegistry,
    activeVaultMeta,
    chooseMarkdownDirectory,
    createWebWorkspace,
    restoreBrowserStorageWorkspace,
    saveBrowserWorkspaceLocally,
    switchWorkspaceLocation,
    closeWorkspaceCloseDialog,
    requestCloseSelectedWorkspace,
    clearBrowserStorageWorkspace,
    confirmCloseSelectedWorkspace,
    requestWorkspaceWriteAccess,
    refreshMarkdownWorkspace,
    folderNoteInFolder,
    pagesInFolder,
    folderNoteFolderForPage,
    representedFolderForPage,
    defaultIconForPage,
    pageIconFor,
    syncDefaultFolderNoteIcons,
    renameFolderPathsInWorkspace,
    renameFolderForFolderNote,
    selectMarkdownFolder,
    createMarkdownFolder,
    askDeleteConfirmation,
    settleDeleteConfirmation,
    deleteMarkdownFolder,
    loadState,
    persistStateNow,
    persistViewStateNow,
    deleteVaultFromStorage,
    renderVaultSelector,
    switchVault,
    openNewFolderDialog,
    closeNewFolderDialog,
    submitNewFolderDialog,
    createVault,
    renameVault,
    openVaultDialog,
    closeVaultDialog,
    submitVaultDialog,
    deleteVault,
    currentPage,
    pageById,
    childrenOf,
    normalizeFolderPath,
    folderIdForPath,
    folderById,
    folderByPath,
    folderPathForId,
    mergeMarkdownDirectories,
    hydrateWorkspace,
    externalizeEmbeddedImages,
    init,
    syncFolderNoteSettings,
    applyTreeIconSizes,
    insertTextAtSelection,
  });
}

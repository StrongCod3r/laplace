// @ts-nocheck
// Existing editor algorithms, isolated behind the typed controller boundary.
import type { EditorRuntime } from '@/features/editor/types';

export function registerHistory(runtime: EditorRuntime) {
  function snapshotsEqual(a, b) {
    try {
      const comparable = (snapshot) => {
        const value = runtime.clone(snapshot || {});
        delete value.markdownFilesInitialized;
        delete value.editorScrollPositions;
        for (const page of value.pages || []) delete page.filePath;
        return value;
      };
      return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));
    } catch {
      return false;
    }
  }

  function historyForVault(vaultId = runtime.activeVaultId) {
    const key = runtime.historyKeyForVault(vaultId);
    let history = runtime.historyByVault.get(key);
    if (!history) {
      history = { undo: [], redo: [], present: runtime.clone(runtime.state), pending: null };
      runtime.historyByVault.set(key, history);
    }
    return history;
  }

  function initializeHistoryForVault(vaultId = runtime.activeVaultId, { reset = false } = {}) {
    const key = runtime.historyKeyForVault(vaultId);
    if (reset || !runtime.historyByVault.has(key))
      runtime.historyByVault.set(key, {
        undo: [],
        redo: [],
        present: runtime.clone(runtime.state),
        pending: null,
      });
    else {
      const history = runtime.historyByVault.get(key);
      history.present = runtime.clone(runtime.state);
      history.pending = null;
    }
  }

  function pushUndoSnapshot(history, snapshot) {
    history.undo.push(runtime.clone(snapshot));
    if (history.undo.length > runtime.HISTORY_LIMIT)
      history.undo.splice(0, history.undo.length - runtime.HISTORY_LIMIT);
  }

  function flushHistoryPending(vaultId = runtime.activeVaultId) {
    runtime.lifecycle.clearTimeout(runtime.historyTimer);
    runtime.historyTimer = null;
    const history = runtime.historyByVault.get(runtime.historyKeyForVault(vaultId));
    if (!history?.pending) return;
    const { before, after } = history.pending;
    history.pending = null;
    if (!runtime.snapshotsEqual(before, after)) {
      runtime.pushUndoSnapshot(history, before);
      history.present = runtime.clone(after);
      history.redo = [];
    }
  }

  function recordHistory(mode = 'immediate') {
    if (runtime.historySuspended) return;
    const history = runtime.historyForVault();
    const current = runtime.clone(runtime.state);
    if (mode === 'merge') {
      if (!history.pending)
        history.pending = { before: runtime.clone(history.present), after: current };
      else history.pending.after = current;
      runtime.lifecycle.clearTimeout(runtime.historyTimer);
      const vaultId = runtime.activeVaultId;
      runtime.historyTimer = runtime.lifecycle.timeout(
        () => runtime.flushHistoryPending(vaultId),
        runtime.HISTORY_MERGE_DELAY,
      );
      return;
    }
    runtime.flushHistoryPending(runtime.activeVaultId);
    if (!runtime.snapshotsEqual(history.present, current)) {
      runtime.pushUndoSnapshot(history, history.present);
      history.present = current;
      history.redo = [];
    }
  }

  function markdownDirectoriesForHistory(workspace) {
    const directories = new Map();
    const addPath = (path) => {
      let current = runtime.normalizeFolderPath(path);
      while (current) {
        directories.set(current.toLocaleLowerCase(), current);
        current = runtime.folderParentPath(current);
      }
    };
    for (const folder of workspace?.folders || []) addPath(folder.path);
    for (const file of runtime.serializeMarkdownWorkspace(runtime.clone(workspace || {})))
      addPath(runtime.folderParentPath(file.path));
    return [...directories.values()];
  }

  function changedDirectoryRoots(paths, otherPaths) {
    const other = new Set(otherPaths.map((path) => path.toLocaleLowerCase()));
    const changed = paths.filter((path) => !other.has(path.toLocaleLowerCase()));
    const changedKeys = new Set(changed.map((path) => path.toLocaleLowerCase()));
    return changed.filter((path) => {
      let parent = runtime.folderParentPath(path);
      while (parent) {
        if (changedKeys.has(parent.toLocaleLowerCase())) return false;
        parent = runtime.folderParentPath(parent);
      }
      return true;
    });
  }

  function folderSubtreeShape(paths, root) {
    const key = root.toLocaleLowerCase(),
      prefix = key + '/';
    return paths
      .filter(
        (path) => path.toLocaleLowerCase() === key || path.toLocaleLowerCase().startsWith(prefix),
      )
      .map((path) => (path.toLocaleLowerCase() === key ? '' : path.slice(root.length + 1)))
      .sort();
  }

  async function prepareHistoryFolderChanges(previousWorkspace, nextWorkspace) {
    if (!runtime.localStorageGateway.hasDirectory?.()) return [];
    const previousPaths = runtime.markdownDirectoriesForHistory(previousWorkspace),
      nextPaths = runtime.markdownDirectoriesForHistory(nextWorkspace);
    const removed = runtime.changedDirectoryRoots(previousPaths, nextPaths),
      added = runtime.changedDirectoryRoots(nextPaths, previousPaths);
    const movedFrom = new Set(),
      movedTo = new Set();
    for (const source of removed) {
      const shape = runtime.folderSubtreeShape(previousPaths, source).join(String.fromCharCode(0));
      const targets = added.filter(
        (target) =>
          !movedTo.has(target) &&
          runtime.folderSubtreeShape(nextPaths, target).join(String.fromCharCode(0)) === shape,
      );
      const sources = removed.filter(
        (candidate) =>
          !movedFrom.has(candidate) &&
          runtime.folderSubtreeShape(previousPaths, candidate).join(String.fromCharCode(0)) ===
            shape,
      );
      if (targets.length !== 1 || sources.length !== 1) continue;
      if (!runtime.localStorageGateway.renameFolder)
        throw new Error('Folder moving is not available for the selected notes folder.');
      await runtime.localStorageGateway.renameFolder(source, targets[0]);
      movedFrom.add(source);
      movedTo.add(targets[0]);
    }
    for (const path of added) {
      if (movedTo.has(path)) continue;
      await runtime.localStorageGateway.createFolder?.(path);
    }
    return removed.filter((path) => !movedFrom.has(path));
  }

  async function removeHistoryFolders(paths) {
    if (!runtime.localStorageGateway.removeFolder) return;
    for (const path of paths.sort((a, b) => b.length - a.length)) {
      try {
        await runtime.localStorageGateway.removeFolder(path);
      } catch (error) {
        if (error?.name !== 'NotFoundError') throw error;
      }
    }
  }

  function scheduleSave(mode = 'immediate') {
    if (runtime.gitOperationActive) return;
    if (runtime.workspaceAccess !== 'writable') {
      if (!runtime.sameWorkspaceContent(runtime.state, runtime.lastSyncedWorkspace))
        runtime.restoreSynchronizedWorkspace();
      return;
    }
    runtime.recordHistory(mode);
    runtime.lifecycle.clearTimeout(runtime.saveTimer);
    runtime.saveTimer = runtime.lifecycle.timeout(runtime.persistStateNow, 120);

    runtime.publish();
  }

  async function undoWorkspace() {
    runtime.flushHistoryPending(runtime.activeVaultId);
    const history = runtime.historyForVault();
    if (!history.undo.length) return;
    const previousWorkspace = runtime.clone(runtime.state),
      previous = history.undo.pop();
    previous.editorScrollPositions = runtime.clone(runtime.state.editorScrollPositions || {});
    history.redo.push(runtime.clone(history.present));
    runtime.historySuspended = true;
    runtime.state = runtime.normalizeWorkspace(runtime.clone(previous));
    history.present = runtime.clone(runtime.state);
    history.pending = null;
    try {
      runtime.applyTheme();
      runtime.renderAll();
      await runtime.persistStateNow(previousWorkspace);
      runtime.toast('Undo');
    } finally {
      runtime.historySuspended = false;
    }
  }

  async function redoWorkspace() {
    runtime.flushHistoryPending(runtime.activeVaultId);
    const history = runtime.historyForVault();
    if (!history.redo.length) return;
    const previousWorkspace = runtime.clone(runtime.state),
      next = history.redo.pop();
    next.editorScrollPositions = runtime.clone(runtime.state.editorScrollPositions || {});
    runtime.pushUndoSnapshot(history, history.present);
    runtime.historySuspended = true;
    runtime.state = runtime.normalizeWorkspace(runtime.clone(next));
    history.present = runtime.clone(runtime.state);
    history.pending = null;
    try {
      runtime.applyTheme();
      runtime.renderAll();
      await runtime.persistStateNow(previousWorkspace);
      runtime.toast('Redo');
    } finally {
      runtime.historySuspended = false;
    }
  }

  Object.assign(runtime, {
    snapshotsEqual,
    historyForVault,
    initializeHistoryForVault,
    pushUndoSnapshot,
    flushHistoryPending,
    recordHistory,
    markdownDirectoriesForHistory,
    changedDirectoryRoots,
    folderSubtreeShape,
    prepareHistoryFolderChanges,
    removeHistoryFolders,
    scheduleSave,
    undoWorkspace,
    redoWorkspace,
  });
}

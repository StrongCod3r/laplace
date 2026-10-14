// @ts-nocheck
// Existing editor algorithms, isolated behind the typed controller boundary.
import type { EditorRuntime } from '@/features/editor/types';
import {
  HISTORY_NAVIGATION_KEYS,
  preserveHistoryNavigation,
  type HistoryEditorFocus,
} from './editor-context';

export function registerHistory(runtime: EditorRuntime) {
  const snapshotFocus = new WeakMap<object, HistoryEditorFocus>();
  let beforeInputFocus: { vaultId: string; focus: HistoryEditorFocus | null } | null = null;

  function cloneHistorySnapshot(snapshot, focus = snapshotFocus.get(snapshot)) {
    const copy = runtime.clone(snapshot);
    if (focus) snapshotFocus.set(copy, runtime.clone(focus));
    return copy;
  }

  function snapshotsEqual(a, b) {
    try {
      const comparable = (snapshot) => {
        const value = runtime.clone(snapshot || {});
        delete value.markdownFilesInitialized;
        delete value.editorScrollPositions;
        for (const key of HISTORY_NAVIGATION_KEYS) delete value[key];
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

  function pushUndoSnapshot(history, snapshot, focus = snapshotFocus.get(snapshot)) {
    history.undo.push(cloneHistorySnapshot(snapshot, focus));
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
      history.present = cloneHistorySnapshot(after);
      history.redo = [];
    }
  }

  function recordHistory(mode = 'immediate') {
    if (runtime.historySuspended) return;
    const history = runtime.historyForVault();
    const current = runtime.clone(runtime.state);
    const afterFocus = captureHistoryEditorFocus();
    const beforeFocus =
      beforeInputFocus?.vaultId === runtime.activeVaultId
        ? beforeInputFocus.focus
        : snapshotFocus.get(history.present) || afterFocus;
    beforeInputFocus = null;
    if (afterFocus) snapshotFocus.set(current, afterFocus);
    if (mode === 'merge') {
      if (!history.pending)
        history.pending = {
          before: cloneHistorySnapshot(history.present, beforeFocus),
          after: current,
        };
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
      runtime.pushUndoSnapshot(history, history.present, beforeFocus);
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
    // Navigation changes view state, so it must not clone the vault into undo history.
    if (mode !== 'view') runtime.recordHistory(mode);
    runtime.lifecycle.clearTimeout(runtime.saveTimer);
    runtime.saveTimer = runtime.lifecycle.timeout(runtime.persistStateNow, 120);

    if (mode !== 'view') runtime.publish();
  }

  function captureHistoryBeforeInput(event: Pick<InputEvent, 'inputType'>) {
    if (runtime.workspaceAccess !== 'writable' || !/^(insert|delete)/.test(event.inputType)) return;
    beforeInputFocus = { vaultId: runtime.activeVaultId, focus: captureHistoryEditorFocus() };
  }

  function captureHistoryEditorFocus(): HistoryEditorFocus | null {
    const active = document.activeElement;
    if (!active || runtime.state.mainView !== 'page') return null;
    const context = {
      pageId: runtime.state.currentPageId,
      groupId: runtime.state.activeEditorGroupId,
    };
    const offset = (element) => {
      const selection = window.getSelection();
      if (!selection?.focusNode || !element.contains(selection.focusNode)) return 0;
      const range = document.createRange();
      range.selectNodeContents(element);
      range.setEnd(selection.focusNode, selection.focusOffset);
      return range.toString().length;
    };
    if (active === runtime.els.pageTitle)
      return { ...context, kind: 'title', offset: offset(active) };
    if (!runtime.els.blockEditor?.contains(active)) return null;
    const blockId = active.closest('.block-row')?.dataset.blockId;
    if (active.matches('[data-code-editor]'))
      return { ...context, kind: 'code', blockId, offset: active.selectionEnd || 0 };
    if (active.matches('[data-table-cell]'))
      return {
        ...context,
        kind: 'table',
        blockId,
        cell: active.dataset.tableCell,
        offset: offset(active),
      };
    if (active.matches('.block-content'))
      return { ...context, kind: 'block', blockId, offset: offset(active) };
    return null;
  }

  function restoreHistoryEditorFocus(focus: HistoryEditorFocus | null) {
    if (!focus) return;
    const workspace = runtime.state;
    runtime.lifecycle.frame(() => {
      if (
        runtime.state !== workspace ||
        runtime.state.currentPageId !== focus.pageId ||
        runtime.state.activeEditorGroupId !== focus.groupId
      )
        return;
      const root = runtime.els.blockEditor;
      const row = [...root.querySelectorAll('.block-row')].find(
        (item) => item.dataset.blockId === focus.blockId,
      );
      const target =
        focus.kind === 'title'
          ? runtime.els.pageTitle
          : focus.kind === 'code'
            ? row?.querySelector('[data-code-editor]')
            : focus.kind === 'table'
              ? [...(row?.querySelectorAll('[data-table-cell]') || [])].find(
                  (cell) => cell.dataset.tableCell === focus.cell,
                )
              : row?.querySelector('.block-content') || root.querySelector('.block-content');
      if (!target || target.getAttribute('contenteditable') === 'false') return;
      target.focus({ preventScroll: true });
      if (focus.kind === 'code')
        target.selectionStart = target.selectionEnd = Math.min(focus.offset, target.value.length);
      else runtime.setCaretOffset(target, focus.offset);
    });
  }

  async function undoWorkspace() {
    runtime.flushHistoryPending(runtime.activeVaultId);
    const history = runtime.historyForVault();
    if (!history.undo.length) return;
    const previousWorkspace = runtime.clone(runtime.state),
      previous = history.undo.pop();
    const currentFocus = captureHistoryEditorFocus();
    const storedFocus = snapshotFocus.get(previous);
    const focus =
      storedFocus?.pageId === runtime.state.currentPageId
        ? { ...storedFocus, groupId: runtime.state.activeEditorGroupId }
        : currentFocus;
    history.redo.push(cloneHistorySnapshot(history.present));
    runtime.historySuspended = true;
    runtime.state = runtime.normalizeWorkspace(
      preserveHistoryNavigation(runtime.clone(previous), previousWorkspace),
    );
    history.present = cloneHistorySnapshot(runtime.state, focus);
    history.pending = null;
    try {
      runtime.applyTheme();
      runtime.renderAll();
      restoreHistoryEditorFocus(focus);
    } finally {
      runtime.historySuspended = false;
    }
    await runtime.persistStateNow(previousWorkspace);
    runtime.toast('Undo');
  }

  async function redoWorkspace() {
    runtime.flushHistoryPending(runtime.activeVaultId);
    const history = runtime.historyForVault();
    if (!history.redo.length) return;
    const previousWorkspace = runtime.clone(runtime.state),
      next = history.redo.pop();
    const currentFocus = captureHistoryEditorFocus();
    const storedFocus = snapshotFocus.get(next);
    const focus =
      storedFocus?.pageId === runtime.state.currentPageId
        ? { ...storedFocus, groupId: runtime.state.activeEditorGroupId }
        : currentFocus;
    runtime.pushUndoSnapshot(history, history.present);
    runtime.historySuspended = true;
    runtime.state = runtime.normalizeWorkspace(
      preserveHistoryNavigation(runtime.clone(next), previousWorkspace),
    );
    history.present = cloneHistorySnapshot(runtime.state, focus);
    history.pending = null;
    try {
      runtime.applyTheme();
      runtime.renderAll();
      restoreHistoryEditorFocus(focus);
    } finally {
      runtime.historySuspended = false;
    }
    await runtime.persistStateNow(previousWorkspace);
    runtime.toast('Redo');
  }

  Object.assign(runtime, {
    cloneHistorySnapshot,
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
    captureHistoryBeforeInput,
    captureHistoryEditorFocus,
    restoreHistoryEditorFocus,
    undoWorkspace,
    redoWorkspace,
  });
}

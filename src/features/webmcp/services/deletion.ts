import type { EditorRuntime } from '@/features/editor/types';
import type { WorkspaceDocument } from '@/features/workspace/types';
import type { ControllerLifecycle } from '@/shared/lib/controller-lifecycle';
import { preserveHistoryNavigation } from '@/features/history/services/editor-context';

type Status = 'pending_confirmation' | 'saving' | 'deleted' | 'cancelled' | 'failed';
interface DeletionResult {
  requestId: string;
  status: Status;
  noteCount: number;
  notes: { pageId: string; title: string; path: string }[];
  deletedCount: number;
  saved: boolean;
  message?: string;
  restored?: boolean;
  rollbackSaved?: boolean;
}
interface History {
  undo: WorkspaceDocument[];
  redo: WorkspaceDocument[];
  present: WorkspaceDocument;
  pending: { before: WorkspaceDocument; after: WorkspaceDocument } | null;
}
interface Runtime {
  state: WorkspaceDocument;
  activeVaultId: string;
  workspaceAccess: string;
  lastSyncedWorkspace: unknown;
  workspaceLocationSwitching: boolean;
  workspaceLocationClosing: boolean;
  gitOperationActive: boolean;
  lifecycle: ControllerLifecycle;
  storageWriteChain: Promise<unknown>;
  confirmedPageDeletions: Set<string>;
  deleteConfirmResolver: ((confirmed: boolean) => void) | null;
  workspaceLocationKey(): string;
  serializeMarkdownWorkspace(document: WorkspaceDocument): { path: string; content: string }[];
  askDeleteConfirmation(title: string, message: string, label?: string): Promise<boolean>;
  settleDeleteConfirmation(confirmed: boolean): void;
  removePagesFromWorkspace(ids: Set<string>): void;
  resetFilesTreeSelection(): void;
  flushHistoryPending(): void;
  historyForVault(): History;
  recordHistory(): void;
  persistStateNow(): Promise<boolean>;
  renderAll(): void;
  publish(): void;
}
interface Request {
  vaultId: string;
  result: DeletionResult;
  cancel(): void;
}
const requests = new WeakMap<EditorRuntime, Map<string, Request>>();

function registry(editor: EditorRuntime) {
  let map = requests.get(editor);
  if (!map) {
    map = new Map();
    requests.set(editor, map);
  }
  return map;
}
function signature(document: WorkspaceDocument) {
  const strip = (value: Record<string, unknown>) => {
    const copy = { ...value };
    delete copy.filePath;
    delete copy.expanded;
    return copy;
  };
  return JSON.stringify({ pages: document.pages.map(strip), folders: document.folders.map(strip) });
}
export function deletionSaving(editor: EditorRuntime) {
  return [...registry(editor).values()].some((request) => request.result.status === 'saving');
}
export function cancelWebMcpDeletions(editor: EditorRuntime) {
  for (const request of registry(editor).values()) request.cancel();
}
export function deletionStatus(
  editor: EditorRuntime,
  vaultId: string,
  requestId: string,
  cancel = false,
) {
  const request = registry(editor).get(requestId);
  if (!request || request.vaultId !== vaultId)
    throw new Error('Deletion request not found in this vault.');
  if (cancel) request.cancel();
  return structuredClone(request.result);
}

/** Requests return immediately; only Laplace's own confirmation dialog can authorize the deletion. */
export function requestDeletion(
  editor: EditorRuntime,
  vaultId: string,
  pageId: string | null,
  expectedCount?: number,
  signal?: AbortSignal,
) {
  const runtime = editor as unknown as Runtime;
  const map = registry(editor);
  if (signal?.aborted) throw new Error('The WebMCP connection was cancelled.');
  if (
    [...map.values()].some((request) =>
      ['pending_confirmation', 'saving'].includes(request.result.status),
    ) ||
    runtime.deleteConfirmResolver
  )
    throw new Error('Another confirmation or deletion is already in progress.');
  if (pageId !== null && !runtime.state.pages.some((page) => page.id === pageId))
    throw new Error('Note not found in the connected vault.');
  if (pageId === null && runtime.state.pages.length !== expectedCount)
    throw new Error('The note count changed. Read the workspace again before deleting all notes.');
  const document = runtime.state,
    location = runtime.workspaceLocationKey(),
    beforeSignature = signature(document);
  const ids = new Set<string>(pageId === null ? document.pages.map((page) => page.id) : [pageId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const page of document.pages)
      if (page.parentId && ids.has(page.parentId) && !ids.has(page.id)) {
        ids.add(page.id);
        changed = true;
      }
  }
  const files = runtime.serializeMarkdownWorkspace(structuredClone(document));
  const notes = document.pages.flatMap((page, index) =>
    ids.has(page.id) ? [{ pageId: page.id, title: page.title, path: files[index].path }] : [],
  );
  const result: DeletionResult = {
    requestId: crypto.randomUUID(),
    status: notes.length ? 'pending_confirmation' : 'deleted',
    noteCount: notes.length,
    notes: notes.slice(0, 100),
    deletedCount: 0,
    saved: notes.length === 0,
  };
  let resolver: Runtime['deleteConfirmResolver'] = null;
  let timer: number | undefined;
  const request: Request = {
    vaultId,
    result,
    cancel: () => {
      if (result.status !== 'pending_confirmation') return;
      result.status = 'cancelled';
      result.message = 'Deletion cancelled.';
      if (resolver && runtime.deleteConfirmResolver === resolver)
        runtime.settleDeleteConfirmation(false);
    },
  };
  // Outcomes are session-local and bounded; pending requests are never evicted.
  for (const [id, old] of map)
    if (map.size >= 20 && !['pending_confirmation', 'saving'].includes(old.result.status))
      map.delete(id);
  map.set(result.requestId, request);
  if (!notes.length) return structuredClone(result);
  const stillCurrent = () =>
    !runtime.lifecycle.disposed &&
    runtime.state === document &&
    runtime.activeVaultId === vaultId &&
    runtime.workspaceLocationKey() === location;
  const validate = () => {
    if (
      signal?.aborted ||
      !stillCurrent() ||
      runtime.workspaceAccess !== 'writable' ||
      !runtime.lastSyncedWorkspace ||
      runtime.workspaceLocationSwitching ||
      runtime.workspaceLocationClosing ||
      runtime.gitOperationActive
    )
      throw new Error('Deletion cancelled because the workspace or connection changed.');
    if (signature(runtime.state) !== beforeSignature)
      throw new Error('The notes changed while confirmation was pending. Request deletion again.');
  };
  const message = [
    pageId === null
      ? `Delete all ${notes.length} notes in the active vault?`
      : `Delete “${notes[0].title}” and its child notes (${notes.length} notes total)?`,
    notes
      .slice(0, 5)
      .map((note) => note.path)
      .join('\n'),
    notes.length > 5 ? `…and ${notes.length - 5} more notes.` : '',
    'Folders and attachment files will be kept. You can undo this deletion in this session.',
  ]
    .filter(Boolean)
    .join('\n\n');
  const confirmation = runtime.askDeleteConfirmation(
    pageId === null ? 'Delete all notes?' : 'Delete note?',
    message,
  );
  resolver = runtime.deleteConfirmResolver;
  timer = runtime.lifecycle.timeout(() => request.cancel(), 120000);
  const onAbort = () => request.cancel();
  signal?.addEventListener('abort', onAbort, { once: true });
  async function perform() {
    if (!(await confirmation) || result.status === 'cancelled') {
      request.cancel();
      return;
    }
    runtime.lifecycle.clearTimeout(timer);
    validate();
    result.status = 'saving';
    await runtime.storageWriteChain;
    validate();
    runtime.flushHistoryPending();
    const previous = structuredClone(document),
      history = runtime.historyForVault();
    const checkpoint = {
      undo: [...history.undo],
      redo: [...history.redo],
      present: history.present,
      pending: history.pending,
    };
    const originalUndo = new Set(history.undo),
      confirmedBefore = new Set(runtime.confirmedPageDeletions);
    let deletionUndo: WorkspaceDocument | undefined;
    let deletedSignature = beforeSignature;
    let mutationComplete = false;
    let saved = false;
    try {
      runtime.removePagesFromWorkspace(ids);
      runtime.resetFilesTreeSelection();
      runtime.recordHistory();
      deletionUndo = history.undo.at(-1);
      deletedSignature = signature(runtime.state);
      mutationComplete = true;
      runtime.renderAll();
      runtime.publish();
      saved = await runtime.persistStateNow();
    } catch {
      if (!mutationComplete) deletedSignature = signature(runtime.state);
      saved = false;
    }
    if (!stillCurrent())
      throw new Error('Workspace changed during deletion. Check its saved state.');
    if (saved) {
      result.status = 'deleted';
      result.deletedCount = ids.size;
      result.saved = true;
      return;
    }

    // A failed save must not leave an empty document to be saved on unmount.
    const restoreMissing = (snapshot: WorkspaceDocument) => {
      previous.pages.forEach((page, index) => {
        if (ids.has(page.id) && !snapshot.pages.some((item) => item.id === page.id))
          snapshot.pages.splice(Math.min(index, snapshot.pages.length), 0, structuredClone(page));
      });
    };
    if (signature(document) === deletedSignature) {
      runtime.state = preserveHistoryNavigation(previous, document);
      Object.assign(history, checkpoint);
    } else {
      // Retain edits made to surviving notes while storage was pending.
      restoreMissing(document);
      history.undo = history.undo.filter((snapshot) => snapshot !== deletionUndo);
      for (const snapshot of history.undo)
        if (!originalUndo.has(snapshot)) restoreMissing(snapshot);
      for (const snapshot of history.redo) restoreMissing(snapshot);
      if (history.pending) {
        restoreMissing(history.pending.before);
        restoreMissing(history.pending.after);
      }
      history.present = structuredClone(document);
    }
    for (const id of ids) if (!confirmedBefore.has(id)) runtime.confirmedPageDeletions.delete(id);
    runtime.renderAll();
    runtime.publish();
    result.status = 'failed';
    result.restored = true;
    result.message =
      'Deletion could not be saved. Notes were restored in the editor; check workspace access.';
    try {
      result.rollbackSaved = await runtime.persistStateNow();
    } catch {
      result.rollbackSaved = false;
    }
  }
  void perform()
    .catch((error: unknown) => {
      if (result.status === 'cancelled') return;
      result.status = signal?.aborted ? 'cancelled' : 'failed';
      result.message = error instanceof Error ? error.message : 'Deletion failed.';
    })
    .finally(() => {
      runtime.lifecycle.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    });
  return structuredClone(result);
}

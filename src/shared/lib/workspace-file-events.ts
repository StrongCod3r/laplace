type FileChangeListener = (workspaceId: string) => void;

const listeners = new Set<FileChangeListener>();

export function subscribeWorkspaceFileChanges(listener: FileChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Publish only after a filesystem mutation, with the location that owns the files.
export function notifyWorkspaceFileChanges(workspaceId: string | null): void {
  if (!workspaceId) return;
  for (const listener of listeners) {
    try {
      listener(workspaceId);
    } catch (error) {
      console.error('Could not notify a workspace file change.', error);
    }
  }
}

import { useLayoutEffect, useState } from 'preact/hooks';
import { createWorkspaceController } from '../services/create-controller';
import { useWorkspaceStore } from '@/store/workspace.store';
import type { WorkspaceController } from '../types';

export function useWorkspaceController() {
  const [error, setError] = useState<Error | null>(null);
  const [ready, setReady] = useState(false);
  // The DOM editor must release listeners during unmount, before another instance mounts.
  useLayoutEffect(() => {
    let cancelled = false;
    let controller: WorkspaceController | undefined;
    // Do not open the database if this mount is cancelled before initialization.
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        controller = createWorkspaceController();
        useWorkspaceStore.getState().setController(controller);
        void controller.start().then(
          () => {
            if (!cancelled) setReady(true);
          },
          (cause: unknown) => {
            if (!cancelled)
              setError(
                cause instanceof Error ? cause : new Error('Workspace initialization failed'),
              );
          },
        );
      } catch (cause) {
        if (!cancelled)
          setError(cause instanceof Error ? cause : new Error('Workspace initialization failed'));
      }
    });
    return () => {
      cancelled = true;
      controller?.dispose();
      if (useWorkspaceStore.getState().controller === controller)
        useWorkspaceStore.getState().setController(null);
    };
  }, []);
  if (error) throw error;
  return ready;
}

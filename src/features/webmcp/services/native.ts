import type { WorkspaceController } from '@/features/editor/types';
import { webMcpTools } from './tools';

export type NativeWebMcpStatus =
  'checking' | 'unsupported' | 'waiting' | 'registering' | 'ready' | 'error';

/** Narrow boundary for the experimental browser API; no global polyfill or remote dependency. */
export interface NativeModelContext {
  registerTool(
    tool: {
      name: string;
      description: string;
      inputSchema: (typeof webMcpTools)[number]['inputSchema'];
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute(args: unknown, options?: { signal?: AbortSignal }): Promise<unknown>;
    },
    options: { signal: AbortSignal },
  ): Promise<void>;
}

export function nativeModelContext(target: Document): NativeModelContext | null {
  const context = (target as Document & { modelContext?: NativeModelContext }).modelContext;
  return context && typeof context.registerTool === 'function' ? context : null;
}

/** Each registration owns only its tools via an AbortSignal and remains bound to one vault. */
export function registerNativeWebMcp(
  context: NativeModelContext,
  controller: Pick<WorkspaceController, 'invokeWebMcpTool'>,
  vaultId: string,
  onStatus: (status: NativeWebMcpStatus) => void,
) {
  const lifetime = new AbortController();
  let active = true;
  function dispose() {
    if (!active) return;
    active = false;
    lifetime.abort();
  }
  const readOnly = new Set([
    'laplace_workspace',
    'laplace_list_folders',
    'laplace_search_notes',
    'laplace_read_note',
    'laplace_list_tabs',
  ]);
  const ready = Promise.all(
    webMcpTools.map(async (tool) => {
      await context.registerTool(
        {
          ...structuredClone(tool),
          annotations: { readOnlyHint: readOnly.has(tool.name), untrustedContentHint: true },
          execute: async (args, options) => {
            if (!active || lifetime.signal.aborted || options?.signal?.aborted)
              throw new DOMException(
                'WebMCP execution was cancelled or the workspace disconnected.',
                'AbortError',
              );
            // Both transports share validation, permissions, concurrency checks, history, and storage.
            // A save already started must finish through the guarded storage queue, not be interrupted.
            return await controller.invokeWebMcpTool(vaultId, tool.name, args);
          },
        },
        { signal: lifetime.signal },
      );
    }),
  ).then(
    () => {
      if (active) onStatus('ready');
    },
    () => {
      if (!active) return;
      dispose();
      onStatus('error');
    },
  );
  return { ready, dispose };
}

import type { DirectoryHandle } from './directory-fs';
import type { WorkspaceGitClient } from './git-client';

export type GitClient = Pick<WorkspaceGitClient, keyof WorkspaceGitClient> & { dispose(): void };
export type GitWorkerMethod = Exclude<keyof WorkspaceGitClient, 'authenticate'>;
export interface GitWorkerRequest {
  id: number;
  method: GitWorkerMethod | 'open';
  args: unknown[];
  authentication?: { username: string; token: string };
}
export interface GitWorkerResponse {
  id: number;
  result?: unknown;
  error?: { message: string; name: string; code?: string };
}

/** One worker per repository; only cloned directory handles and results cross the boundary. */
export async function createGitClient(directory: DirectoryHandle): Promise<GitClient> {
  const fallback = async () => {
    const [{ WorkspaceGitClient }, { createDirectoryFs }] = await Promise.all([
      import('./git-client'),
      import('./directory-fs'),
    ]);
    return Object.assign(new WorkspaceGitClient(createDirectoryFs(directory)), { dispose() {} });
  };
  if (typeof Worker === 'undefined') return fallback();
  const worker = new Worker(new URL('./git.worker.ts', import.meta.url), { type: 'module' });
  let nextId = 0;
  let disposed = false;
  let authentication = { username: '', token: '' };
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  const finishDisposal = () => {
    // Let in-flight writes finish before releasing their repository worker.
    if (disposed && !pending.size) worker.terminate();
  };
  const fail = () => {
    disposed = true;
    for (const request of pending.values())
      request.reject(new Error('Git worker stopped. Please reopen Source Control.'));
    pending.clear();
    worker.terminate();
  };
  worker.addEventListener('error', fail);
  worker.addEventListener('messageerror', fail);
  worker.addEventListener('message', (event: MessageEvent<GitWorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.error) {
      const error = Object.assign(new Error(response.error.message), {
        name: response.error.name,
        code: response.error.code,
      });
      request.reject(error);
    } else request.resolve(response.result);
    finishDisposal();
  });
  function request(method: GitWorkerRequest['method'], args: unknown[]) {
    if (disposed) return Promise.reject(new Error('Git repository has been closed.'));
    return new Promise<unknown>((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, method, args, authentication } satisfies GitWorkerRequest);
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  }
  try {
    await request('open', [directory]);
  } catch (error) {
    disposed = true;
    worker.terminate();
    // Older browsers or virtual handles may not support structured cloning.
    if (error instanceof DOMException && error.name === 'DataCloneError') return fallback();
    throw error;
  }
  return new Proxy({} as GitClient, {
    get(_, method: keyof GitClient) {
      if (method === 'dispose')
        return () => {
          disposed = true;
          authentication = { username: '', token: '' };
          finishDisposal();
        };
      if (method === 'authenticate')
        return (username: string, token: string) => {
          authentication = { username, token };
        };
      // Promise resolution probes `then`; the client itself is not a promise.
      if (String(method) === 'then') return undefined;
      return (...args: unknown[]) => request(method, args);
    },
  });
}

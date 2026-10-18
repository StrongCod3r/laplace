import { WorkspaceGitClient } from './git-client';
import { createDirectoryFs, type DirectoryHandle } from './directory-fs';
import type { GitWorkerRequest, GitWorkerResponse } from './git-worker-client';
import { diffLines } from './line-diff';

const methods = new Set([
  'clone',
  'initialize',
  'configure',
  'loadAutoCommitSettings',
  'saveAutoCommitSettings',
  'status',
  'repositoryInfo',
  'fetchStatus',
  'commit',
  'stageFiles',
  'unstageFiles',
  'discardChanges',
  'push',
  'synchronize',
  'preview',
]);
let client: WorkspaceGitClient | null = null;
let queue = Promise.resolve();

addEventListener('message', (event: MessageEvent<GitWorkerRequest>) => {
  const request = event.data;
  // Serialize all reads and writes so previews/refreshes cannot race a commit.
  queue = queue.then(async () => {
    const response: GitWorkerResponse = { id: request.id };
    try {
      if (request.method === 'open') {
        client = new WorkspaceGitClient(createDirectoryFs(request.args[0] as DirectoryHandle));
      } else {
        if (!client || !methods.has(request.method)) throw new Error('Invalid Git operation.');
        if (request.authentication)
          client.authenticate(request.authentication.username, request.authentication.token);
        const operation = client[request.method] as (...args: unknown[]) => unknown;
        response.result = await operation.apply(client, request.args);
        if (request.method === 'preview') {
          const content = response.result as Awaited<ReturnType<WorkspaceGitClient['preview']>>;
          response.result = {
            ...content,
            lines: content.binary ? [] : diffLines(content.before, content.after),
          };
        }
      }
    } catch (cause) {
      const error = cause as Error & { code?: string };
      response.error = {
        message: error.message || 'Git operation failed.',
        name: error.name || 'Error',
        code: error.code,
      };
    }
    postMessage(response);
  });
});

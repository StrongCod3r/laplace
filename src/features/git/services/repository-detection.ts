import type { DirectoryHandle } from './directory-fs';
import type { GitStatus } from './git-client';

/** Check the selected workspace before loading the Git worker or its dependencies. */
export async function hasGitRepository(directory: DirectoryHandle): Promise<boolean> {
  try {
    await directory.getDirectoryHandle('.git');
    return true;
  } catch (cause) {
    const error = cause as Error & { code?: string };
    if (error.name === 'NotFoundError' || error.code === 'ENOENT') return false;
    if (error.name === 'TypeMismatchError')
      throw new Error('Linked worktrees with a .git file require desktop Git.');
    throw cause;
  }
}

export function emptyGitStatus(): GitStatus {
  return {
    initialized: false,
    branch: null,
    remote: 'origin',
    remoteBranch: 'main',
    settings: { url: '', corsProxy: '', name: '', email: '' },
    changes: [],
    stagedChanges: [],
    unstagedChanges: [],
    outgoing: [],
    incoming: [],
    outgoingFiles: [],
    incomingFiles: [],
    headOid: null,
    remoteOid: null,
  };
}

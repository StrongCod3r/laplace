import type { DiffLine } from './services/line-diff';

export type GitComparison = 'local' | 'staged' | 'unstaged' | 'incoming' | 'outgoing';

export interface GitDiffDocument {
  id: string;
  workspaceId: string;
  path: string;
  comparison: GitComparison;
  state: 'loading' | 'ready' | 'error';
  before: string;
  after: string;
  binary: boolean;
  lines?: DiffLine[];
  error?: string;
}

export const comparisonLabels: Record<GitComparison, [string, string]> = {
  local: ['Last commit', 'Working tree'],
  staged: ['Last commit', 'Staged content'],
  unstaged: ['Staged content', 'Working tree'],
  outgoing: ['Merge base', 'Local commits'],
  incoming: ['Merge base', 'Remote commits'],
};

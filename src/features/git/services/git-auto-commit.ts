import { GIT_AUTO_COMMIT_KEY_PREFIX } from './../../../app-identity';
export interface GitAutoCommitSettings {
  enabled: boolean;
  autoPush: boolean;
  intervalMinutes: number;
  messageFormat: string;
}

export interface AutoCommitMessageValues {
  workspace: string;
  branch: string;
  date: Date;
}

export const DEFAULT_GIT_AUTO_COMMIT_SETTINGS: GitAutoCommitSettings = {
  enabled: false,
  autoPush: false,
  intervalMinutes: 30,
  messageFormat: 'Auto commit: {workspace} ({date} {time})',
};

export function validateGitAutoCommitSettings(
  settings: Pick<GitAutoCommitSettings, 'intervalMinutes' | 'messageFormat'>,
): string {
  if (
    !Number.isInteger(settings.intervalMinutes) ||
    settings.intervalMinutes < 1 ||
    settings.intervalMinutes > 10080
  )
    return 'Choose an interval between 1 minute and 7 days.';
  if (!settings.messageFormat.trim()) return 'Enter a commit message format.';
  if (settings.messageFormat.length > 500)
    return 'Keep the commit message format under 500 characters.';
  return '';
}

function storageKey(workspaceId: string) {
  return `${GIT_AUTO_COMMIT_KEY_PREFIX}${encodeURIComponent(workspaceId)}`;
}

export function loadGitAutoCommitSettings(workspaceId: string): GitAutoCommitSettings {
  return loadLegacyGitAutoCommitSettings(workspaceId) || { ...DEFAULT_GIT_AUTO_COMMIT_SETTINGS };
}

export function loadLegacyGitAutoCommitSettings(workspaceId: string): GitAutoCommitSettings | null {
  try {
    const raw = localStorage.getItem(storageKey(workspaceId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<GitAutoCommitSettings>;
    const settings = {
      enabled: saved.enabled === true,
      autoPush: saved.autoPush === true,
      intervalMinutes: Number(saved.intervalMinutes),
      messageFormat:
        typeof saved.messageFormat === 'string'
          ? saved.messageFormat
          : DEFAULT_GIT_AUTO_COMMIT_SETTINGS.messageFormat,
    };
    return validateGitAutoCommitSettings(settings)
      ? { ...DEFAULT_GIT_AUTO_COMMIT_SETTINGS }
      : settings;
  } catch {
    return { ...DEFAULT_GIT_AUTO_COMMIT_SETTINGS };
  }
}

export function clearLegacyGitAutoCommitSettings(workspaceId: string): void {
  try {
    localStorage.removeItem(storageKey(workspaceId));
  } catch {
    // Repository settings remain authoritative when browser storage is unavailable.
  }
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function formatAutoCommitMessage(format: string, values: AutoCommitMessageValues): string {
  const date = values.date;
  const replacements: Record<string, string> = {
    workspace: values.workspace.trim() || 'Workspace',
    branch: values.branch.trim() || 'branch',
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
  return format.replace(/\{(workspace|branch|date|time)\}/g, (_match, name: string) => {
    return replacements[name];
  });
}

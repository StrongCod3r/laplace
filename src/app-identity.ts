/** Shared identity for UI, persistence and generated app assets. */
export const APP_NAME = 'Laplace';
export const APP_ID = APP_NAME.toLowerCase();
export const APP_DIRECTORY = `.${APP_ID}`;
export const WORKSPACE_DATABASE_NAME = `${APP_ID}-local-workspace`;
export const CREDENTIALS_DATABASE_NAME = `${APP_ID}-git-credentials`;
export const STARTUP_THEME_KEY = `${APP_ID}-startup-theme`;
export const WORKSPACE_EXPORT_FILENAME = `${APP_ID}-workspace.json`;
export const DEFAULT_VAULT_NAME = `${APP_NAME} Vault`;
export const GIT_AUTO_COMMIT_KEY_PREFIX = `${APP_ID}:git:auto-commit:`;
const escapeRegExp = (value: string) =>
  Array.from(value)
    .map((character) => ('\\^$.*+?()[]{}|'.includes(character) ? '\\' + character : character))
    .join('');
export const APP_DIRECTORY_IGNORE_PATTERN = new RegExp(
  `^${escapeRegExp(APP_DIRECTORY)}/(?:\\r?\\n|$)`,
  'gm',
);
export const APP_FRONTMATTER_PATTERN = new RegExp(`^\\s*(?:${escapeRegExp(APP_ID)}|novera)\\s*:`);
export const APP_FRONTMATTER_VALUE_PATTERN = new RegExp(
  `^\\s*(?:${escapeRegExp(APP_ID)}|novera)\\s*:\\s*`,
);

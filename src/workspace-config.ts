/** Folder workspaces use fixed documents, independent of their internal IDs. */
export const APP_SETTING_KEYS = ['spellcheckEnabled', 'folderNotesEnabled'] as const;
export const APPEARANCE_KEYS = [
  'theme',
  'pageFont',
  'treeIconSize',
  'showCustomPageIcons',
  'showFilesAndTabIcons',
  'showBreadcrumbIcons',
] as const;

export function configObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid workspace configuration: expected an object.');
  return value as Record<string, unknown>;
}

export function pickConfig(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.fromEntries(
    keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]),
  );
}

export function splitWorkspaceConfig(value: unknown) {
  const workspace = { ...configObject(value) };
  const app = pickConfig(workspace, APP_SETTING_KEYS);
  const appearance = pickConfig(workspace, APPEARANCE_KEYS);
  const hotkeys = configObject(workspace.shortcuts ?? {});
  for (const key of [...APP_SETTING_KEYS, ...APPEARANCE_KEYS, 'shortcuts']) delete workspace[key];
  return { app, appearance, hotkeys, workspace };
}

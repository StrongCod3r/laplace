import { APP_DIRECTORY, WORKSPACE_DATABASE_NAME } from './app-identity';
export type StorageProvider = 'indexeddb';

export interface IndexedDbConfiguration {
  name: string;
  version: number;
  metaStore: string;
  vaultStore: string;
  attachmentStore: string;
  registryKey: string;
  appDirectory: string;
  appConfigFile: string;
  workspaceFile: string;
  appearanceFile: string;
  hotkeysFile: string;
  attachmentsDirectory: string;
}

export interface StorageConfiguration {
  provider: StorageProvider;
  indexeddb: IndexedDbConfiguration;
}

export const STORAGE_CONFIG: StorageConfiguration = Object.freeze({
  provider: 'indexeddb',
  indexeddb: Object.freeze({
    name: WORKSPACE_DATABASE_NAME,
    version: 3,
    metaStore: 'meta',
    vaultStore: 'vaults',
    attachmentStore: 'attachments',
    registryKey: 'registry',
    appDirectory: APP_DIRECTORY,
    appConfigFile: 'app.json',
    workspaceFile: 'workspace.json',
    appearanceFile: 'appearance.json',
    hotkeysFile: 'hotkeys.json',
    attachmentsDirectory: '.attachments',
  }),
});

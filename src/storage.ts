import { APP_NAME, APP_DIRECTORY } from './app-identity';
import type { IndexedDbConfiguration, StorageConfiguration, StorageProvider } from './config';
import {
  APP_SETTING_KEYS,
  APPEARANCE_KEYS,
  configObject,
  pickConfig,
  splitWorkspaceConfig,
} from './workspace-config';
import { notifyWorkspaceFileChanges } from './shared/lib/workspace-file-events';

const DEFAULT_FOLDER_ICON = 'lucide:folder';

export interface StorageGateway {
  readonly provider: StorageProvider;
  initialize(): Promise<void>;
  loadRegistry(): Promise<unknown | null>;
  saveRegistry(value: unknown): Promise<void>;
  loadWorkspace(vaultId: string): Promise<unknown | null>;
  saveWorkspace(vaultId: string, workspace: unknown): Promise<void>;
  cacheWorkspace(vaultId: string, workspace: unknown): Promise<void>;
  deleteWorkspace(vaultId: string): Promise<void>;
  clearBrowserWorkspace(): Promise<void>;
  selectDirectory?(): Promise<string>;
  pickDirectory?(): Promise<string>;
  activatePickedDirectory?(): Promise<string>;
  listWorkspaceLocations(): Promise<WorkspaceLocation[]>;
  removeWorkspaceLocation(id: string): Promise<void>;
  registerCurrentDirectoryWorkspace(): Promise<string>;
  requestWorkspaceLocationAccess(id: string): Promise<'none' | 'read' | 'readwrite'>;
  activateWorkspaceLocation(
    id: string,
    access?: 'none' | 'read' | 'readwrite',
  ): Promise<'none' | 'read' | 'readwrite'>;
  hasDirectory?(): boolean;
  getDirectoryPermission?(): Promise<'none' | 'read' | 'readwrite' | 'denied'>;
  requestDirectoryWritePermission?(): Promise<'none' | 'read' | 'readwrite' | 'denied'>;
  getDirectoryName?(): string | null;
  getGitDirectory?(): Promise<
    import('./features/git/services/directory-fs').DirectoryHandle | null
  >;
  readMarkdownFiles?(options?: {
    trackFiles?: boolean;
  }): Promise<{ files: MarkdownFile[]; directories: string[] }>;
  writeMarkdownFiles?(files: MarkdownFile[]): Promise<void>;
  writeAttachment(path: string, blob: Blob): Promise<string>;
  readAttachment(path: string): Promise<Blob | null>;
  deleteAttachment(path: string): Promise<void>;
  listAttachments(): Promise<AttachmentEntry[]>;
  createFolder?(path: string): Promise<void>;
  renameFolder?(fromPath: string, toPath: string): Promise<void>;
  copyFolder?(fromPath: string, toPath: string): Promise<void>;
  removeFolder?(path: string): Promise<void>;
}

export interface WorkspaceLocation {
  id: string;
  name: string;
  kind: 'browser' | 'directory';
  active: boolean;
}

export interface AttachmentEntry {
  path: string;
  name: string;
  size: number;
  type: string;
}

export interface MarkdownFile {
  path: string;
  content: string;
}

const INVALID_FILESYSTEM_NAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/;
const RESERVED_WINDOWS_DEVICE_NAME =
  /^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i;

export function hasForbiddenFilesystemNameCharacters(value: string): boolean {
  return INVALID_FILESYSTEM_NAME_CHARACTERS.test(String(value ?? ''));
}

export function validateFilesystemName(value: string, extensionBytes = 0): string | null {
  const name = String(value ?? '');
  if (!name.trim()) return 'A name cannot be empty.';
  if (name === '.' || name === '..') return 'A name cannot be "." or "..".';
  if (hasForbiddenFilesystemNameCharacters(name))
    return 'Names cannot contain < > : " / \\ | ? * or control characters.';
  if (/[. ]$/.test(name)) return 'Names cannot end in a dot or a space.';
  if (RESERVED_WINDOWS_DEVICE_NAME.test(name))
    return 'That name is reserved by Windows. Choose another name.';
  const maxNameBytes = Math.max(0, 255 - extensionBytes);
  if (new TextEncoder().encode(name).length > maxNameBytes) {
    return extensionBytes
      ? `A note name can use at most ${maxNameBytes} UTF-8 bytes before the .md extension.`
      : 'A name can use at most 255 UTF-8 bytes.';
  }
  return null;
}

type IndexedDbRecord = {
  key?: string;
  id?: string;
  workspaceId?: string | null;
  value?: unknown;
  workspace?: unknown;
  updatedAt?: string;
};

type SavedWorkspaceDirectory = { id: string; name: string; handle: any };
type WorkspaceLocationState = { activeId: string | null; directories: SavedWorkspaceDirectory[] };

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

class IndexedDbStorageGateway implements StorageGateway {
  readonly provider = 'indexeddb' as const;
  private databasePromise: Promise<IDBDatabase> | null = null;
  private directoryHandle: any = null;
  private pendingDirectoryHandle: any = null;
  private workspaceDirectoryHandles = new Map<string, any>();
  private knownMarkdownFiles: Map<string, string> | null = null;
  private activeWorkspaceId: string | null = null;
  private activeWorkspaceLocationId: string | null = null;
  private readonly directoryKey = 'selected-markdown-directory';
  private readonly workspaceLocationsKey = 'workspace-locations';
  private readonly browserRegistryKey = 'browser-workspace-registry';

  constructor(private readonly configuration: IndexedDbConfiguration) {}

  async initialize(): Promise<void> {
    await this.openDatabase();
    const locations = await this.readWorkspaceLocationState();
    const activeId = locations.activeId;
    this.activeWorkspaceLocationId = activeId;
    if (activeId === 'browser') this.directoryHandle = null;
    else {
      const savedDirectory = locations.directories.find((item) => item.id === activeId);
      const record = await this.read(this.configuration.metaStore, this.directoryKey);
      this.directoryHandle = savedDirectory?.handle ?? record?.value ?? null;
      if (this.directoryHandle && !activeId) this.activeWorkspaceLocationId = null;
      else if (!this.directoryHandle) this.activeWorkspaceLocationId = 'browser';
    }
    if (this.directoryHandle) {
      try {
        if ((await this.directoryHandle.queryPermission({ mode: 'readwrite' })) === 'granted') {
          await this.getDirectoryAtPath(
            this.directoryHandle,
            [this.configuration.appDirectory],
            true,
          );
          await this.getDirectoryAtPath(
            this.directoryHandle,
            [this.configuration.attachmentsDirectory],
            true,
          );
          await this.migrateLegacyAttachments();
        }
      } catch {
        /* Restore folder access from the UI when permission or migration is unavailable. */
      }
    }
  }

  async loadRegistry(): Promise<unknown | null> {
    if (this.directoryHandle) {
      try {
        const directoryValue = await this.readAppData([this.configuration.appConfigFile]);
        if (directoryValue !== null) {
          this.activeWorkspaceId = this.workspaceIdFromRegistry(directoryValue);
          return directoryValue;
        }
      } catch (error) {
        if ((error as DOMException)?.name !== 'NotFoundError') throw error;
      }
      // A selected directory is authoritative. Do not substitute a possibly stale
      // IndexedDB registry when its local config file is missing.
      return null;
    }
    const browserRecord = await this.read(this.configuration.metaStore, this.browserRegistryKey);
    const record =
      browserRecord ||
      (await this.read(this.configuration.metaStore, this.configuration.registryKey));
    this.activeWorkspaceId = this.workspaceIdFromRegistry(record?.value);
    if (!browserRecord && record?.value !== undefined) {
      await this.write(this.configuration.metaStore, {
        key: this.browserRegistryKey,
        value: record.value,
        updatedAt: new Date().toISOString(),
      });
    }
    return record?.value ?? null;
  }

  async saveRegistry(value: unknown): Promise<void> {
    if (this.directoryHandle) {
      if (Array.isArray((value as any)?.vaults) && (value as any).vaults.length > 1)
        throw new Error('A local folder can only contain one workspace.');
      const current = configObject(
        (await this.readOptionalAppData(this.configuration.appConfigFile)) ?? {},
      );
      await this.writeAppData([this.configuration.appConfigFile], {
        ...pickConfig(current, APP_SETTING_KEYS),
        ...configObject(value),
      });
    } else
      await this.write(this.configuration.metaStore, {
        key: this.browserRegistryKey,
        value,
        updatedAt: new Date().toISOString(),
      });
    this.activeWorkspaceId = this.workspaceIdFromRegistry(value);
    if (!this.directoryHandle)
      await this.write(this.configuration.metaStore, {
        key: this.configuration.registryKey,
        value,
        updatedAt: new Date().toISOString(),
      });
  }

  async loadWorkspace(vaultId: string): Promise<unknown | null> {
    if (this.directoryHandle) {
      try {
        const metadata = await this.readOptionalAppData(this.configuration.workspaceFile);
        const directoryValue =
          metadata === null
            ? null
            : {
                ...configObject(metadata),
                ...pickConfig(
                  configObject(
                    (await this.readOptionalAppData(this.configuration.appConfigFile)) ?? {},
                  ),
                  APP_SETTING_KEYS,
                ),
                ...pickConfig(
                  configObject(
                    (await this.readOptionalAppData(this.configuration.appearanceFile)) ?? {},
                  ),
                  APPEARANCE_KEYS,
                ),
                shortcuts: configObject(
                  (await this.readOptionalAppData(this.configuration.hotkeysFile)) ?? {},
                ),
              };
        if (directoryValue !== null) {
          await this.cacheWorkspace(vaultId, directoryValue);
          return directoryValue;
        }
      } catch (error) {
        if ((error as DOMException)?.name !== 'NotFoundError') throw error;
      }
      // The cache is only a mirror of this folder, never a fallback for it.
      return null;
    }
    const record =
      (await this.read(this.configuration.vaultStore, this.workspaceCacheKey(vaultId))) ??
      (await this.read(this.configuration.vaultStore, vaultId));
    if (!record) return null;
    const cachedWorkspaceId = typeof record.workspaceId === 'string' ? record.workspaceId : null;
    if (
      cachedWorkspaceId &&
      this.activeWorkspaceId &&
      cachedWorkspaceId !== this.activeWorkspaceId
    ) {
      // Legacy cache keys were shared by all folder workspaces. Ignore a record
      // owned by another workspace instead of exposing or overwriting its data.
      return null;
    }
    // Migrate matching legacy browser records to a workspace-scoped key.
    if (record.id === vaultId && this.activeWorkspaceId) {
      await this.write(this.configuration.vaultStore, {
        ...record,
        id: this.workspaceCacheKey(vaultId),
        workspaceId: cachedWorkspaceId || this.activeWorkspaceId,
      });
    }
    return record?.workspace ?? null;
  }

  async saveWorkspace(vaultId: string, workspace: unknown): Promise<void> {
    const persistedWorkspace = this.workspaceForPersistence(workspace);
    if (this.directoryHandle) {
      const documents = splitWorkspaceConfig(persistedWorkspace);
      const currentApp = configObject(
        (await this.readOptionalAppData(this.configuration.appConfigFile)) ?? {},
      );
      await this.writeAppData([this.configuration.appConfigFile], {
        ...currentApp,
        ...documents.app,
      });
      await this.writeAppData([this.configuration.appearanceFile], documents.appearance);
      await this.writeAppData([this.configuration.hotkeysFile], documents.hotkeys);
      await this.writeAppData([this.configuration.workspaceFile], documents.workspace);
    } else
      await this.write(this.configuration.vaultStore, {
        id: this.workspaceCacheKey(vaultId),
        workspaceId: this.activeWorkspaceId,
        workspace: persistedWorkspace,
        updatedAt: new Date().toISOString(),
      });
  }

  async cacheWorkspace(vaultId: string, workspace: unknown): Promise<void> {
    if (this.directoryHandle) return;
    const persistedWorkspace = this.workspaceForPersistence(workspace);
    await this.write(this.configuration.vaultStore, {
      id: this.workspaceCacheKey(vaultId),
      workspaceId: this.activeWorkspaceId,
      workspace: persistedWorkspace,
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteWorkspace(vaultId: string): Promise<void> {
    if (this.directoryHandle) {
      for (const name of [
        this.configuration.workspaceFile,
        this.configuration.appearanceFile,
        this.configuration.hotkeysFile,
      ]) {
        try {
          await this.removeAppData([name]);
        } catch (error) {
          if ((error as DOMException)?.name !== 'NotFoundError') throw error;
        }
      }
    }
    if (!this.directoryHandle) {
      const keys = [this.workspaceCacheKey(vaultId)];
      const legacyRecord = await this.read(this.configuration.vaultStore, vaultId);
      if (
        !legacyRecord ||
        !legacyRecord.workspaceId ||
        legacyRecord.workspaceId === this.activeWorkspaceId
      )
        keys.push(vaultId);
      const database = await this.openDatabase();
      const transaction = database.transaction(this.configuration.vaultStore, 'readwrite');
      const complete = transactionDone(transaction);
      for (const key of keys) transaction.objectStore(this.configuration.vaultStore).delete(key);
      await complete;
    }
  }

  async clearBrowserWorkspace(): Promise<void> {
    if (this.directoryHandle) throw new Error('Switch to Browser storage before clearing it.');

    const database = await this.openDatabase();
    const transaction = database.transaction(
      [
        this.configuration.metaStore,
        this.configuration.vaultStore,
        this.configuration.attachmentStore,
      ],
      'readwrite',
    );
    const complete = transactionDone(transaction);
    const meta = transaction.objectStore(this.configuration.metaStore);
    transaction.objectStore(this.configuration.vaultStore).clear();
    transaction.objectStore(this.configuration.attachmentStore).clear();
    meta.delete(this.browserRegistryKey);
    meta.delete(this.configuration.registryKey);
    await complete;

    const locations = await this.readWorkspaceLocationState();
    await this.saveWorkspaceLocationState({
      activeId: 'browser',
      directories: locations.directories,
    });
    await this.write(this.configuration.metaStore, {
      key: this.directoryKey,
      value: null,
      updatedAt: new Date().toISOString(),
    });
    this.directoryHandle = null;
    this.activeWorkspaceId = null;
    this.activeWorkspaceLocationId = 'browser';
    this.knownMarkdownFiles = null;
  }

  hasDirectory(): boolean {
    return !!this.directoryHandle;
  }

  async getDirectoryPermission(): Promise<'none' | 'read' | 'readwrite' | 'denied'> {
    if (!this.directoryHandle) return 'none';
    try {
      if ((await this.directoryHandle.queryPermission({ mode: 'readwrite' })) === 'granted')
        return 'readwrite';
      if ((await this.directoryHandle.queryPermission({ mode: 'read' })) === 'granted')
        return 'read';
      return 'denied';
    } catch {
      return 'denied';
    }
  }

  async requestDirectoryWritePermission(): Promise<'none' | 'read' | 'readwrite' | 'denied'> {
    if (!this.directoryHandle) return 'none';
    const permission = await this.directoryHandle.requestPermission({ mode: 'readwrite' });
    if (permission === 'granted') return 'readwrite';
    return this.getDirectoryPermission();
  }

  getDirectoryName(): string | null {
    return this.directoryHandle?.name || null;
  }

  async listWorkspaceLocations(): Promise<WorkspaceLocation[]> {
    const state = await this.readWorkspaceLocationState();
    this.workspaceDirectoryHandles = new Map(
      state.directories.map((item) => [item.id, item.handle]),
    );
    const activeId = this.directoryHandle
      ? this.activeWorkspaceLocationId || state.activeId
      : 'browser';
    return [
      { id: 'browser', name: 'Browser storage', kind: 'browser', active: activeId === 'browser' },
      ...state.directories.map((item) => ({
        id: item.id,
        name: item.name || item.handle?.name || 'Local workspace',
        kind: 'directory' as const,
        active: item.id === activeId,
      })),
    ];
  }

  async removeWorkspaceLocation(id: string): Promise<void> {
    if (id === 'browser') throw new Error('Browser storage cannot be removed.');
    const state = await this.readWorkspaceLocationState();
    if (state.activeId === id || this.activeWorkspaceLocationId === id)
      throw new Error('Switch to another workspace before closing this one.');
    const directories = state.directories.filter((item) => item.id !== id);
    if (directories.length === state.directories.length) return;
    await this.saveWorkspaceLocationState({ activeId: state.activeId, directories });
    this.workspaceDirectoryHandles = new Map(directories.map((item) => [item.id, item.handle]));
  }

  async registerCurrentDirectoryWorkspace(): Promise<string> {
    if (!this.directoryHandle) return 'browser';
    const state = await this.readWorkspaceLocationState();
    let existing: SavedWorkspaceDirectory | undefined;
    for (const item of state.directories) {
      if (await this.sameDirectoryHandle(item.handle, this.directoryHandle)) {
        existing = item;
        break;
      }
    }
    const id =
      existing?.id ||
      `workspace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const directories = state.directories.filter((item) => item.id !== id);
    directories.push({
      id,
      name: this.directoryHandle.name || existing?.name || 'Local workspace',
      handle: this.directoryHandle,
    });
    await this.saveWorkspaceLocationState({ activeId: id, directories });
    return id;
  }

  async requestWorkspaceLocationAccess(id: string): Promise<'none' | 'read' | 'readwrite'> {
    if (id === 'browser') return 'none';
    const handle =
      this.workspaceDirectoryHandles.get(id) ||
      (await this.readWorkspaceLocationState()).directories.find((item) => item.id === id)?.handle;
    if (!handle)
      throw new Error(
        'This workspace folder is no longer available. Add it again to reconnect it.',
      );
    let permission = await handle.queryPermission?.({ mode: 'readwrite' });
    if (permission !== 'granted' && handle.requestPermission)
      permission = await handle.requestPermission({ mode: 'readwrite' });
    if (permission === 'granted') return 'readwrite';
    const readPermission = await handle.queryPermission?.({ mode: 'read' });
    if (readPermission === 'granted') return 'read';
    throw new Error(
      'Folder access was not granted. Choose this workspace folder again to reconnect it.',
    );
  }

  async activateWorkspaceLocation(
    id: string,
    requestedAccess?: 'none' | 'read' | 'readwrite',
  ): Promise<'none' | 'read' | 'readwrite'> {
    const state = await this.readWorkspaceLocationState();
    if (id === 'browser') {
      const browserRegistry = await this.read(
        this.configuration.metaStore,
        this.browserRegistryKey,
      );
      if (!browserRegistry)
        await this.write(this.configuration.metaStore, {
          key: this.browserRegistryKey,
          value: null,
          updatedAt: new Date().toISOString(),
        });
      const previousHandle = this.directoryHandle,
        previousWorkspaceId = this.activeWorkspaceId,
        previousLocationId = this.activeWorkspaceLocationId,
        previousMarkdownFiles = this.knownMarkdownFiles;
      try {
        this.directoryHandle = null;
        this.activeWorkspaceId = null;
        this.knownMarkdownFiles = null;
        await this.write(this.configuration.metaStore, {
          key: this.directoryKey,
          value: null,
          updatedAt: new Date().toISOString(),
        });
        await this.saveWorkspaceLocationState({
          activeId: 'browser',
          directories: state.directories,
        });
      } catch (error) {
        this.directoryHandle = previousHandle;
        this.activeWorkspaceId = previousWorkspaceId;
        this.activeWorkspaceLocationId = previousLocationId;
        this.knownMarkdownFiles = previousMarkdownFiles;
        try {
          await this.write(this.configuration.metaStore, {
            key: this.directoryKey,
            value: previousHandle,
            updatedAt: new Date().toISOString(),
          });
          await this.saveWorkspaceLocationState({
            activeId: previousLocationId,
            directories: state.directories,
          });
        } catch {
          /* Keep the previous in-memory workspace active if IndexedDB recovery fails. */
        }
        throw error;
      }
      return 'none';
    }

    const location = state.directories.find((item) => item.id === id);
    if (!location?.handle)
      throw new Error(
        'This workspace folder is no longer available. Add it again to reconnect it.',
      );
    const access =
      requestedAccess && requestedAccess !== 'none'
        ? requestedAccess
        : await this.requestWorkspaceLocationAccess(id);

    const previousHandle = this.directoryHandle,
      previousWorkspaceId = this.activeWorkspaceId,
      previousLocationId = this.activeWorkspaceLocationId,
      previousMarkdownFiles = this.knownMarkdownFiles;
    try {
      this.directoryHandle = location.handle;
      this.activeWorkspaceId = null;
      this.activeWorkspaceLocationId = location.id;
      this.knownMarkdownFiles = null;
      await this.write(this.configuration.metaStore, {
        key: this.directoryKey,
        value: location.handle,
        updatedAt: new Date().toISOString(),
      });
      await this.saveWorkspaceLocationState({
        activeId: location.id,
        directories: state.directories,
      });
      if (access === 'readwrite') {
        await this.getDirectoryAtPath(location.handle, [this.configuration.appDirectory], true);
        await this.getDirectoryAtPath(
          location.handle,
          [this.configuration.attachmentsDirectory],
          true,
        );
        await this.migrateLegacyAttachments();
      }
      await navigator.storage?.persist?.();
    } catch (error) {
      this.directoryHandle = previousHandle;
      this.activeWorkspaceId = previousWorkspaceId;
      this.activeWorkspaceLocationId = previousLocationId;
      this.knownMarkdownFiles = previousMarkdownFiles;
      try {
        await this.write(this.configuration.metaStore, {
          key: this.directoryKey,
          value: previousHandle,
          updatedAt: new Date().toISOString(),
        });
        await this.saveWorkspaceLocationState({
          activeId: previousLocationId,
          directories: state.directories,
        });
      } catch {
        /* Keep the previous in-memory workspace active if IndexedDB recovery fails. */
      }
      throw error;
    }
    return access;
  }

  async pickDirectory(): Promise<string> {
    const picker = (window as any).showDirectoryPicker;
    if (!picker)
      throw new Error(
        'Folder access is not supported in this browser. Use a current version of Chrome or Edge.',
      );
    const handle = await picker({ mode: 'readwrite' });
    const permission = await handle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') throw new Error('Folder access was not granted.');
    this.pendingDirectoryHandle = handle;
    return handle.name;
  }

  async activatePickedDirectory(): Promise<string> {
    const handle = this.pendingDirectoryHandle;
    if (!handle) throw new Error('Choose a workspace folder before activating it.');
    this.pendingDirectoryHandle = null;
    const previousHandle = this.directoryHandle;
    const previousWorkspaceId = this.activeWorkspaceId;
    const previousLocationId = this.activeWorkspaceLocationId;
    const previousMarkdownFiles = this.knownMarkdownFiles;
    this.directoryHandle = handle;
    this.activeWorkspaceId = null;
    this.knownMarkdownFiles = null;
    try {
      await this.getDirectoryAtPath(handle, [this.configuration.appDirectory], true);
      await this.getDirectoryAtPath(handle, [this.configuration.attachmentsDirectory], true);
      await this.migrateLegacyAttachments();
      const locations = await this.readWorkspaceLocationState();
      let existing: SavedWorkspaceDirectory | undefined;
      for (const item of locations.directories) {
        if (await this.sameDirectoryHandle(item.handle, handle)) {
          existing = item;
          break;
        }
      }
      this.activeWorkspaceLocationId = existing?.id || null;
      await this.write(this.configuration.metaStore, {
        key: this.directoryKey,
        value: handle,
        updatedAt: new Date().toISOString(),
      });
      await this.saveWorkspaceLocationState({
        activeId: existing?.id || null,
        directories: locations.directories,
      });
    } catch (error) {
      this.directoryHandle = previousHandle;
      this.activeWorkspaceId = previousWorkspaceId;
      this.activeWorkspaceLocationId = previousLocationId;
      this.knownMarkdownFiles = previousMarkdownFiles;
      try {
        await this.write(this.configuration.metaStore, {
          key: this.directoryKey,
          value: previousHandle,
          updatedAt: new Date().toISOString(),
        });
        const locations = await this.readWorkspaceLocationState();
        await this.saveWorkspaceLocationState({
          activeId: previousLocationId,
          directories: locations.directories,
        });
      } catch {
        /* Keep the previous in-memory workspace active if IndexedDB recovery fails. */
      }
      throw error;
    }
    await navigator.storage?.persist?.();
    return handle.name;
  }

  async selectDirectory(): Promise<string> {
    await this.pickDirectory();
    return this.activatePickedDirectory();
  }

  async readMarkdownFiles(options?: {
    trackFiles?: boolean;
  }): Promise<{ files: MarkdownFile[]; directories: string[] }> {
    const root = await this.getDirectoryHandle('read');
    const files: MarkdownFile[] = [];
    const directories: string[] = [];
    const visit = async (directory: any, prefix: string): Promise<void> => {
      for await (const [name, entry] of directory.entries()) {
        const path = prefix ? `${prefix}/${name}` : name;
        if (entry.kind === 'directory') {
          const rootName = name.toLocaleLowerCase();
          if (
            !prefix &&
            [
              '.git',
              '.obsidian',
              '.trash',
              this.configuration.appDirectory.toLocaleLowerCase(),
              this.configuration.attachmentsDirectory.toLocaleLowerCase(),
              'attachments',
            ].includes(rootName)
          )
            continue;
          directories.push(path);
          await visit(entry, path);
        } else if (name.toLowerCase().endsWith('.md')) {
          const file = await entry.getFile();
          files.push({ path, content: await file.text() });
        }
      }
    };
    await visit(root, '');
    if (options?.trackFiles !== false)
      this.knownMarkdownFiles = new Map(
        files.map((file) => [file.path, file.content] as [string, string]),
      );
    return { files, directories };
  }

  async getGitDirectory() {
    if (!this.directoryHandle) return null;
    return this.getDirectoryHandle('read');
  }

  async writeAttachment(path: string, blob: Blob): Promise<string> {
    const normalized = canonicalAttachmentPath(path, this.configuration.attachmentsDirectory);
    if (this.directoryHandle) {
      const root = await this.getDirectoryHandle('readwrite');
      const workspaceId = this.activeWorkspaceLocationId;
      const parts = normalized.split('/');
      const name = parts.pop()!;
      const directory = await this.getDirectoryAtPath(root, parts, true);
      const handle = await directory.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      notifyWorkspaceFileChanges(workspaceId);
      return normalized;
    }
    await this.write(this.configuration.attachmentStore, {
      key: normalized,
      value: blob,
      updatedAt: new Date().toISOString(),
    });
    return normalized;
  }

  async readAttachment(path: string): Promise<Blob | null> {
    const normalized = canonicalAttachmentPath(path, this.configuration.attachmentsDirectory);
    const paths = attachmentPathAliases(normalized, this.configuration.attachmentsDirectory);
    if (this.directoryHandle) {
      for (const candidate of paths) {
        try {
          const root = await this.getDirectoryHandle('read');
          const parts = candidate.split('/');
          const name = parts.pop()!;
          const directory = await this.getDirectoryAtPath(root, parts, false);
          const handle = await directory.getFileHandle(name);
          return await handle.getFile();
        } catch (error) {
          if ((error as DOMException)?.name === 'NotFoundError') continue;
          throw error;
        }
      }
      return null;
    }
    for (const candidate of paths) {
      const record = await this.read(this.configuration.attachmentStore, candidate);
      if (record?.value instanceof Blob) return record.value;
    }
    return null;
  }

  async deleteAttachment(path: string): Promise<void> {
    const normalized = canonicalAttachmentPath(path, this.configuration.attachmentsDirectory);
    const attachmentPrefix = `${this.configuration.attachmentsDirectory}/`;
    if (!normalized.toLocaleLowerCase().startsWith(attachmentPrefix.toLocaleLowerCase()))
      throw new Error('Only files inside the attachments folder can be deleted here.');

    if (this.directoryHandle) {
      const parts = normalized.split('/');
      const name = parts.pop();
      if (!name) throw new Error('Invalid attachment path.');
      const root = await this.getDirectoryHandle('readwrite');
      const workspaceId = this.activeWorkspaceLocationId;
      const directory = await this.getDirectoryAtPath(root, parts, false);
      await directory.removeEntry(name);
      notifyWorkspaceFileChanges(workspaceId);
      return;
    }

    const database = await this.openDatabase();
    if (!database.objectStoreNames.contains(this.configuration.attachmentStore)) return;
    const transaction = database.transaction(this.configuration.attachmentStore, 'readwrite');
    const complete = transactionDone(transaction);
    const store = transaction.objectStore(this.configuration.attachmentStore);
    for (const alias of attachmentPathAliases(normalized, this.configuration.attachmentsDirectory))
      store.delete(alias);
    await complete;
  }

  async listAttachments(): Promise<AttachmentEntry[]> {
    const entries: AttachmentEntry[] = [];
    const attachmentPrefix = `${this.configuration.attachmentsDirectory}/`;
    if (this.directoryHandle) {
      const root = await this.getDirectoryHandle('read');
      let attachments: any;
      try {
        attachments = await root.getDirectoryHandle(this.configuration.attachmentsDirectory);
      } catch (error) {
        if ((error as DOMException)?.name === 'NotFoundError') return [];
        throw error;
      }
      const visit = async (directory: any, prefix: string): Promise<void> => {
        for await (const [name, entry] of directory.entries()) {
          const path = `${prefix}/${name}`;
          if (entry.kind === 'directory') {
            await visit(entry, path);
            continue;
          }
          const file = await entry.getFile();
          entries.push({
            path,
            name,
            size: file.size,
            type: file.type || 'application/octet-stream',
          });
        }
      };
      await visit(attachments, this.configuration.attachmentsDirectory);
    } else {
      for (const record of await this.readAllAttachments()) {
        if (typeof record.key !== 'string' || !(record.value instanceof Blob)) continue;
        let path: string;
        try {
          path = canonicalAttachmentPath(record.key, this.configuration.attachmentsDirectory);
        } catch {
          continue;
        }
        if (!path.toLocaleLowerCase().startsWith(attachmentPrefix.toLocaleLowerCase())) continue;
        entries.push({
          path,
          name: path.split('/').at(-1) || path,
          size: record.value.size,
          type: record.value.type || 'application/octet-stream',
        });
      }
    }
    return entries.sort((a, b) =>
      a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }),
    );
  }

  async writeMarkdownFiles(files: MarkdownFile[]): Promise<void> {
    const normalizedFiles = files.map((file) => ({
      ...file,
      path: normalizeRelativePath(file.path),
    }));
    const nextPaths = new Set(normalizedFiles.map((file) => file.path.toLocaleLowerCase()));
    if (nextPaths.has('')) throw new Error('A note needs a file name.');
    if (nextPaths.size !== normalizedFiles.length)
      throw new Error('Two notes cannot have the same name in the same folder.');
    for (const file of normalizedFiles) {
      const parts = file.path.split('/');
      if (parts.some((part) => !part || part === '.' || part === '..'))
        throw new Error(`Invalid note path: ${file.path}`);
      const fileName = parts.at(-1)!;
      if (!fileName.toLocaleLowerCase().endsWith('.md') || fileName.toLocaleLowerCase() === '.md') {
        throw new Error(`Notes need a name and the .md extension: ${file.path}`);
      }
      for (const part of parts.slice(0, -1)) {
        const validationError = validateFilesystemName(part);
        if (validationError)
          throw new Error(`Invalid note path "${file.path}": ${validationError}`);
      }
      const validationError = validateFilesystemName(fileName.slice(0, -3), 3);
      if (validationError) throw new Error(`Invalid note path "${file.path}": ${validationError}`);
    }
    const root = await this.getDirectoryHandle('readwrite');
    const workspaceId = this.activeWorkspaceLocationId;
    const existing = this.knownMarkdownFiles
      ? { files: [...this.knownMarkdownFiles].map(([path, content]) => ({ path, content })) }
      : await this.readMarkdownFiles();
    let changed = false;
    try {
      for (const file of normalizedFiles) {
        const path = file.path;
        if (existing.files.find((item) => item.path === path)?.content === file.content) continue;
        const parts = path.split('/');
        const name = parts.pop()!;
        const directory = await this.getDirectoryAtPath(root, parts, true);
        if (
          !existing.files.some((item) => item.path.toLocaleLowerCase() === path.toLocaleLowerCase())
        ) {
          for await (const [entryName] of directory.entries()) {
            if (entryName.toLocaleLowerCase() === name.toLocaleLowerCase()) {
              throw new Error(
                `A file named "${name}" appeared in the destination. Reload the workspace before continuing.`,
              );
            }
          }
        }
        const handle = await directory.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(file.content);
        await writable.close();
        changed = true;
      }
      for (const file of existing.files) {
        if (nextPaths.has(file.path.toLocaleLowerCase())) continue;
        const parts = file.path.split('/');
        const name = parts.pop()!;
        const directory = await this.getDirectoryAtPath(root, parts, false);
        try {
          await directory.removeEntry(name);
          changed = true;
        } catch (error) {
          if ((error as DOMException)?.name !== 'NotFoundError') throw error;
        }
      }
      this.knownMarkdownFiles = new Map(
        normalizedFiles.map((file) => [file.path, file.content] as [string, string]),
      );
    } finally {
      // Even a partially completed save can change Git status.
      if (changed) notifyWorkspaceFileChanges(workspaceId);
    }
  }

  async createFolder(path: string): Promise<void> {
    const parts = normalizeRelativePath(path).split('/').filter(Boolean);
    if (!parts.length || parts.some((part) => part === '.' || part === '..'))
      throw new Error('Enter a valid folder name.');
    for (const part of parts) {
      const validationError = validateFilesystemName(part);
      if (validationError) throw new Error(validationError);
    }
    const rootReservedNames = [
      this.configuration.attachmentsDirectory,
      this.configuration.appDirectory,
      'attachments',
    ];
    if (
      parts.length === 1 &&
      rootReservedNames.some((name) => name.toLocaleLowerCase() === parts[0].toLocaleLowerCase())
    ) {
      throw new Error('That folder name is reserved for app data or attachments.');
    }
    await this.getDirectoryAtPath(await this.getDirectoryHandle(), parts, true);
  }

  async renameFolder(fromPath: string, toPath: string): Promise<void> {
    await this.transferFolder(fromPath, toPath, false);
  }

  async copyFolder(fromPath: string, toPath: string): Promise<void> {
    await this.transferFolder(fromPath, toPath, true);
  }

  private async transferFolder(fromPath: string, toPath: string, copy: boolean): Promise<void> {
    const sourcePath = normalizeRelativePath(fromPath),
      targetPath = normalizeRelativePath(toPath);
    const sourceParts = sourcePath.split('/').filter(Boolean),
      targetParts = targetPath.split('/').filter(Boolean);
    if (
      !sourceParts.length ||
      !targetParts.length ||
      sourceParts.some((part) => part === '.' || part === '..') ||
      targetParts.some((part) => part === '.' || part === '..')
    ) {
      throw new Error('Choose valid source and destination folders.');
    }
    for (const part of targetParts) {
      const validationError = validateFilesystemName(part);
      if (validationError) throw new Error(validationError);
    }
    const rootReservedNames = [
      this.configuration.attachmentsDirectory,
      this.configuration.appDirectory,
      'attachments',
    ];
    if (
      targetParts.length === 1 &&
      rootReservedNames.some(
        (name) => name.toLocaleLowerCase() === targetParts[0].toLocaleLowerCase(),
      )
    ) {
      throw new Error('That folder name is reserved for app data or attachments.');
    }
    if (sourcePath === targetPath && !copy) return;
    if (
      targetPath.toLocaleLowerCase().startsWith(`${sourcePath.toLocaleLowerCase()}/`) ||
      (copy && sourcePath.toLocaleLowerCase() === targetPath.toLocaleLowerCase())
    ) {
      throw new Error('Cannot transfer a folder into itself.');
    }

    const root = await this.getDirectoryHandle();
    const workspaceId = this.activeWorkspaceLocationId;
    const sourceName = sourceParts.pop()!,
      targetName = targetParts.pop()!;
    const sourceParent = await this.getDirectoryAtPath(root, sourceParts, false);
    const targetParent = await this.getDirectoryAtPath(root, targetParts, true);
    const source = await sourceParent.getDirectoryHandle(sourceName);
    const samePathIgnoringCase = sourcePath.toLocaleLowerCase() === targetPath.toLocaleLowerCase();
    const copyContents = async (from: any, to: any): Promise<void> => {
      for await (const [name, entry] of from.entries()) {
        if (entry.kind === 'directory') {
          await copyContents(entry, await to.getDirectoryHandle(name, { create: true }));
          continue;
        }
        const file = await entry.getFile();
        const target = await to.getFileHandle(name, { create: true });
        const writable = await target.createWritable();
        await writable.write(file);
        await writable.close();
      }
    };
    const moveThroughTemporaryDirectory = async (
      fromName: string,
      toName: string,
    ): Promise<void> => {
      const temporaryName = `${APP_DIRECTORY}-rename-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const temporary = await sourceParent.getDirectoryHandle(temporaryName, { create: true });
      let sourceRemoved = false;
      try {
        await copyContents(source, temporary);
        await sourceParent.removeEntry(fromName, { recursive: true });
        sourceRemoved = true;
        const destination = await targetParent.getDirectoryHandle(toName, { create: true });
        await copyContents(temporary, destination);
        await sourceParent.removeEntry(temporaryName, { recursive: true });
      } catch (error) {
        try {
          if (sourceRemoved) await targetParent.removeEntry(toName, { recursive: true });
          const restored = await sourceParent.getDirectoryHandle(fromName, { create: true });
          await copyContents(temporary, restored);
          await sourceParent.removeEntry(temporaryName, { recursive: true });
        } catch {
          /* Keep the temporary copy if restoring the source is unavailable. */
        }
        throw error;
      }
    };

    if (samePathIgnoringCase) {
      await moveThroughTemporaryDirectory(sourceName, targetName);
    } else {
      try {
        await targetParent.getDirectoryHandle(targetName);
        throw new Error(`A folder named "${targetName}" already exists.`);
      } catch (error) {
        if ((error as DOMException)?.name !== 'NotFoundError') throw error;
      }
      const destination = await targetParent.getDirectoryHandle(targetName, { create: true });
      try {
        await copyContents(source, destination);
        if (!copy) await sourceParent.removeEntry(sourceName, { recursive: true });
      } catch (error) {
        try {
          await targetParent.removeEntry(targetName, { recursive: true });
        } catch {
          /* Preserve the source if cleanup fails. */
        }
        throw error;
      }
    }

    if (this.knownMarkdownFiles) {
      const oldPrefix = `${normalizeRelativePath(fromPath)}/`,
        newPrefix = `${normalizeRelativePath(toPath)}/`;
      const moved = new Map<string, string>();
      for (const [path, content] of this.knownMarkdownFiles) {
        if (copy) moved.set(path, content);
        moved.set(
          path.startsWith(oldPrefix) ? `${newPrefix}${path.slice(oldPrefix.length)}` : path,
          content,
        );
      }
      this.knownMarkdownFiles = moved;
    }
    notifyWorkspaceFileChanges(workspaceId);
  }

  async removeFolder(path: string): Promise<void> {
    const parts = normalizeRelativePath(path).split('/').filter(Boolean);
    if (!parts.length || parts.some((part) => part === '.' || part === '..'))
      throw new Error('Cannot remove the selected root folder.');
    const root = await this.getDirectoryHandle();
    const workspaceId = this.activeWorkspaceLocationId;
    const parent = await this.getDirectoryAtPath(root, parts.slice(0, -1), false);
    await parent.removeEntry(parts[parts.length - 1], { recursive: true });
    notifyWorkspaceFileChanges(workspaceId);
  }

  private async readWorkspaceLocationState(): Promise<WorkspaceLocationState> {
    const value = (await this.read(this.configuration.metaStore, this.workspaceLocationsKey))
      ?.value as any;
    const directories = Array.isArray(value?.directories)
      ? value.directories
          .filter((item: any) => item?.id && item?.handle)
          .map((item: any) => ({
            id: String(item.id),
            name: String(item.name || item.handle.name || 'Local workspace'),
            handle: item.handle,
          }))
      : [];
    return { activeId: typeof value?.activeId === 'string' ? value.activeId : null, directories };
  }

  private async saveWorkspaceLocationState(state: WorkspaceLocationState): Promise<void> {
    this.activeWorkspaceLocationId = state.activeId;
    await this.write(this.configuration.metaStore, {
      key: this.workspaceLocationsKey,
      value: state,
      updatedAt: new Date().toISOString(),
    });
  }

  private async sameDirectoryHandle(first: any, second: any): Promise<boolean> {
    if (first === second) return true;
    if (!first || !second) return false;
    try {
      if (typeof first.isSameEntry === 'function') return await first.isSameEntry(second);
      if (typeof second.isSameEntry === 'function') return await second.isSameEntry(first);
    } catch {
      return false;
    }
    return first.name === second.name;
  }

  private async getDirectoryHandle(mode: 'read' | 'readwrite' = 'readwrite'): Promise<any> {
    if (!this.directoryHandle) {
      const record = await this.read(this.configuration.metaStore, this.directoryKey);
      this.directoryHandle = record?.value ?? null;
    }
    if (!this.directoryHandle) throw new Error('Choose a folder to store your notes.');
    const permission = await this.directoryHandle.queryPermission({ mode });
    if (permission !== 'granted')
      throw new Error(
        mode === 'readwrite'
          ? 'Write access to the notes folder expired. Choose the folder again to reconnect it.'
          : 'Read access to the notes folder expired. Choose the folder again to reconnect it.',
      );
    return this.directoryHandle;
  }

  private async getDirectoryAtPath(root: any, parts: string[], create: boolean): Promise<any> {
    let current = root;
    for (const part of parts) current = await current.getDirectoryHandle(part, { create });
    return current;
  }

  private async readOptionalAppData(name: string): Promise<unknown | null> {
    try {
      return await this.readAppData([name]);
    } catch (error) {
      if ((error as DOMException)?.name === 'NotFoundError') return null;
      throw error;
    }
  }

  private workspaceCacheKey(vaultId: string): string {
    return `${this.activeWorkspaceId || 'browser'}:${vaultId}`;
  }

  private workspaceForPersistence(workspace: unknown): unknown {
    if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) return workspace;
    const value = workspace as Record<string, unknown>;
    if (!Array.isArray(value.pages)) return workspace;
    let changed = false;
    const pages = value.pages.map((page) => {
      if (!page || typeof page !== 'object' || Array.isArray(page)) return page;
      const metadata = { ...(page as Record<string, unknown>) };
      // In folder-backed workspaces, each note's Markdown is the source for its blocks.
      if (
        this.directoryHandle &&
        value.markdownFilesInitialized === true &&
        Object.prototype.hasOwnProperty.call(metadata, 'blocks')
      ) {
        delete metadata.blocks;
        changed = true;
      }
      return metadata;
    });
    const folders = Array.isArray(value.folders)
      ? value.folders.map((folder) => {
          if (!folder || typeof folder !== 'object' || Array.isArray(folder)) return folder;
          const metadata = { ...(folder as Record<string, unknown>) };
          if (metadata.icon === DEFAULT_FOLDER_ICON || metadata.icon === '📁') {
            delete metadata.icon;
            changed = true;
          }
          return metadata;
        })
      : value.folders;
    return changed ? { ...value, pages, folders } : workspace;
  }

  private workspaceIdFromRegistry(value: unknown): string | null {
    const id = (value as any)?.workspaceId;
    return typeof id === 'string' && id ? id : null;
  }

  private async readAppData(path: string[]): Promise<unknown | null> {
    const parts = [...path];
    const name = parts.pop();
    if (!name || parts.some((part) => !part || part === '.' || part === '..'))
      throw new Error('Invalid app data path.');
    const root = await this.getDirectoryHandle('read');
    const directory = await this.getDirectoryAtPath(
      root,
      [this.configuration.appDirectory, ...parts],
      false,
    );
    const file = await directory.getFileHandle(name);
    return JSON.parse(await (await file.getFile()).text());
  }

  private async writeAppData(path: string[], value: unknown): Promise<void> {
    const parts = [...path];
    const name = parts.pop();
    if (!name || parts.some((part) => !part || part === '.' || part === '..'))
      throw new Error('Invalid app data path.');
    const root = await this.getDirectoryHandle('readwrite');
    const directory = await this.getDirectoryAtPath(
      root,
      [this.configuration.appDirectory, ...parts],
      true,
    );
    const file = await directory.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    const serialized = JSON.stringify(value, null, 2);
    if (serialized === undefined) throw new Error('Could not serialize app data.');
    await writable.write(serialized);
    await writable.close();
  }

  private async removeAppData(path: string[]): Promise<void> {
    const parts = [...path];
    const name = parts.pop();
    if (!name || parts.some((part) => !part || part === '.' || part === '..'))
      throw new Error('Invalid app data path.');
    const root = await this.getDirectoryHandle('readwrite');
    const directory = await this.getDirectoryAtPath(
      root,
      [this.configuration.appDirectory, ...parts],
      false,
    );
    await directory.removeEntry(name);
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;

    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.configuration.name, this.configuration.version);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(this.configuration.metaStore)) {
          database.createObjectStore(this.configuration.metaStore, { keyPath: 'key' });
        }
        if (!database.objectStoreNames.contains(this.configuration.vaultStore)) {
          database.createObjectStore(this.configuration.vaultStore, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(this.configuration.attachmentStore)) {
          database.createObjectStore(this.configuration.attachmentStore, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'));
      request.onblocked = () =>
        reject(new Error(`IndexedDB upgrade is blocked by another ${APP_NAME} tab`));
    });

    return this.databasePromise;
  }

  private async read(storeName: string, key: string): Promise<IndexedDbRecord | undefined> {
    const database = await this.openDatabase();
    const transaction = database.transaction(storeName, 'readonly');
    const complete = transactionDone(transaction);
    const record = await requestResult(transaction.objectStore(storeName).get(key));
    await complete;
    return record as IndexedDbRecord | undefined;
  }

  private async write(storeName: string, value: IndexedDbRecord): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction(storeName, 'readwrite');
    const complete = transactionDone(transaction);
    transaction.objectStore(storeName).put(value);
    await complete;
  }

  private async migrateCachedAttachments(): Promise<void> {
    const records = await this.readAllAttachments();
    if (!records.length) return;
    const root = await this.getDirectoryHandle();
    for (const record of records) {
      if (typeof record.key !== 'string' || !(record.value instanceof Blob)) continue;
      const path = canonicalAttachmentPath(record.key, this.configuration.attachmentsDirectory);
      const parts = path.split('/');
      const name = parts.pop()!;
      const directory = await this.getDirectoryAtPath(root, parts, true);
      try {
        await directory.getFileHandle(name);
      } catch (error) {
        if ((error as DOMException)?.name !== 'NotFoundError') throw error;
        const handle = await directory.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(record.value);
        await writable.close();
      }
    }
  }

  private async migrateLegacyAttachments(): Promise<void> {
    const root = await this.getDirectoryHandle();
    let source: any;
    try {
      source = await root.getDirectoryHandle('attachments');
    } catch (error) {
      if ((error as DOMException)?.name === 'NotFoundError') return;
      throw error;
    }
    const destination = await root.getDirectoryHandle(this.configuration.attachmentsDirectory, {
      create: true,
    });
    let hasConflict = false;
    const copy = async (from: any, to: any): Promise<void> => {
      for await (const [name, entry] of from.entries()) {
        if (entry.kind === 'directory') {
          const child = await to.getDirectoryHandle(name, { create: true });
          await copy(entry, child);
          continue;
        }
        const file = await entry.getFile();
        let target: any;
        try {
          target = await to.getFileHandle(name);
        } catch (error) {
          if ((error as DOMException)?.name !== 'NotFoundError') throw error;
        }
        if (target) {
          const current = await target.getFile();
          if (current.size !== file.size || current.lastModified !== file.lastModified)
            hasConflict = true;
          continue;
        }
        target = await to.getFileHandle(name, { create: true });
        const writable = await target.createWritable();
        await writable.write(file);
        await writable.close();
      }
    };
    await copy(source, destination);
    if (!hasConflict) await root.removeEntry('attachments', { recursive: true });
  }

  private async readAllAttachments(): Promise<IndexedDbRecord[]> {
    const database = await this.openDatabase();
    if (!database.objectStoreNames.contains(this.configuration.attachmentStore)) return [];
    const transaction = database.transaction(this.configuration.attachmentStore, 'readonly');
    const complete = transactionDone(transaction);
    const records = await requestResult(
      transaction.objectStore(this.configuration.attachmentStore).getAll(),
    );
    await complete;
    return records as IndexedDbRecord[];
  }

  private async clearAttachmentCache(): Promise<void> {
    const database = await this.openDatabase();
    if (!database.objectStoreNames.contains(this.configuration.attachmentStore)) return;
    const transaction = database.transaction(this.configuration.attachmentStore, 'readwrite');
    const complete = transactionDone(transaction);
    transaction.objectStore(this.configuration.attachmentStore).clear();
    await complete;
  }
}

function normalizeRelativePath(path: string): string {
  return String(path || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

function validateAttachmentPath(path: string): string {
  const normalized = normalizeRelativePath(path);
  if (!normalized || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid attachment path: ${path}`);
  }
  return normalized;
}

function canonicalAttachmentPath(path: string, attachmentsDirectory: string): string {
  const normalized = validateAttachmentPath(path);
  if (normalized.toLocaleLowerCase().startsWith('attachments/')) {
    return `${attachmentsDirectory}/${normalized.slice('attachments/'.length)}`;
  }
  return normalized;
}

function attachmentPathAliases(path: string, attachmentsDirectory: string): string[] {
  const normalized = validateAttachmentPath(path);
  const aliases = [normalized];
  const attachmentPrefix = `${attachmentsDirectory}/`;
  if (normalized.toLocaleLowerCase().startsWith(attachmentPrefix.toLocaleLowerCase())) {
    aliases.push(`attachments/${normalized.slice(attachmentPrefix.length)}`);
  }
  return [...new Set(aliases)];
}

export function createStorageGateway(configuration: StorageConfiguration): StorageGateway {
  return new IndexedDbStorageGateway(configuration.indexeddb);
}

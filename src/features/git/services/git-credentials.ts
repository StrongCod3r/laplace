import { CREDENTIALS_DATABASE_NAME } from './../../../app-identity';
export interface GitAuthentication {
  username: string;
  token: string;
}

const databaseName = CREDENTIALS_DATABASE_NAME;
const keyId = 'authentication-key';
const empty = (): GitAuthentication => ({ username: '', token: '' });

export function credentialScope(workspaceId: string, repository: string): string | null {
  if (!repository.trim()) return null;
  try {
    const url = new URL(repository.trim());
    if (url.username || url.password) return null;
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return JSON.stringify([workspaceId, url.href]);
  } catch {
    return null;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('credentials');
      request.result.createObjectStore('keys');
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

function read<T>(database: IDBDatabase, store: string, id: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(store, 'readonly');
    const request = transaction.objectStore(store).get(id);
    transaction.oncomplete = () => resolve(request.result as T | undefined);
    transaction.onabort = () => reject(transaction.error);
  });
}

function write(database: IDBDatabase, id: string, record?: EncryptedCredentials): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('credentials', 'readwrite');
    const store = transaction.objectStore('credentials');
    if (record) store.put(record, id);
    else store.delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
}

async function encryptionKey(database: IDBDatabase): Promise<CryptoKey> {
  const existing = await read<CryptoKey>(database, 'keys', keyId);
  if (existing) return existing;
  const candidate = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  // Recheck inside a write transaction: simultaneous tabs must share the same key.
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('keys', 'readwrite');
    const store = transaction.objectStore('keys');
    const request = store.get(keyId);
    let key: CryptoKey;
    request.onsuccess = () => {
      key = request.result || candidate;
      if (!request.result) store.put(candidate, keyId);
    };
    transaction.oncomplete = () => resolve(key);
    transaction.onabort = () => reject(transaction.error);
  });
}

interface EncryptedCredentials {
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: ArrayBuffer;
}

export async function loadGitCredentials(
  workspaceId: string,
  repository: string,
): Promise<GitAuthentication> {
  const id = credentialScope(workspaceId, repository);
  if (!id) return empty();
  let database: IDBDatabase | undefined;
  try {
    database = await openDatabase();
    const record = await read<EncryptedCredentials>(database, 'credentials', id);
    if (!record) return empty();
    const key = await read<CryptoKey>(database, 'keys', keyId);
    if (!key) throw new Error('Missing key');
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: record.iv, additionalData: new TextEncoder().encode(id) },
      key,
      record.ciphertext,
    );
    const authentication = JSON.parse(new TextDecoder().decode(plaintext)) as GitAuthentication;
    if (typeof authentication.username !== 'string' || typeof authentication.token !== 'string')
      throw new Error('Invalid credentials');
    return authentication;
  } catch {
    throw new Error(
      'Could not restore Git credentials from this browser. Re-enter the token in Repository settings.',
    );
  } finally {
    database?.close();
  }
}

export async function saveGitCredentials(
  workspaceId: string,
  repository: string,
  authentication: GitAuthentication,
): Promise<void> {
  const id = credentialScope(workspaceId, repository);
  if (!id) {
    if (authentication.token)
      throw new Error('Enter a remote repository URL before saving an access token.');
    return;
  }
  let database: IDBDatabase | undefined;
  try {
    database = await openDatabase();
    if (!authentication.token) {
      await write(database, id);
      return;
    }
    const key = await encryptionKey(database);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(id) },
      key,
      new TextEncoder().encode(JSON.stringify(authentication)),
    );
    await write(database, id, { iv, ciphertext });
  } catch {
    throw new Error(
      'Could not save Git credentials on this device. Check browser storage settings and try again.',
    );
  } finally {
    database?.close();
  }
}

/** The subset of File System Access used by Git. Handles never expose absolute host paths. */
export interface DirectoryHandle {
  kind: 'directory';
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
  entries(): AsyncIterableIterator<[string, DirectoryHandle | FileHandle]>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
}

interface FileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: string | Uint8Array): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
}

function fsError(code: string, path: string) {
  return Object.assign(new Error(`${code}: ${path}`), { code });
}

/** A promise-based Node fs adapter rooted strictly in the selected workspace. */
export function createDirectoryFs(root: DirectoryHandle) {
  function parts(path: string) {
    if (!path.startsWith('/') || path.includes('\\') || path.includes('\0'))
      throw fsError('EINVAL', path);
    const result = path.split('/').filter((part) => part && part !== '.');
    if (result.some((part) => part === '..')) throw fsError('EINVAL', path);
    return result;
  }

  async function directory(segments: string[]) {
    let handle = root;
    for (const segment of segments) handle = await handle.getDirectoryHandle(segment);
    return handle;
  }

  async function mapped<T>(path: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const name = (error as Error).name;
      if (name === 'NotFoundError') throw fsError('ENOENT', path);
      if (name === 'TypeMismatchError') throw fsError('ENOTDIR', path);
      if (name === 'InvalidModificationError') throw fsError('ENOTEMPTY', path);
      throw error;
    }
  }

  async function entry(path: string): Promise<DirectoryHandle | FileHandle> {
    const segments = parts(path);
    if (!segments.length) return root;
    const parent = await directory(segments.slice(0, -1));
    try {
      return await parent.getFileHandle(segments.at(-1)!);
    } catch (error) {
      if ((error as Error).name !== 'TypeMismatchError') throw error;
      return parent.getDirectoryHandle(segments.at(-1)!);
    }
  }

  async function stat(path: string) {
    return mapped(path, async () => {
      const handle = await entry(path);
      const file = handle.kind === 'file' ? await handle.getFile() : null;
      const mtimeMs = file?.lastModified ?? 0;
      return {
        type: handle.kind,
        mode: file ? 0o100644 : 0o40755,
        size: file?.size ?? 0,
        mtimeMs,
        ctimeMs: mtimeMs,
        mtime: new Date(mtimeMs),
        ctime: new Date(mtimeMs),
        dev: 0,
        ino: 0,
        uid: 0,
        gid: 0,
        isFile: () => handle.kind === 'file',
        isDirectory: () => handle.kind === 'directory',
        isSymbolicLink: () => false,
      };
    });
  }

  return {
    promises: {
      stat,
      lstat: stat,
      readFile: (path: string, options?: string | { encoding?: string }) =>
        mapped(path, async () => {
          const handle = await entry(path);
          if (handle.kind !== 'file') throw fsError('EISDIR', path);
          const file = await handle.getFile();
          const encoding = typeof options === 'string' ? options : options?.encoding;
          return encoding ? file.text() : new Uint8Array(await file.arrayBuffer());
        }),
      writeFile: (path: string, data: string | Uint8Array) =>
        mapped(path, async () => {
          const segments = parts(path);
          if (!segments.length) throw fsError('EISDIR', path);
          const parent = await directory(segments.slice(0, -1));
          const handle = await parent.getFileHandle(segments.at(-1)!, { create: true });
          const writable = await handle.createWritable();
          try {
            await writable.write(data);
            await writable.close();
          } catch (error) {
            await writable.abort().catch(() => {});
            throw error;
          }
        }),
      readdir: (path: string) =>
        mapped(path, async () => {
          const handle = await directory(parts(path));
          const names: string[] = [];
          for await (const [name] of handle.entries()) names.push(name);
          return names;
        }),
      mkdir: (path: string) =>
        mapped(path, async () => {
          const segments = parts(path);
          if (!segments.length) throw fsError('EEXIST', path);
          const parent = await directory(segments.slice(0, -1));
          const name = segments.at(-1)!;
          try {
            await entry(path);
            throw fsError('EEXIST', path);
          } catch (error) {
            if ((error as Error).name !== 'NotFoundError') throw error;
          }
          await parent.getDirectoryHandle(name, { create: true });
        }),
      unlink: (path: string) =>
        mapped(path, async () => {
          const handle = await entry(path);
          if (handle.kind !== 'file') throw fsError('EISDIR', path);
          const segments = parts(path);
          await (await directory(segments.slice(0, -1))).removeEntry(segments.at(-1)!);
        }),
      rmdir: (path: string) =>
        mapped(path, async () => {
          const segments = parts(path);
          if (!segments.length) throw fsError('EPERM', path);
          if ((await entry(path)).kind !== 'directory') throw fsError('ENOTDIR', path);
          await (await directory(segments.slice(0, -1))).removeEntry(segments.at(-1)!);
        }),
      readlink: async (path: string): Promise<never> => {
        throw fsError('ENOTSUP', path);
      },
      symlink: async (_target: string, path: string): Promise<never> => {
        throw fsError('ENOTSUP', path);
      },
    },
  };
}

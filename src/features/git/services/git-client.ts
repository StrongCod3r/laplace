import { APP_ID, APP_DIRECTORY, APP_DIRECTORY_IGNORE_PATTERN } from './../../../app-identity';
import git, { type FsClient, type GitHttpRequest, type ReadCommitResult } from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { Buffer } from 'buffer';
import { connectionProxy } from './git-connection';
import type { GitComparison } from '../types';
import { validateGitAutoCommitSettings, type GitAutoCommitSettings } from './git-auto-commit';

// isomorphic-git expects Buffer in browser environments; load it only with this feature.
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;

export interface GitSettings {
  url: string;
  corsProxy: string;
  name: string;
  email: string;
}

export interface GitChange {
  path: string;
  kind: 'added' | 'modified' | 'deleted';
  marker?: 'added' | 'modified' | 'deleted' | 'untracked';
}

export interface GitStatus {
  initialized: boolean;
  branch: string | null;
  remote: string;
  remoteBranch: string;
  settings: GitSettings;
  changes: GitChange[];
  stagedChanges: GitChange[];
  unstagedChanges: GitChange[];
  outgoing: ReadCommitResult[];
  incoming: ReadCommitResult[];
  outgoingFiles: GitChange[];
  incomingFiles: GitChange[];
  remoteOid: string | null;
  headOid: string | null;
}

export function validateGitUrl(value: string, label = 'Repository') {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label}: enter a valid URL.`);
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
    throw new Error(`${label}: use an HTTPS URL (SSH is not available in the browser).`);
  if (url.username || url.password)
    throw new Error(`${label}: enter credentials in the access token field.`);
  return url.href;
}

/** Discover remote refs without reading or writing the workspace or saving credentials. */
export async function testGitConnection(
  settings: Pick<GitSettings, 'url' | 'corsProxy'>,
  authentication: { username: string; token: string },
  signal?: AbortSignal,
) {
  if (!settings.url.trim()) throw new Error('Enter the remote repository URL.');
  const url = validateGitUrl(settings.url.trim());
  const configuredProxy = settings.corsProxy.trim()
    ? validateGitUrl(settings.corsProxy.trim(), 'CORS proxy')
    : '';
  const corsProxy = connectionProxy(url, configuredProxy) || undefined;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 15_000);
  try {
    await git.listServerRefs({
      http: {
        request: (request: GitHttpRequest) =>
          http.request({ ...request, signal: controller.signal }),
      },
      url,
      corsProxy,
      prefix: 'refs/heads/',
      onAuth: () => ({
        username: authentication.username.trim() || 'git',
        password: authentication.token,
      }),
    });
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Connection test cancelled.', 'AbortError');
    if (timedOut) throw new Error('Connection timed out. Check the URL, network and CORS proxy.');
    const failure = error as { code?: string; data?: { statusCode?: number } };
    const status = failure.data?.statusCode;
    if (status === 401 || status === 403)
      throw new Error(
        'Access denied. Check the username, access token and repository permissions.',
      );
    if (status === 404)
      throw new Error('Repository not found. Check the URL and access credentials.');
    if (status)
      throw new Error(`The Git server returned HTTP ${status}. Check the URL or try again later.`);
    if (failure.code === 'SmartHttpError')
      throw new Error('The server did not return a Git repository. Check the repository URL.');
    // Avoid exposing server responses or URLs that may contain sensitive values.
    throw new Error('Unable to connect. Check the repository URL, network and CORS proxy.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export class WorkspaceGitClient {
  private base;
  private token = '';
  private username = '';
  private branchComparison: {
    key: string;
    value: Promise<Pick<GitStatus, 'outgoing' | 'incoming' | 'outgoingFiles' | 'incomingFiles'>>;
  } | null = null;

  constructor(
    private fs: Extract<FsClient, { promises: unknown }>,
    dir = '/',
  ) {
    this.base = { fs, dir };
  }

  authenticate(username: string, token: string) {
    this.username = username;
    this.token = token;
  }

  private async optionalRef(ref: string) {
    try {
      return await git.resolveRef({ ...this.base, ref });
    } catch (error) {
      if ((error as { code?: string }).code === 'NotFoundError') return null;
      throw error;
    }
  }

  async initialize() {
    const status = await this.repositoryInfo();
    if (status.initialized) throw new Error('The folder already contains a Git repository.');
    await git.init({ ...this.base, defaultBranch: 'main' });
    // App configuration is part of the workspace and should travel with Git.
    let ignore = '';
    try {
      ignore = String(
        await this.fs.promises!.readFile(`${this.base.dir.replace(/\/$/, '')}/.gitignore`, 'utf8'),
      );
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
    }
    ignore = ignore.replace(APP_DIRECTORY_IGNORE_PATTERN, '');
    const rules = ['.obsidian/', '.trash/'];
    const missing = rules.filter((rule) => !ignore.split(/\r?\n/).includes(rule));
    if (missing.length)
      await this.fs.promises!.writeFile(
        `${this.base.dir.replace(/\/$/, '')}/.gitignore`,
        `${ignore}${ignore && !ignore.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n`,
      );
  }

  async configure(settings: GitSettings) {
    const url = settings.url.trim() ? validateGitUrl(settings.url.trim()) : '';
    const proxy = settings.corsProxy.trim()
      ? validateGitUrl(settings.corsProxy.trim(), 'CORS proxy')
      : '';
    const status = await this.repositoryInfo();
    if (!status.initialized || !status.branch)
      throw new Error('Open a branch in a Git repository.');
    await git.setConfig({ ...this.base, path: `remote.${status.remote}.url`, value: url });
    await git.setConfig({
      ...this.base,
      path: `remote.${status.remote}.fetch`,
      value: `+refs/heads/*:refs/remotes/${status.remote}/*`,
    });
    await git.setConfig({
      ...this.base,
      path: `branch.${status.branch}.remote`,
      value: status.remote,
    });
    await git.setConfig({
      ...this.base,
      path: `branch.${status.branch}.merge`,
      value: `refs/heads/${status.remoteBranch}`,
    });
    await git.setConfig({ ...this.base, path: 'http.corsProxy', value: proxy });
    await git.setConfig({ ...this.base, path: 'user.name', value: settings.name.trim() });
    await git.setConfig({ ...this.base, path: 'user.email', value: settings.email.trim() });
  }

  async loadAutoCommitSettings(migrateLegacy = false): Promise<GitAutoCommitSettings | null> {
    if (!(await this.repositoryInfo()).initialized) return null;
    const path = `${this.base.dir.replace(/\/$/, '')}/${APP_DIRECTORY}/git-automation.json`;
    try {
      const settings = JSON.parse(String(await this.fs.promises!.readFile(path, 'utf8')));
      const error = validateGitAutoCommitSettings(settings);
      if (error) throw new Error(`Invalid automatic commit settings in ${path}: ${error}`);
      if (typeof settings.enabled !== 'boolean' || typeof settings.autoPush !== 'boolean')
        throw new Error(`Invalid automatic commit settings in ${path}.`);
      return settings;
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
    }

    // Settings saved by older versions lived in the local-only .git/config.
    const value = (key: string) => git.getConfig({ ...this.base, path: `${APP_ID}.${key}` });
    const enabled = await value('autoCommitEnabled');
    if (enabled === undefined) return null;
    const encodedFormat = await value('autoCommitMessageFormatEncoded');
    const legacy = {
      enabled: String(enabled) === 'true',
      autoPush: String(await value('autoPush')) === 'true',
      intervalMinutes: Number(await value('autoCommitIntervalMinutes')),
      messageFormat:
        encodedFormat !== undefined
          ? Buffer.from(String(encodedFormat), 'base64').toString('utf8')
          : String((await value('autoCommitMessageFormat')) ?? ''),
    };
    const error = validateGitAutoCommitSettings(legacy);
    if (error) throw new Error(`Invalid legacy automatic commit settings: ${error}`);
    if (migrateLegacy) await this.saveAutoCommitSettings(legacy);
    return legacy;
  }

  async saveAutoCommitSettings(settings: GitAutoCommitSettings) {
    const error = validateGitAutoCommitSettings(settings);
    if (error) throw new Error(error);
    if (!(await this.repositoryInfo()).initialized)
      throw new Error('Initialize the repository before configuring automatic commits.');
    const directory = `${this.base.dir.replace(/\/$/, '')}/${APP_DIRECTORY}`;
    try {
      await this.fs.promises!.mkdir(directory);
    } catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error;
    }
    await this.fs.promises!.writeFile(
      `${directory}/git-automation.json`,
      `${JSON.stringify(settings, null, 2)}\n`,
    );
  }

  private async tree(oid: string | null) {
    const files = new Map<string, string>();
    if (!oid) return files;
    const visit = async (treeOid: string, prefix: string) => {
      const { tree } = await git.readTree({ ...this.base, oid: treeOid });
      for (const item of tree) {
        const path = prefix + item.path;
        if (item.type === 'tree') await visit(item.oid, path + '/');
        else files.set(path, `${item.mode}:${item.oid}`);
      }
    };
    const { commit } = await git.readCommit({ ...this.base, oid });
    await visit(commit.tree, '');
    return files;
  }

  private async changedFiles(from: string | null, to: string | null): Promise<GitChange[]> {
    const [before, after] = await Promise.all([this.tree(from), this.tree(to)]);
    return [...new Set([...before.keys(), ...after.keys()])]
      .sort()
      .filter((path) => before.get(path) !== after.get(path))
      .map((path) => ({
        path,
        kind: !after.has(path) ? 'deleted' : !before.has(path) ? 'added' : 'modified',
      }));
  }

  private async assertReady() {
    for (const name of [
      'MERGE_HEAD',
      'CHERRY_PICK_HEAD',
      'REVERT_HEAD',
      'rebase-apply',
      'rebase-merge',
    ]) {
      try {
        await this.fs.promises.stat(`${this.base.dir.replace(/\/$/, '')}/.git/${name}`);
      } catch (error) {
        if ((error as { code?: string }).code === 'ENOENT') continue;
        throw error;
      }
      throw new Error(
        'There is a Git integration in progress. Finish it using desktop Git before committing or synchronizing.',
      );
    }
  }

  private async assertSupportedTree(oid: string | null) {
    const files = await this.tree(oid);
    if ([...files.values()].some((entry) => /^(120000|160000|100755):/.test(entry)))
      throw new Error(
        'The repository contains symbolic links, submodules or executable files. Use desktop Git to preserve them when synchronizing.',
      );
  }

  async repositoryInfo(remoteMissing = false): Promise<GitStatus> {
    const empty: GitStatus = {
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
    try {
      const stat = await this.fs.promises!.stat(`${this.base.dir.replace(/\/$/, '')}/.git`);
      if (!stat.isDirectory())
        throw new Error(
          'Linked worktrees with a .git file require desktop Git. Select a repository root with a .git directory.',
        );
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return empty;
      throw error;
    }
    await this.includeAppConfiguration();
    const branch = (await git.currentBranch(this.base)) ?? null;
    const config = async (path: string) =>
      String((await git.getConfig({ ...this.base, path })) ?? '');
    const remote = (branch && (await config(`branch.${branch}.remote`))) || 'origin';
    if (remote === '.')
      throw new Error('The branch tracks a local remote. Configure an HTTPS remote using Git.');
    const merge = branch ? await config(`branch.${branch}.merge`) : '';
    const remoteBranch = merge.replace(/^refs\/heads\//, '') || branch || 'main';
    const settings = {
      url: await config(`remote.${remote}.url`),
      corsProxy: await config('http.corsProxy'),
      name: await config('user.name'),
      email: await config('user.email'),
    };
    const headOid = await this.optionalRef('HEAD');
    const remoteOid = remoteMissing
      ? null
      : await this.optionalRef(`refs/remotes/${remote}/${remoteBranch}`);
    return {
      ...empty,
      initialized: true,
      branch,
      remote,
      remoteBranch,
      settings,
      headOid,
      remoteOid,
    };
  }

  private async workingStatus(remoteMissing = false): Promise<GitStatus> {
    const info = await this.repositoryInfo(remoteMissing);
    if (!info.initialized) return info;
    const matrix = await git.statusMatrix({ ...this.base, refresh: false });
    const changes: GitChange[] = matrix
      .filter(([, head, work, stage]) => head !== work || head !== stage)
      .map(([path, head, work, stage]) => ({
        path,
        kind: work === 0 ? 'deleted' : head === 0 ? 'added' : 'modified',
        ...(head === 0 && stage === 0 && work !== 0 ? { marker: 'untracked' as const } : {}),
      }));
    const stagedChanges: GitChange[] = matrix
      .filter(([, head, , stage]) => head !== stage)
      .map(([path, head, , stage]) => ({
        path,
        kind: stage === 0 ? 'deleted' : head === 0 ? 'added' : 'modified',
      }));
    const unstagedChanges: GitChange[] = matrix
      .filter(([, , work, stage]) => work !== stage)
      .map(([path, head, work, stage]) => ({
        path,
        kind: work === 0 ? 'deleted' : head === 0 && stage === 0 ? 'added' : 'modified',
        ...(head === 0 && stage === 0 && work !== 0 ? { marker: 'untracked' as const } : {}),
      }));
    return { ...info, changes, stagedChanges, unstagedChanges };
  }

  private async compareBranches(headOid: string | null, remoteOid: string | null) {
    if (headOid === remoteOid)
      return { outgoing: [], incoming: [], outgoingFiles: [], incomingFiles: [] };
    const [localLog, remoteLog] = await Promise.all([
      headOid ? git.log({ ...this.base, ref: headOid }) : [],
      remoteOid ? git.log({ ...this.base, ref: remoteOid }) : [],
    ]);
    const localIds = new Set(localLog.map((entry) => entry.oid));
    const remoteIds = new Set(remoteLog.map((entry) => entry.oid));
    const outgoing = localLog.filter((entry) => !remoteIds.has(entry.oid));
    const incoming = remoteLog.filter((entry) => !localIds.has(entry.oid));
    const bases =
      headOid && remoteOid
        ? await git.findMergeBase({ ...this.base, oids: [headOid, remoteOid] })
        : [];
    const baseOid = bases[0] ?? null;
    const [outgoingFiles, incomingFiles] = await Promise.all([
      outgoing.length ? this.changedFiles(baseOid, headOid) : [],
      incoming.length ? this.changedFiles(baseOid, remoteOid) : [],
    ]);
    return { outgoing, incoming, outgoingFiles, incomingFiles };
  }

  async status(remoteMissing = false): Promise<GitStatus> {
    const status = await this.workingStatus(remoteMissing);
    if (!status.initialized) return status;
    // Commits are immutable. Reuse history and committed file lists until refs change.
    const key = JSON.stringify([status.headOid, status.remoteOid]);
    if (this.branchComparison?.key !== key) {
      const value = this.compareBranches(status.headOid, status.remoteOid);
      this.branchComparison = { key, value };
      value.catch(() => {
        if (this.branchComparison?.value === value) this.branchComparison = null;
      });
    }
    return { ...status, ...(await this.branchComparison!.value) };
  }

  private async includeAppConfiguration() {
    const path = `${this.base.dir.replace(/\/$/, '')}/.gitignore`;
    let ignore: string;
    try {
      ignore = String(await this.fs.promises!.readFile(path, 'utf8'));
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return;
      throw error;
    }
    const updated = ignore.replace(APP_DIRECTORY_IGNORE_PATTERN, '');
    if (updated === ignore) return;
    try {
      await this.fs.promises!.writeFile(path, updated);
    } catch (error) {
      // A read-only workspace can still show its Git status; migrate the ignore rule
      // when the user next opens the repository with write access.
      if (
        ['NotAllowedError', 'NoModificationAllowedError'].includes((error as Error).name) ||
        (error as { code?: string }).code === 'EROFS'
      )
        return;
      throw error;
    }
  }

  private network(status: GitStatus) {
    if (!status.branch)
      throw new Error('HEAD is detached. Select a branch using Git before synchronizing.');
    if (!status.settings.url) throw new Error('Configure the remote repository URL.');
    validateGitUrl(status.settings.url);
    if (status.settings.corsProxy) validateGitUrl(status.settings.corsProxy, 'CORS proxy');
    return {
      ...this.base,
      http,
      url: status.settings.url,
      remote: status.remote,
      ref: status.branch,
      remoteRef: status.remoteBranch,
      corsProxy: connectionProxy(status.settings.url, status.settings.corsProxy) || undefined,
      onAuth: () => ({ username: this.username || 'git', password: this.token }),
    };
  }

  async fetchStatus() {
    const status = await this.repositoryInfo();
    const network = this.network(status);
    const refs = await git.listServerRefs({ ...network, prefix: 'refs/heads/' });
    const exists = refs.some((ref) => ref.ref === `refs/heads/${status.remoteBranch}`);
    if (exists) await git.fetch({ ...network, singleBranch: true, tags: false });
    return this.status(!exists);
  }

  async commit(message: string) {
    await this.assertReady();
    return this.commitChanges(message, await this.workingStatus());
  }

  private async commitChanges(message: string, status: GitStatus) {
    if (!status.branch) throw new Error('Select a branch before creating a commit.');
    if (!message.trim()) throw new Error('Enter a commit message.');
    if (!status.settings.name || !status.settings.email)
      throw new Error('Configure the author name and email.');
    if (!status.changes.length) return null;
    await this.assertSupportedTree(status.headOid);
    for (const change of status.changes) {
      if (change.kind === 'deleted') await git.remove({ ...this.base, filepath: change.path });
      else await git.add({ ...this.base, filepath: change.path });
    }
    const matrix = await git.statusMatrix({
      ...this.base,
      filepaths: status.changes.map((change) => change.path),
      refresh: false,
    });
    if (!matrix.some(([, head, , stage]) => head !== stage)) return null;
    return git.commit({
      ...this.base,
      message: message.trim(),
      author: { name: status.settings.name, email: status.settings.email },
    });
  }

  async push() {
    await this.assertReady();
    const status = await this.fetchStatus();
    if (status.outgoing.length && status.incoming.length)
      throw new Error(
        'The branches have diverged. Integrate the changes using desktop Git before pushing. Your local commits are preserved.',
      );
    await this.pushOutgoing(status);
    return this.status();
  }

  private async pushOutgoing(status: GitStatus) {
    if (!status.outgoing.length) return;
    const result = await git.push({ ...this.network(status), force: false });
    if (!result.ok || result.error)
      throw new Error(result.error || 'The remote rejected the push.');
  }

  async synchronize(message: string) {
    await this.assertReady();
    let status = await this.fetchStatus();
    if (status.outgoing.length && status.incoming.length)
      throw new Error(
        'The branches have diverged. Integrate the changes using desktop Git and fetch again. Your local files are preserved.',
      );
    if (status.incoming.length && status.changes.length)
      throw new Error(
        'There are remote changes and uncommitted local changes. Commit your local changes and integrate them using desktop Git before synchronizing.',
      );
    const worktreeUpdated = status.incoming.length > 0;
    if (worktreeUpdated) {
      // Refuse trees that the browser cannot faithfully materialize.
      await this.assertSupportedTree(status.remoteOid);
      await git.checkout({
        ...this.base,
        ref: status.remoteOid!,
        noUpdateHead: true,
        dryRun: true,
      });
      if (status.headOid)
        await git.merge({
          ...this.base,
          ours: status.branch!,
          theirs: status.remoteOid!,
          fastForwardOnly: true,
        });
      else
        await git.writeRef({
          ...this.base,
          ref: `refs/heads/${status.branch}`,
          value: status.remoteOid!,
        });
      await git.checkout({ ...this.base, ref: status.branch! });
      status = await this.status(!status.remoteOid);
    } else if (status.changes.length) {
      await this.commitChanges(message, status);
      status = await this.status(!status.remoteOid);
    }
    await this.pushOutgoing(status);
    return { ...(await this.status()), worktreeUpdated };
  }

  private async committedContent(oid: string | null, path: string): Promise<Uint8Array> {
    if (!oid) return new Uint8Array();
    try {
      // readBlob resolves only the ancestors of this path, not the whole commit tree.
      return (await git.readBlob({ ...this.base, oid, filepath: path })).blob;
    } catch (error) {
      const missing = error as { code?: string; data?: { what?: string } };
      if (
        missing.code === 'NotFoundError' &&
        missing.data?.what === `file or directory found at "${oid}:${path}"`
      )
        return new Uint8Array();
      throw error;
    }
  }

  private async committedEntry(oid: string | null, path: string): Promise<string | null> {
    if (!oid) return null;
    const entries = await git.walk({
      ...this.base,
      trees: [git.TREE({ ref: oid })],
      map: async (filename, [entry]) => {
        if (filename !== '.' && filename !== path && !path.startsWith(filename + '/')) return null;
        return filename === path && entry
          ? `${await entry.mode()}:${await entry.oid()}`
          : undefined;
      },
    });
    return entries.find((entry: unknown): entry is string => typeof entry === 'string') ?? null;
  }

  private async stagedContent(path: string): Promise<Uint8Array> {
    const entries = await git.walk({
      ...this.base,
      trees: [git.STAGE()],
      map: async (filename, [entry]) => {
        // Returning null prunes unrelated index subtrees before visiting their children.
        if (filename !== '.' && filename !== path && !path.startsWith(filename + '/')) return null;
        return filename === path && entry && (await entry.type()) === 'blob'
          ? entry.oid()
          : undefined;
      },
    });
    const oid = entries.find((entry: unknown): entry is string => typeof entry === 'string');
    return oid ? (await git.readBlob({ ...this.base, oid })).blob : new Uint8Array();
  }

  private async workingContent(path: string): Promise<Uint8Array> {
    try {
      return new Uint8Array(
        await this.fs.promises.readFile(`${this.base.dir.replace(/\/$/, '')}/${path}`),
      );
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
      return new Uint8Array();
    }
  }

  async preview(path: string, comparison: GitComparison = 'local') {
    const headOid = await this.optionalRef('HEAD');
    const remoteComparison = comparison === 'incoming' || comparison === 'outgoing';
    if (!remoteComparison) {
      // A preview needs the state of one path, not status/logs for the repository.
      const rows = await git.statusMatrix({ ...this.base, filepaths: [path], refresh: false });
      const row = rows.find(([filename]) => filename === path);
      const changed =
        row &&
        (comparison === 'staged'
          ? row[1] !== row[3]
          : comparison === 'unstaged'
            ? row[2] !== row[3]
            : row[1] !== row[2] || row[1] !== row[3]);
      if (!changed) throw new Error('This file no longer has changes in the selected comparison.');
    }
    let before: Uint8Array;
    let after: Uint8Array;
    if (remoteComparison) {
      const branch = (await git.currentBranch(this.base)) ?? null;
      const config = async (key: string) =>
        String((await git.getConfig({ ...this.base, path: key })) ?? '');
      const remote = (branch && (await config(`branch.${branch}.remote`))) || 'origin';
      if (remote === '.')
        throw new Error('The branch tracks a local remote. Configure an HTTPS remote using Git.');
      const merge = branch ? await config(`branch.${branch}.merge`) : '';
      const remoteBranch = merge.replace(/^refs\/heads\//, '') || branch || 'main';
      const remoteOid = await this.optionalRef(`refs/remotes/${remote}/${remoteBranch}`);
      const bases =
        headOid && remoteOid
          ? await git.findMergeBase({ ...this.base, oids: [headOid, remoteOid] })
          : [];
      const baseOid = bases[0] ?? null;
      const targetOid = comparison === 'incoming' ? remoteOid : headOid;
      const [baseEntry, targetEntry] = await Promise.all([
        this.committedEntry(baseOid, path),
        this.committedEntry(targetOid, path),
      ]);
      if (baseEntry === targetEntry)
        throw new Error('This file no longer has changes in the selected comparison.');
      [before, after] = await Promise.all([
        this.committedContent(baseOid, path),
        this.committedContent(comparison === 'incoming' ? remoteOid : headOid, path),
      ]);
    } else {
      [before, after] = await Promise.all([
        comparison === 'unstaged' ? this.stagedContent(path) : this.committedContent(headOid, path),
        comparison === 'staged' ? this.stagedContent(path) : this.workingContent(path),
      ]);
    }
    if ([before, after].some((data) => data.length > 512_000 || data.includes(0)))
      return { binary: true, before: '', after: '' };
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      return { binary: false, before: decoder.decode(before), after: decoder.decode(after) };
    } catch {
      return { binary: true, before: '', after: '' };
    }
  }
}

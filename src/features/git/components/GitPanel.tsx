import type { TargetedMouseEvent } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Icon } from '@/shared/components/Icon';
import type { DirectoryHandle } from '../services/directory-fs';
import type { GitChange, GitSettings, GitStatus } from '../services/git-client';
import type { GitClient } from '../services/git-worker-client';
import { emptyGitStatus, hasGitRepository } from '../services/repository-detection';
import styles from './GitPanel.module.css';
import notesStyles from '@/features/notes/components/Notes.module.css';
import { GitRepositoryDialog, type GitAuthentication } from './GitRepositoryDialog';
import { GitActionMenu } from './GitActionMenu';
import { GitFileIcon } from './GitFileIcon';
import { GitFileContextMenu, GitDiscardDialog, type FileMenuItem } from './GitFileContextMenu';
import type { GitComparison, GitDiffDocument } from '../types';
import { loadGitCredentials, saveGitCredentials } from '../services/git-credentials';
import { subscribeWorkspaceFileChanges } from '@/shared/lib/workspace-file-events';
import {
  DEFAULT_GIT_AUTO_COMMIT_SETTINGS,
  formatAutoCommitMessage,
  loadGitAutoCommitSettings,
  loadLegacyGitAutoCommitSettings,
  clearLegacyGitAutoCommitSettings,
  type GitAutoCommitSettings,
} from '../services/git-auto-commit';
import { GitAutoCommitDialog } from './GitAutoCommitDialog';
import { startGitAutomationSchedule } from '../services/git-automation-schedule';

const emptySettings: GitSettings = { url: '', corsProxy: '', name: '', email: '' };
const labels = { added: 'Added', modified: 'Modified', deleted: 'Deleted', untracked: 'Untracked' };
const symbols = { added: 'A', modified: 'M', deleted: 'D', untracked: 'U' };
type Action =
  'refresh' | 'configure' | 'fetch' | 'commit' | 'sync' | 'stage' | 'unstage' | 'discard';
type FileSelection = { comparison: GitComparison; paths: string[]; anchor: string };
type FileMenu = {
  workspaceId: string;
  comparison: GitComparison;
  paths: string[];
  x: number;
  y: number;
};

function FilePath({ path }: { path: string }) {
  const separator = path.lastIndexOf('/');
  return (
    <span className={styles.fileLabel}>
      <GitFileIcon path={path} />
      <span className={styles.path}>
        <span className={styles.pathName}>{path.slice(separator + 1)}</span>
        {separator >= 0 && <span className={styles.pathDirectory}>{path.slice(0, separator)}</span>}
      </span>
    </span>
  );
}

function Changes({
  changes,
  onPreview,
  selectedPaths = [],
  comparison,
  onSelect,
  onContext,
}: {
  changes: GitChange[];
  onPreview?: (path: string) => void;
  selectedPaths?: string[];
  comparison?: GitComparison;
  onSelect?: (path: string, event: TargetedMouseEvent<HTMLButtonElement>) => void;
  onContext?: (path: string, x: number, y: number) => void;
}) {
  return (
    <ul className={styles.files}>
      {changes.map((change) => (
        <li key={change.path}>
          {onPreview ? (
            <button
              type="button"
              title={change.path}
              aria-label={`${change.path} ${labels[change.marker || change.kind]}`}
              data-git-path={change.path}
              data-git-comparison={comparison}
              className={selectedPaths.includes(change.path) ? styles.selectedFile : undefined}
              aria-pressed={selectedPaths.includes(change.path)}
              onClick={(event) =>
                onSelect ? onSelect(change.path, event) : onPreview(change.path)
              }
              onContextMenu={(event) => {
                if (!onContext) return;
                event.preventDefault();
                event.stopPropagation();
                const bounds = event.currentTarget.getBoundingClientRect();
                onContext(
                  change.path,
                  event.clientX || bounds.x + 24,
                  event.clientY || bounds.bottom,
                );
              }}
              onKeyDown={(event) => {
                if (
                  onContext &&
                  (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                  const bounds = event.currentTarget.getBoundingClientRect();
                  onContext(change.path, bounds.x + 24, bounds.bottom);
                }
              }}
            >
              <FilePath path={change.path} />
              <span
                aria-hidden="true"
                title={labels[change.marker || change.kind]}
                className={styles[change.marker || change.kind]}
              >
                {symbols[change.marker || change.kind]}
              </span>
            </button>
          ) : (
            <div title={change.path}>
              <FilePath path={change.path} />
              <span
                aria-hidden="true"
                title={labels[change.marker || change.kind]}
                className={styles[change.marker || change.kind]}
              >
                {symbols[change.marker || change.kind]}
              </span>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function GitPanel() {
  const mode = useWorkspaceStore((state) => state.ui.leftPanelMode);
  const open = useWorkspaceStore((state) => state.ui.sidebarOpen);
  const locations = useWorkspaceStore((state) => state.ui.locations);
  const controller = useWorkspaceStore((state) => state.controller);
  const access = useWorkspaceStore((state) => state.ui.access);
  const gitBusy = useWorkspaceStore((state) => state.gitBusy);
  const location = locations.find((item) => item.active);
  const visible = open && mode === 'git';
  const client = useRef<GitClient | null>(null);
  const clientLocation = useRef<string | null>(null);
  const generation = useRef(0);
  const running = useRef(false);
  const autoRead = useRef<Promise<GitStatus> | null>(null);
  const mounted = useRef(true);
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [settings, setSettings] = useState<GitSettings>(emptySettings);
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [repositoryOpen, setRepositoryOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [automaticRunning, setAutomaticRunning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fileRevision, setFileRevision] = useState(0);
  const [selection, setSelection] = useState<FileSelection | null>(null);
  const [fileMenu, setFileMenu] = useState<FileMenu | null>(null);
  const [discardRequest, setDiscardRequest] = useState<FileMenu | null>(null);
  useEffect(() => {
    setSelection(null);
    setFileMenu(null);
    setDiscardRequest(null);
  }, [location?.id, visible]);
  const [autoCommitSettings, setAutoCommitSettings] = useState<GitAutoCommitSettings>(
    DEFAULT_GIT_AUTO_COMMIT_SETTINGS,
  );
  const [autoCommitDialogOpen, setAutoCommitDialogOpen] = useState(false);
  const [autoCommitDialogError, setAutoCommitDialogError] = useState('');
  const previewGeneration = useRef(0);
  const automationState = useRef({
    autoCommitSettings,
    location,
    controller,
    status,
    access,
    repositoryOpen,
    autoCommitDialogOpen,
    fileMenuOpen: Boolean(fileMenu),
    discardOpen: Boolean(discardRequest),
    visible,
  });
  automationState.current = {
    autoCommitSettings,
    location,
    controller,
    status,
    access,
    repositoryOpen,
    autoCommitDialogOpen,
    fileMenuOpen: Boolean(fileMenu),
    discardOpen: Boolean(discardRequest),
    visible,
  };
  const automationSchedule = useRef<ReturnType<typeof startGitAutomationSchedule> | null>(null);

  async function restoreAutomation(current: GitClient, workspaceId: string, migrate: boolean) {
    const saved = await current.loadAutoCommitSettings(migrate);
    if (saved) return saved;
    const legacy = loadLegacyGitAutoCommitSettings(workspaceId);
    if (legacy && migrate) {
      await current.saveAutoCommitSettings(legacy);
      clearLegacyGitAutoCommitSettings(workspaceId);
    }
    return legacy || { ...DEFAULT_GIT_AUTO_COMMIT_SETTINGS };
  }

  useEffect(
    () => () => {
      mounted.current = false;
      client.current?.dispose();
    },
    [],
  );
  useEffect(() => {
    return subscribeWorkspaceFileChanges((workspaceId) => {
      if (workspaceId === location?.id) setFileRevision((revision) => revision + 1);
    });
  }, [location?.id]);

  useEffect(() => {
    setToken('');
    setRepositoryOpen(false);
    setUsername('');
    useWorkspaceStore.getState().setGitDiff(null);
    previewGeneration.current++;
    setStatus(null);
    setSettings(emptySettings);
    setError('');
    setNotice('');
    setAutoCommitSettings(
      location?.id ? loadGitAutoCommitSettings(location.id) : DEFAULT_GIT_AUTO_COMMIT_SETTINGS,
    );
    setAutoCommitDialogOpen(false);
    setAutoCommitDialogError('');
    client.current?.authenticate('', '');
    client.current?.dispose();
    client.current = null;
    clientLocation.current = null;
  }, [location?.id, controller]);

  useEffect(() => {
    if (!visible || location?.kind !== 'directory' || !controller || running.current) return;
    const version = ++generation.current;
    setBusy('Reading changesâ€¦');
    setError('');
    let candidate: GitClient | null = null;
    void (async () => {
      if (
        version !== generation.current ||
        !mounted.current ||
        useWorkspaceStore.getState().ui.locations.find((item) => item.active)?.id !== location.id
      )
        return;
      try {
        await autoRead.current?.catch(() => undefined);
        if (
          version !== generation.current ||
          !mounted.current ||
          useWorkspaceStore.getState().ui.locations.find((item) => item.active)?.id !== location.id
        )
          return;
        const directory = (await controller.invoke('getGitDirectory')) as DirectoryHandle | null;
        if (!directory)
          throw new Error('The workspace folder is unavailable. Reopen it from Workspaces.');
        const initialized = await hasGitRepository(directory);
        if (version !== generation.current || !mounted.current) return;
        if (!initialized) {
          setStatus(emptyGitStatus());
          setSettings(emptySettings);
          setAutoCommitSettings(DEFAULT_GIT_AUTO_COMMIT_SETTINGS);
          return;
        }
        if (access === 'writable' && !(await controller.flush()))
          throw new Error('Could not save the notes before reading Git changes.');
        const { createGitClient } = await import('../services/git-worker-client');
        if (version !== generation.current || !mounted.current) return;
        const next =
          client.current && clientLocation.current === location.id
            ? client.current
            : await createGitClient(directory);
        candidate = next;
        const snapshot = await next.status();
        let authentication: GitAuthentication = { username: '', token: '' };
        let credentialError = '';
        try {
          authentication = await loadGitCredentials(location.id, snapshot.settings.url);
        } catch (cause) {
          credentialError =
            cause instanceof Error ? cause.message : 'Could not restore Git credentials.';
        }
        if (version !== generation.current || !mounted.current) return;
        next.authenticate(authentication.username, authentication.token);
        const automation = snapshot.initialized
          ? await restoreAutomation(next, location.id, access === 'writable')
          : DEFAULT_GIT_AUTO_COMMIT_SETTINGS;
        if (version !== generation.current || !mounted.current) return;
        if (client.current !== next) client.current?.dispose();
        client.current = next;
        clientLocation.current = location.id;
        setStatus(snapshot);
        setSettings(snapshot.settings);
        setUsername(authentication.username);
        setToken(authentication.token);
        setAutoCommitSettings(automation);
        setError(credentialError);
      } finally {
        if (candidate && candidate !== client.current) candidate.dispose();
      }
    })()
      .catch((cause: unknown) => {
        if (version === generation.current && mounted.current)
          setError(cause instanceof Error ? cause.message : 'Could not read the repository.');
      })
      .finally(() => {
        if (version === generation.current && mounted.current) setBusy('');
      });
    return () => {
      generation.current++;
    };
  }, [visible, location?.id, controller]);

  // Restore repository automation settings on startup even when Source Control is hidden.
  useEffect(() => {
    if (
      visible ||
      location?.kind !== 'directory' ||
      !controller ||
      (client.current && clientLocation.current === location.id)
    )
      return;
    const version = ++generation.current;
    let cancelled = false;
    let candidate: GitClient | null = null;
    const active = () =>
      !cancelled &&
      mounted.current &&
      version === generation.current &&
      useWorkspaceStore.getState().ui.locations.find((item) => item.active)?.id === location.id;
    void (async () => {
      const directory = (await controller.invoke('getGitDirectory')) as DirectoryHandle | null;
      if (!directory)
        throw new Error('The workspace folder is unavailable. Reopen it from Workspaces.');
      const initialized = await hasGitRepository(directory);
      if (!active()) return;
      if (!initialized) {
        setStatus(emptyGitStatus());
        setSettings(emptySettings);
        setAutoCommitSettings(DEFAULT_GIT_AUTO_COMMIT_SETTINGS);
        return;
      }
      const { createGitClient } = await import('../services/git-worker-client');
      if (!active()) return;
      const next = await createGitClient(directory);
      candidate = next;
      const snapshot = await next.repositoryInfo();
      const authentication = await loadGitCredentials(location.id, snapshot.settings.url);
      const automation = snapshot.initialized
        ? await restoreAutomation(next, location.id, access === 'writable')
        : DEFAULT_GIT_AUTO_COMMIT_SETTINGS;
      if (!active()) return;
      next.authenticate(authentication.username, authentication.token);
      client.current?.dispose();
      client.current = next;
      clientLocation.current = location.id;
      setStatus(snapshot);
      setSettings(snapshot.settings);
      setUsername(authentication.username);
      setToken(authentication.token);
      setAutoCommitSettings(automation);
    })()
      .catch((cause: unknown) => {
        if (active())
          setError(cause instanceof Error ? cause.message : 'Could not start automatic commits.');
      })
      .finally(() => {
        if (candidate && candidate !== client.current) candidate.dispose();
      });
    return () => {
      cancelled = true;
      if (version === generation.current) generation.current++;
    };
  }, [visible, location?.id, controller, access]);

  useEffect(() => {
    if (!fileRevision || !visible || busy || automaticRunning || gitBusy || !status || !location)
      return;
    const current = client.current;
    if (!current || running.current || clientLocation.current !== location.id) return;
    const version = generation.current;
    let cancelled = false;
    const active = () =>
      !cancelled &&
      mounted.current &&
      version === generation.current &&
      client.current === current &&
      !running.current &&
      !useWorkspaceStore.getState().gitBusy &&
      useWorkspaceStore.getState().ui.locations.find((item) => item.active)?.id === location.id;
    const timer = window.setTimeout(() => {
      void (async () => {
        // Keep background reads sequential and defer while a Git command owns the repository.
        await autoRead.current?.catch(() => undefined);
        if (!active()) return;
        setRefreshing(true);
        const pending = current.status();
        autoRead.current = pending;
        try {
          const snapshot = await pending;
          if (active()) setStatus(snapshot);
        } catch (cause) {
          if (active())
            setError(cause instanceof Error ? cause.message : 'Could not read the repository.');
        } finally {
          if (autoRead.current === pending) autoRead.current = null;
          if (mounted.current) setRefreshing(false);
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fileRevision, visible, location?.id, busy, automaticRunning, gitBusy, Boolean(status)]);

  useEffect(() => {
    const workspaceId = location?.id;
    if (
      !autoCommitSettings.enabled ||
      !workspaceId ||
      location?.kind !== 'directory' ||
      !controller
    )
      return;
    let cancelled = false;
    const schedule = startGitAutomationSchedule(
      autoCommitSettings.intervalMinutes * 60_000,
      async () => {
        const latest = automationState.current;
        const current = client.current;
        if (
          cancelled ||
          !current ||
          !mounted.current ||
          running.current ||
          clientLocation.current !== workspaceId ||
          !latest.status?.initialized ||
          latest.access !== 'writable' ||
          latest.repositoryOpen ||
          latest.autoCommitDialogOpen ||
          latest.fileMenuOpen ||
          latest.discardOpen ||
          useWorkspaceStore.getState().gitBusy ||
          useWorkspaceStore.getState().ui.locations.find((item) => item.active)?.id !== workspaceId
        )
          return false;
        const { autoCommitSettings, location } = latest;
        const visible = () => automationState.current.visible;
        running.current = true;
        setAutomaticRunning(true);
        const active = () =>
          !cancelled &&
          mounted.current &&
          client.current === current &&
          clientLocation.current === workspaceId &&
          useWorkspaceStore.getState().ui.locations.find((item) => item.active)?.id === workspaceId;
        try {
          await autoRead.current?.catch(() => undefined);
          if (!active()) return false;
          if (!(await controller.flush()))
            throw new Error('Could not save the notes before running Git.');
          const before = await current.status();
          if (!active() || !before.initialized) return false;
          if (!before.changes.length && !(autoCommitSettings.autoPush && before.outgoing.length))
            return true;
          if (visible()) {
            setNotice('');
            setError('');
          }
          // Commit stages local files and push sends objects; neither replaces editor files.
          // Keep the editor and its save queue active while automatic Git runs.
          const snapshot = before;
          if (!active()) return false;
          const authentication = await loadGitCredentials(workspaceId, snapshot.settings.url);
          current.authenticate(authentication.username, authentication.token);
          let oid: string | null = null;
          if (snapshot.changes.length) {
            const message = formatAutoCommitMessage(autoCommitSettings.messageFormat, {
              workspace: location?.name || 'Workspace',
              branch: snapshot.branch || 'branch',
              date: new Date(),
            });
            if (!message.trim()) throw new Error('Enter a commit message format.');
            oid = await current.commit(message);
          }
          const pushed = autoCommitSettings.autoPush ? await current.push() : undefined;
          const updated = pushed || (await current.status());
          if (active()) {
            setStatus(updated);
            if (visible()) {
              setError('');
              if (pushed) setNotice('Automatic push completed.');
              else if (oid) setNotice(`Automatic commit created: ${oid.slice(0, 7)}`);
            }
          }
        } catch (cause) {
          if (active() && visible()) {
            setError(
              cause instanceof Error
                ? cause.message
                : 'Could not complete the automatic Git operation.',
            );
            try {
              const updated = await current.status();
              if (active()) setStatus(updated);
            } catch {
              /* Preserve the original error. */
            }
          }
        } finally {
          running.current = false;
          if (mounted.current) setAutomaticRunning(false);
        }
        return true;
      },
    );
    automationSchedule.current = schedule;
    const wake = () => schedule.wake();
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      cancelled = true;
      schedule.dispose();
      if (automationSchedule.current === schedule) automationSchedule.current = null;
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [
    autoCommitSettings.enabled,
    autoCommitSettings.intervalMinutes,
    location?.id,
    location?.kind,
    controller,
  ]);

  useEffect(() => {
    automationSchedule.current?.wake();
  }, [status?.initialized, access, gitBusy, busy, repositoryOpen, autoCommitDialogOpen, visible]);

  async function run(
    action: Action,
    configuration?: {
      settings?: GitSettings;
      authentication?: GitAuthentication;
      paths?: string[];
    },
  ) {
    const current = client.current;
    if (!current || !controller || running.current || clientLocation.current !== location?.id)
      return;
    running.current = true;
    const version = generation.current;
    const descriptions = {
      refresh: 'Reading changesâ€¦',
      configure: 'Saving settingsâ€¦',
      fetch: 'Fetching remoteâ€¦',
      commit: 'Creating commitâ€¦',
      sync: 'Synchronizingâ€¦',
      stage: 'Staging filesâ€¦',
      unstage: 'Unstaging filesâ€¦',
      discard: 'Discarding changesâ€¦',
    };
    setBusy(descriptions[action]);
    setError('');
    setNotice('');
    useWorkspaceStore.getState().setGitDiff(null);
    previewGeneration.current++;
    let locked = false;
    try {
      if ((action === 'commit' || action === 'sync') && status?.changes.length && !message.trim()) {
        setError('Enter a commit message before committing.');
        return;
      }
      await autoRead.current?.catch(() => undefined);
      if (
        version !== generation.current ||
        !mounted.current ||
        useWorkspaceStore.getState().ui.locations.find((item) => item.active)?.id !== location?.id
      )
        return;
      if (access === 'writable' && action !== 'refresh') {
        await controller.invoke('beginGitOperation');
        locked = true;
      } else if (action !== 'refresh') throw new Error('Grant write access to use Git.');
      else if (access === 'writable' && !(await controller.flush()))
        throw new Error('Could not save the notes before reading Git changes.');
      const authentication =
        action === 'configure'
          ? (configuration?.authentication ?? { username, token })
          : await loadGitCredentials(location!.id, (await current.repositoryInfo()).settings.url);
      current.authenticate(authentication.username, authentication.token);
      if (action !== 'configure') {
        setUsername(authentication.username);
        setToken(authentication.token);
      }
      let result: GitStatus | undefined;
      let reload = false;
      if (action === 'configure') {
        const nextSettings = configuration?.settings ?? settings;
        if (authentication.token && !nextSettings.url.trim())
          throw new Error('Enter a remote repository URL before saving an access token.');
        await current.configure(nextSettings);
        await saveGitCredentials(location!.id, nextSettings.url, authentication);
      }
      if (action === 'stage') await current.stageFiles(configuration?.paths || []);
      if (action === 'unstage') await current.unstageFiles(configuration?.paths || []);
      if (action === 'discard') {
        reload = true;
        await current.discardChanges(configuration?.paths || []);
      }
      if (['stage', 'unstage', 'discard'].includes(action)) {
        setSelection(null);
        setNotice(
          action === 'discard'
            ? 'Selected changes discarded.'
            : action === 'stage'
              ? 'Selected files staged.'
              : 'Selected files unstaged.',
        );
      }
      if (action === 'fetch') result = await current.fetchStatus();
      if (action === 'commit') {
        const oid = await current.commit(message);
        setNotice(oid ? `Commit created: ${oid.slice(0, 7)}` : 'There are no changes to commit.');
      }
      if (action === 'sync') {
        const synchronized = await current.synchronize(message);
        result = synchronized;
        reload = synchronized.worktreeUpdated;
        setNotice('Workspace synchronized.');
      }
      if (locked) {
        await controller.invoke('endGitOperation', reload);
        locked = false;
      }
      const snapshot = result || (await current.status());
      if (mounted.current && version === generation.current) {
        setStatus(snapshot);
        if (action === 'configure') {
          setSettings(snapshot.settings);
          setUsername(configuration?.authentication?.username ?? username);
          setToken(configuration?.authentication?.token ?? token);
          setRepositoryOpen(false);
          setNotice('Repository settings saved.');
        }
        if (action === 'fetch')
          setNotice('Remote fetched. The latest remote changes are shown below.');
      }
    } catch (cause) {
      if (mounted.current && version === generation.current) {
        const detail = cause instanceof Error ? cause.message : 'Could not complete the operation.';
        setError(
          cause instanceof TypeError
            ? 'Could not connect. Check your connection and the remote CORS proxy.'
            : detail,
        );
        // A rejected push still leaves the local commit available for retry.
        try {
          setStatus(await current.status());
        } catch {
          /* Preserve the original error. */
        }
      }
    } finally {
      try {
        if (locked)
          await controller.invoke('endGitOperation', action === 'sync' || action === 'discard');
      } catch {
        if (mounted.current)
          setError(
            'Git finished, but the notes could not be reloaded. Reopen the folder before editing.',
          );
      }
      running.current = false;
      if (mounted.current && version === generation.current) setBusy('');
    }
  }

  async function showPreview(path: string, comparison: GitComparison) {
    const current = client.current;
    if (!current || running.current || clientLocation.current !== location?.id) return;
    controller?.invoke('cancelPageOperations');
    const version = ++previewGeneration.current;
    const document: GitDiffDocument = {
      id: crypto.randomUUID(),
      workspaceId: location!.id,
      path,
      comparison,
      state: 'loading',
      before: '',
      after: '',
      binary: false,
    };
    useWorkspaceStore.getState().setGitDiff(document);
    const active = () =>
      mounted.current &&
      version === previewGeneration.current &&
      useWorkspaceStore.getState().gitDiff?.id === document.id;
    try {
      const content = await current.preview(path, comparison);
      if (active())
        useWorkspaceStore.getState().setGitDiff({ ...document, ...content, state: 'ready' });
    } catch (cause) {
      if (active())
        useWorkspaceStore.getState().setGitDiff({
          ...document,
          state: 'error',
          error: cause instanceof Error ? cause.message : 'Could not compare the file.',
        });
    }
  }

  const disabled =
    Boolean(busy) ||
    automaticRunning ||
    gitBusy ||
    (location?.kind === 'directory' && clientLocation.current !== location.id);
  const loadingText =
    busy ||
    (automaticRunning ? 'Automatic commit in progressâ€¦' : '') ||
    (refreshing ? 'Updating changesâ€¦' : '') ||
    (gitBusy ? 'Processing repositoryâ€¦' : '');
  const writable = access === 'writable' && !disabled;
  const diverged = Boolean(status?.incoming.length && status.outgoing.length);

  function changesFor(comparison: GitComparison) {
    if (!status) return [];
    return comparison === 'staged'
      ? status.stagedChanges
      : comparison === 'unstaged'
        ? status.unstagedChanges
        : comparison === 'incoming'
          ? status.incomingFiles
          : status.outgoingFiles;
  }

  function fileInteractions(comparison: GitComparison) {
    return {
      comparison,
      selectedPaths: selection?.comparison === comparison ? selection.paths : [],
      onSelect: (path: string, event: TargetedMouseEvent<HTMLButtonElement>) => {
        if (disabled || discardRequest) return;
        setFileMenu(null);
        const previous = selection?.comparison === comparison ? selection : null;
        let paths = [path];
        if (event.shiftKey && previous) {
          const ordered = changesFor(comparison).map((change) => change.path);
          const start = ordered.indexOf(previous.anchor),
            end = ordered.indexOf(path);
          if (start >= 0) paths = ordered.slice(Math.min(start, end), Math.max(start, end) + 1);
          if (event.ctrlKey || event.metaKey) paths = [...new Set([...previous.paths, ...paths])];
        } else if (event.ctrlKey || event.metaKey) {
          paths = previous?.paths.includes(path)
            ? previous.paths.filter((item) => item !== path)
            : [...(previous?.paths || []), path];
        }
        setSelection({
          comparison,
          paths,
          anchor: event.shiftKey && previous ? previous.anchor : path,
        });
        if (!event.shiftKey && !event.ctrlKey && !event.metaKey) void showPreview(path, comparison);
      },
      onContext: (path: string, x: number, y: number) => {
        if (disabled || discardRequest || !location) return;
        const selected =
          selection?.comparison === comparison && selection.paths.includes(path)
            ? selection.paths
            : [path];
        const paths = selected.filter((item) =>
          changesFor(comparison).some((change) => change.path === item),
        );
        setSelection({
          comparison,
          paths,
          anchor:
            selection?.comparison === comparison && selection.paths.includes(path)
              ? selection.anchor
              : path,
        });
        setFileMenu({ workspaceId: location.id, comparison, paths, x, y });
      },
    };
  }

  function contextItems(menu: FileMenu): FileMenuItem[] {
    const notes =
      controller?.getDocument().pages.filter((note) => menu.paths.includes(note.filePath || '')) ||
      [];
    const local = menu.comparison === 'staged' || menu.comparison === 'unstaged';
    const items: FileMenuItem[] = [
      {
        label: 'View changes',
        icon: 'git-branch',
        disabled: disabled || menu.paths.length !== 1,
        action: () => void showPreview(menu.paths[0], menu.comparison),
      },
      {
        label: menu.paths.length > 1 ? 'Open files' : 'Open file',
        icon: 'file-text',
        disabled: disabled || notes.length !== menu.paths.length,
        action: () =>
          notes.forEach((note) => controller?.invoke('openPage', note.id, { newTab: true })),
      },
      {
        label: 'Copy path',
        icon: 'copy',
        action: () => {
          void navigator.clipboard
            .writeText(menu.paths.join('\n'))
            .then(() => setNotice('File paths copied.'))
            .catch(() => setError('Could not copy the file paths.'));
        },
      },
    ];
    if (local) {
      items.push({
        label: menu.comparison === 'staged' ? 'Unstage changes' : 'Stage changes',
        icon: menu.comparison === 'staged' ? 'minus' : 'plus',
        disabled: !writable,
        action: () =>
          void run(menu.comparison === 'staged' ? 'unstage' : 'stage', { paths: menu.paths }),
      });
      items.push({
        label: 'Discard changes',
        icon: 'trash',
        danger: true,
        disabled: !writable,
        action: () => setDiscardRequest(menu),
      });
    }
    return items;
  }

  const canCommit = Boolean(writable && status?.branch && status.changes.length && message.trim());
  const canFetch = Boolean(writable && status?.branch && status.settings.url);
  const canSync = canFetch && !diverged && (!status?.changes.length || Boolean(message.trim()));

  function openSettings() {
    setError('');
    if (status) setSettings(status.settings);
    setRepositoryOpen(true);
  }

  async function saveAutoCommitSettings(next: GitAutoCommitSettings) {
    const current = client.current;
    if (
      !location?.id ||
      !current ||
      !controller ||
      running.current ||
      clientLocation.current !== location.id
    )
      return;
    running.current = true;
    setBusy('Saving automatic commit settingsâ€¦');
    let locked = false;
    try {
      await autoRead.current?.catch(() => undefined);
      await controller.invoke('beginGitOperation');
      locked = true;
      await current.saveAutoCommitSettings(next);
      setStatus(await current.status());
      clearLegacyGitAutoCommitSettings(location.id);
      setAutoCommitSettings(next);
      setAutoCommitDialogError('');
      setAutoCommitDialogOpen(false);
    } catch (cause) {
      setAutoCommitDialogError(
        cause instanceof Error ? cause.message : 'Could not save automatic commit settings.',
      );
    } finally {
      try {
        if (locked) await controller.invoke('endGitOperation', false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not finish saving Git settings.');
      } finally {
        running.current = false;
        setBusy('');
      }
    }
  }

  const repositoryActions = () => (
    <>
      <button type="button" disabled={!canFetch} onClick={() => void run('fetch')}>
        <Icon name="download" size="16" /> Fetch remote
      </button>
      <button type="button" disabled={!canSync} onClick={() => void run('sync')}>
        <Icon name="refresh-cw" size="16" /> Sync workspace
      </button>
      <div className={styles.menuDivider} />
      <button type="button" disabled={disabled || !status?.initialized} onClick={openSettings}>
        <Icon name="settings" size="16" /> Repository settings
      </button>
      <button
        type="button"
        disabled={disabled || !status?.initialized}
        onClick={() => {
          setAutoCommitDialogError('');
          setAutoCommitDialogOpen(true);
        }}
      >
        <Icon name="clock" size="16" /> Automatic commit settings
      </button>
      {status?.initialized && (
        <p className={styles.menuInfo}>
          Automatic commits:{' '}
          {autoCommitSettings.enabled
            ? `Every ${autoCommitSettings.intervalMinutes} minute${autoCommitSettings.intervalMinutes === 1 ? '' : 's'}`
            : 'Off'}
          {autoCommitSettings.enabled && autoCommitSettings.autoPush ? ' Â· Auto push on' : ''}
        </p>
      )}
      {status?.initialized && (
        <p className={styles.menuInfo}>
          {location?.name}
          <br />
          {status.branch || 'Detached HEAD'} Â· {status.remote}/{status.remoteBranch}
        </p>
      )}
    </>
  );

  return (
    <section
      id="gitPanel"
      data-git-panel
      data-left-panel="git"
      className={`${styles.panel} ${mode === 'git' ? '' : 'hidden'}`}
      aria-label="Git synchronization"
      aria-busy={Boolean(loadingText)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <header className={styles.header}>
        <h2
          title={
            status?.initialized
              ? `${location?.name} Â· ${status.branch || 'Detached HEAD'} Â· ${status.remote}/${status.remoteBranch}`
              : undefined
          }
        >
          Source Control
        </h2>
        <div className={styles.repositoryActions}>
          {location?.kind === 'directory' && status?.initialized && (
            <>
              <button
                type="button"
                title="Commit all local changes"
                aria-label="Commit all changes"
                disabled={!canCommit}
                onClick={() => void run('commit')}
              >
                <Icon name="check" size="18" />
              </button>
              <button
                type="button"
                title="Refresh local changes"
                aria-label="Refresh Git changes"
                disabled={disabled}
                onClick={() => void run('refresh')}
              >
                <Icon name="refresh-cw" size="16" />
              </button>
              <button
                type="button"
                title="Sync workspace"
                aria-label="Sync workspace"
                disabled={!canSync}
                onClick={() => void run('sync')}
              >
                <Icon name="git-branch" size="16" />
              </button>
            </>
          )}
          {status?.initialized && (
            <GitActionMenu id="gitRepositorySettingsBtn" label="More source control actions">
              {repositoryActions()}
            </GitActionMenu>
          )}
        </div>
      </header>
      {loadingText && (
        <div className={styles.progress} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <span>{loadingText}</span>
        </div>
      )}
      <div className={`sidebar-scroll ${notesStyles['sidebar-scroll']}`}>
        {location?.kind !== 'directory' ? (
          <div className={styles.empty}>
            <p>Git is not initialized in this workspace.</p>
          </div>
        ) : (
          <>
            {status && !status.initialized && (
              <div className={styles.empty}>
                <p>Git is not initialized in this workspace.</p>
              </div>
            )}
            {status?.initialized && (
              <>
                <div id="gitRepositoryContent">
                  <div className={styles.composer}>
                    <label className={styles.messageLabel}>
                      <span>Commit message</span>
                      <textarea
                        rows={3}
                        value={message}
                        placeholder="Enter a commit message"
                        disabled={disabled}
                        onInput={(event) => setMessage(event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (
                            (event.ctrlKey || event.metaKey) &&
                            event.key === 'Enter' &&
                            canCommit
                          ) {
                            event.preventDefault();
                            void run('commit');
                          }
                        }}
                      />
                    </label>
                    <div className={styles.commitActions}>
                      <button
                        className={styles.commitButton}
                        type="button"
                        aria-label="Commit local changes"
                        title="Commit all local changes (Ctrl+Enter)"
                        disabled={!canCommit}
                        onClick={() => void run('commit')}
                      >
                        <Icon name="check" size="18" /> Commit
                      </button>
                      <GitActionMenu label="More commit actions" commit>
                        <button
                          type="button"
                          disabled={!canCommit}
                          onClick={() => void run('commit')}
                        >
                          <Icon name="check" size="16" /> Commit local changes
                        </button>
                        <button type="button" disabled={!canSync} onClick={() => void run('sync')}>
                          <Icon name="refresh-cw" size="16" /> Commit and Sync
                        </button>
                      </GitActionMenu>
                    </div>
                  </div>
                  {status.stagedChanges.length > 0 && (
                    <details className={styles.fileGroup} open>
                      <summary>
                        <Icon name="chevron-right" className={styles.disclosure} size="16" />
                        <span>Staged Changes</span>
                        <span className={styles.count}>{status.stagedChanges.length}</span>
                      </summary>
                      <Changes
                        changes={status.stagedChanges}
                        {...fileInteractions('staged')}
                        onPreview={(path) => void showPreview(path, 'staged')}
                      />
                    </details>
                  )}
                  <details className={styles.fileGroup} open>
                    <summary>
                      <Icon name="chevron-right" className={styles.disclosure} size="16" />
                      <span>Changes</span>
                      <span className={styles.count}>{status.unstagedChanges.length}</span>
                    </summary>
                    {status.unstagedChanges.length ? (
                      <Changes
                        changes={status.unstagedChanges}
                        {...fileInteractions('unstaged')}
                        onPreview={(path) => void showPreview(path, 'unstaged')}
                      />
                    ) : !status.changes.length ? (
                      <p className={styles.hint}>There are no pending local changes.</p>
                    ) : null}
                  </details>
                  {(['outgoing', 'incoming'] as const)
                    .filter((direction) => status[direction].length > 0)
                    .map((direction) => (
                      <details
                        className={`${styles.fileGroup} ${styles.commits}`}
                        key={direction}
                        open
                      >
                        <summary>
                          <Icon name="chevron-right" className={styles.disclosure} size="16" />
                          <span>
                            {direction === 'outgoing' ? 'Outgoing commits' : 'Incoming commits'}
                          </span>
                          <span className={styles.count}>{status[direction].length}</span>
                        </summary>
                        <ul className={styles.commitList}>
                          {status[direction].map((entry) => (
                            <li key={entry.oid}>
                              <code>{entry.oid.slice(0, 7)}</code>
                              <span>{entry.commit.message.split('\n')[0]}</span>
                            </li>
                          ))}
                        </ul>
                        <Changes
                          changes={
                            direction === 'outgoing' ? status.outgoingFiles : status.incomingFiles
                          }
                          {...fileInteractions(direction)}
                          onPreview={(path) => void showPreview(path, direction)}
                        />
                      </details>
                    ))}
                </div>
              </>
            )}
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className={styles.feedback} role="status">
                {notice}
              </p>
            )}
            {status?.initialized && access !== 'writable' && !gitBusy && (
              <p className={styles.hint}>Grant write access to create commits and synchronize.</p>
            )}
            {diverged && (
              <p className={styles.error}>
                The branches have diverged. Integrate the commits using desktop Git before
                synchronizing.
              </p>
            )}
          </>
        )}
      </div>
      {fileMenu && visible && fileMenu.workspaceId === location?.id && (
        <GitFileContextMenu
          key={fileMenu.comparison + fileMenu.paths.join('|') + fileMenu.x + ':' + fileMenu.y}
          x={fileMenu.x}
          y={fileMenu.y}
          count={fileMenu.paths.length}
          items={contextItems(fileMenu)}
          onClose={() => setFileMenu(null)}
        />
      )}
      {discardRequest && visible && discardRequest.workspaceId === location?.id && (
        <GitDiscardDialog
          paths={discardRequest.paths}
          onClose={() => setDiscardRequest(null)}
          onConfirm={() => {
            const request = discardRequest;
            setDiscardRequest(null);
            if (writable && request.workspaceId === location?.id)
              void run('discard', { paths: request.paths });
          }}
        />
      )}
      <GitRepositoryDialog
        open={repositoryOpen && visible}
        workspaceName={location?.name || 'Workspace'}
        workspaceId={location?.id || ''}
        settings={settings}
        authentication={{ username, token }}
        busy={disabled}
        writable={access === 'writable'}
        error={error}
        onClose={() => setRepositoryOpen(false)}
        onSave={(nextSettings, authentication) =>
          void run('configure', { settings: nextSettings, authentication })
        }
      />
      {autoCommitDialogOpen && location?.id && (
        <GitAutoCommitDialog
          settings={autoCommitSettings}
          workspaceName={location.name}
          error={autoCommitDialogError}
          busy={disabled}
          onClose={() => setAutoCommitDialogOpen(false)}
          onSave={saveAutoCommitSettings}
        />
      )}
    </section>
  );
}

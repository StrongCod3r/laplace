import { createPortal } from 'preact/compat';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '@/shared/components/Icon';
import type { GitSettings } from '../services/git-client';
import { localGitProxy } from '../services/git-connection';
import { authorizeGitHub, githubServiceUrl } from '../services/github-auth';
import styles from './GitRepositoryDialog.module.css';
import {
  credentialScope,
  loadGitCredentials,
  type GitAuthentication,
} from '../services/git-credentials';

export type { GitAuthentication } from '../services/git-credentials';

interface Props {
  initialize?: boolean;
  create?: boolean;
  open: boolean;
  workspaceName: string;
  workspaceId: string;
  settings: GitSettings;
  authentication: GitAuthentication;
  busy: boolean;
  writable: boolean;
  error: string;
  onClose(): void;
  onSave(settings: GitSettings, authentication: GitAuthentication): void;
}

export function GitRepositoryDialog(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(props.settings);
  const [authentication, setAuthentication] = useState(props.authentication);
  const pendingTest = useRef<AbortController | null>(null);
  const credentialGeneration = useRef(0);
  const [loadingCredentials, setLoadingCredentials] = useState(false);
  const [testing, setTesting] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const pendingAuth = useRef<AbortController | null>(null);

  async function connectGitHub() {
    try {
      const url = new URL(draft.url);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'github.com' ||
        url.username ||
        url.password
      )
        throw new Error('Enter a GitHub HTTPS repository URL before connecting.');
    } catch {
      setConnection({
        ok: false,
        message: 'Enter a GitHub HTTPS repository URL before connecting.',
      });
      return;
    }
    const request = new AbortController();
    pendingAuth.current?.abort();
    pendingAuth.current = request;
    setAuthorizing(true);
    clearConnection();
    try {
      const result = await authorizeGitHub(request.signal);
      if (!request.signal.aborted) editAuthentication(result);
    } catch (error) {
      if (!request.signal.aborted)
        setConnection({
          ok: false,
          message: error instanceof Error ? error.message : 'GitHub sign-in failed.',
        });
    } finally {
      if (pendingAuth.current === request) {
        pendingAuth.current = null;
        setAuthorizing(false);
      }
    }
  }
  const [connection, setConnection] = useState<{ ok: boolean; message: string } | null>(null);

  function clearConnection() {
    pendingTest.current?.abort();
    pendingTest.current = null;
    setTesting(false);
    setConnection(null);
  }

  function editRepository(url: string) {
    clearConnection();
    setDraft({ ...draft, url });
    const version = ++credentialGeneration.current;
    setLoadingCredentials(false);
    if (
      credentialScope(props.workspaceId, url) ===
      credentialScope(props.workspaceId, props.settings.url)
    ) {
      restoreAuthentication(props.authentication);
      return;
    }
    restoreAuthentication({ username: '', token: '' });
    if (!credentialScope(props.workspaceId, url)) return;
    setLoadingCredentials(true);
    void loadGitCredentials(props.workspaceId, url)
      .then((saved) => {
        if (version === credentialGeneration.current) restoreAuthentication(saved);
      })
      .catch((cause) => {
        if (version === credentialGeneration.current)
          setConnection({
            ok: false,
            message: cause instanceof Error ? cause.message : 'Could not restore Git credentials.',
          });
      })
      .finally(() => {
        if (version === credentialGeneration.current) setLoadingCredentials(false);
      });
  }

  function restoreAuthentication(next: GitAuthentication) {
    setAuthentication(next);
  }

  function editAuthentication(next: GitAuthentication) {
    credentialGeneration.current++;
    setLoadingCredentials(false);
    clearConnection();
    setAuthentication(next);
  }

  async function testConnection() {
    const request = new AbortController();
    pendingTest.current = request;
    setTesting(true);
    setConnection(null);
    try {
      const { testGitConnection } = await import('../services/git-client');
      if (request.signal.aborted) return;
      await testGitConnection(draft, authentication, request.signal);
      if (pendingTest.current === request)
        setConnection({ ok: true, message: 'Connection successful. The repository is readable.' });
    } catch (error) {
      if (pendingTest.current === request && !request.signal.aborted)
        setConnection({
          ok: false,
          message: error instanceof Error ? error.message : 'Unable to connect. Try again.',
        });
    } finally {
      if (pendingTest.current === request) {
        pendingTest.current = null;
        setTesting(false);
      }
    }
  }

  useLayoutEffect(() => {
    credentialGeneration.current++;
    setLoadingCredentials(false);
    clearConnection();
    const element = dialog.current;
    if (!element) return;
    if (props.open) {
      setDraft(props.settings);
      restoreAuthentication(props.authentication);
      if (!element.open) element.showModal();
    } else if (element.open) {
      element.close();
      const trigger = document.getElementById('gitRepositorySettingsBtn');
      if (trigger?.getClientRects().length) trigger.focus();
    }
    if (!props.open) {
      setDraft(props.settings);
      restoreAuthentication(props.authentication);
    }
    return () => {
      pendingAuth.current?.abort();
      pendingAuth.current = null;
      setAuthorizing(false);
      credentialGeneration.current++;
      pendingTest.current?.abort();
      pendingTest.current = null;
    };
  }, [props.open, props.settings, props.authentication.username, props.authentication.token]);

  return createPortal(
    <dialog
      ref={dialog}
      className={styles.dialog}
      data-git-panel
      aria-labelledby={props.create ? 'gitWebRepositoryTitle' : 'gitRepositoryTitle'}
      aria-describedby={props.create ? 'gitWebRepositoryDescription' : 'gitRepositoryDescription'}
      aria-modal="true"
      aria-busy={props.busy || testing || loadingCredentials}
      onClick={(event) => {
        event.stopPropagation();
        const bounds = event.currentTarget.getBoundingClientRect();
        const outside =
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom;
        if (event.target === event.currentTarget && outside && !props.busy) props.onClose();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key !== 'Tab') return;
        const controls = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])',
          ),
        ].filter((element) => !element.matches(':disabled') && element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!props.busy) props.onClose();
      }}
    >
      <header className={styles.header}>
        <h2 id={props.create ? 'gitWebRepositoryTitle' : 'gitRepositoryTitle'}>
          {props.create ? 'Open a GitHub web workspace' : 'Repository settings'}
        </h2>
        <button
          type="button"
          aria-label="Close repository settings"
          disabled={props.busy}
          onClick={props.onClose}
        >
          <Icon name="x" size="18" />
        </button>
      </header>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!testing && !loadingCredentials && !authorizing) props.onSave(draft, authentication);
        }}
      >
        <div className={styles.content}>
          <p
            id={props.create ? 'gitWebRepositoryDescription' : 'gitRepositoryDescription'}
            className={styles.description}
          >
            {props.create
              ? 'Clone a GitHub repository into this browser. No local folder is required.'
              : props.initialize
                ? `Set up GitHub synchronization for ${props.workspaceName}. Saving initializes Git in this folder and preserves your existing notes. Remote changes are applied only when you choose Sync.`
                : `Configure Git synchronization for ${props.workspaceName}.`}
          </p>
          <fieldset disabled={props.busy || !props.writable || authorizing}>
            <label>
              Remote repository (HTTPS)
              <input
                autoFocus
                type="url"
                value={draft.url}
                placeholder="https://github.com/user/workspace.git"
                onInput={(event) => editRepository(event.currentTarget.value)}
              />
            </label>
            <label>
              CORS proxy (optional)
              <input
                type="url"
                value={draft.corsProxy}
                placeholder="https://your-proxy.example"
                onInput={(event) => {
                  clearConnection();
                  setDraft({ ...draft, corsProxy: event.currentTarget.value });
                }}
              />
            </label>
            <p className={styles.hint}>
              {!draft.corsProxy.trim() && localGitProxy(draft.url)
                ? 'GitHub connections use the local development proxy automatically.'
                : githubServiceUrl()
                  ? 'GitHub connections are configured for this deployment.'
                  : 'For servers that block browser access, including GitHub, configure a trusted CORS proxy.'}
            </p>
            <h3>Commit author</h3>
            <div className={styles.columns}>
              <label>
                Author name
                <input
                  value={draft.name}
                  autoComplete="name"
                  onInput={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
                />
              </label>
              <label>
                Author email
                <input
                  type="email"
                  value={draft.email}
                  autoComplete="email"
                  onInput={(event) => setDraft({ ...draft, email: event.currentTarget.value })}
                />
              </label>
            </div>
            <h3>Authentication</h3>
            <p className={styles.hint}>
              Paste a personal access token (classic or fine-grained), or connect with GitHub to
              obtain a token automatically.
            </p>
            <div className={styles.columns}>
              <label>
                Remote username
                <input
                  value={authentication.username}
                  autoComplete="off"
                  placeholder="Optional"
                  onInput={(event) =>
                    editAuthentication({ ...authentication, username: event.currentTarget.value })
                  }
                />
              </label>
              <label>
                Access token
                <input
                  type="password"
                  value={authentication.token}
                  autoComplete="off"
                  onInput={(event) =>
                    editAuthentication({
                      ...authentication,
                      token: event.currentTarget.value.trim(),
                    })
                  }
                />
              </label>
            </div>
            <button
              className={styles.authenticationAction}
              type="button"
              disabled={authorizing || !githubServiceUrl()}
              onClick={() => void connectGitHub()}
            >
              {authorizing ? 'Waiting for GitHub…' : 'Connect with GitHub'}
            </button>
            <p className={styles.hint}>
              {authentication.token
                ? 'A token is ready. Save to use it for this repository.'
                : githubServiceUrl()
                  ? 'Authorize repository access on GitHub without copying a token.'
                  : 'GitHub web sign-in requires the deployment’s GitHub service to be configured. You can still enter a token manually.'}
            </p>
            {authentication.token && (
              <button type="button" onClick={() => editAuthentication({ username: '', token: '' })}>
                Clear credentials
              </button>
            )}
            <p className={styles.hint}>
              Credentials are saved encrypted in this browser for this workspace and repository.
              Clear credentials and save to remove them. Revoke the token in GitHub Settings →
              Developer settings, or revoke web sign-in under Applications.
            </p>
            <div className={styles.connectionTest}>
              <button
                type="button"
                disabled={testing || loadingCredentials}
                onClick={() => void testConnection()}
              >
                {testing ? 'Testing…' : 'Test connection'}
              </button>
              <p className={styles.hint}>
                Checks read access using the current URL, proxy and credentials without saving
                settings.
              </p>
            </div>
          </fieldset>
          {loadingCredentials && <p role="status">Loading saved credentials…</p>}
          {testing && <p role="status">Testing connection…</p>}
          {connection && (
            <p
              className={connection.ok ? styles.success : styles.error}
              role={connection.ok ? 'status' : 'alert'}
            >
              {connection.message}
            </p>
          )}
          {props.error && (
            <p className={styles.error} role="alert">
              {props.error}
            </p>
          )}
        </div>
        <footer className={styles.actions}>
          <button type="button" disabled={props.busy} onClick={props.onClose}>
            Cancel
          </button>
          <button
            className={styles.primary}
            type="submit"
            disabled={props.busy || testing || loadingCredentials || authorizing || !props.writable}
          >
            {props.busy
              ? props.create
                ? 'Cloning…'
                : 'Saving…'
              : props.create
                ? 'Open web workspace'
                : 'Save settings'}
          </button>
        </footer>
      </form>
    </dialog>,
    document.body,
  );
}

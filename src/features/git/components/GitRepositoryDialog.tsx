import { createPortal } from 'preact/compat';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '@/shared/components/Icon';
import type { GitSettings } from '../services/git-client';
import { localGitProxy } from '../services/git-connection';
import styles from './GitRepositoryDialog.module.css';
import {
  credentialScope,
  loadGitCredentials,
  type GitAuthentication,
} from '../services/git-credentials';

export type { GitAuthentication } from '../services/git-credentials';

interface Props {
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
      setAuthentication(props.authentication);
      return;
    }
    setAuthentication({ username: '', token: '' });
    if (!credentialScope(props.workspaceId, url)) return;
    setLoadingCredentials(true);
    void loadGitCredentials(props.workspaceId, url)
      .then((saved) => {
        if (version === credentialGeneration.current) setAuthentication(saved);
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
      setAuthentication(props.authentication);
      if (!element.open) element.showModal();
    } else if (element.open) {
      element.close();
      const trigger = document.getElementById('gitRepositorySettingsBtn');
      if (trigger?.getClientRects().length) trigger.focus();
    }
    if (!props.open) {
      setDraft(props.settings);
      setAuthentication(props.authentication);
    }
    return () => {
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
      aria-labelledby="gitRepositoryTitle"
      aria-describedby="gitRepositoryDescription"
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
        <h2 id="gitRepositoryTitle">Repository settings</h2>
        <button
          type="button"
          aria-label="Close repository settings"
          disabled={props.busy}
          onClick={props.onClose}
        >
          <Icon name="x" size="18" />
        </button>
      </header>
      <p id="gitRepositoryDescription" className={styles.description}>
        Configure Git synchronization for {props.workspaceName}.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!testing && !loadingCredentials) props.onSave(draft, authentication);
        }}
      >
        <fieldset disabled={props.busy || !props.writable}>
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
          <div className={styles.columns}>
            <label>
              Remote username
              <input
                value={authentication.username}
                autoComplete="off"
                onInput={(event) => {
                  editAuthentication({ ...authentication, username: event.currentTarget.value });
                }}
              />
            </label>
            <label>
              Access token
              <input
                type="password"
                value={authentication.token}
                autoComplete="off"
                onInput={(event) => {
                  editAuthentication({ ...authentication, token: event.currentTarget.value });
                }}
              />
            </label>
          </div>
          <p className={styles.hint}>
            Credentials are saved encrypted in this browser for this workspace and repository. Clear
            the token and save to remove them.
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
        <footer className={styles.actions}>
          <button type="button" disabled={props.busy} onClick={props.onClose}>
            Cancel
          </button>
          <button
            className={styles.primary}
            type="submit"
            disabled={props.busy || testing || loadingCredentials || !props.writable}
          >
            {props.busy ? 'Saving…' : 'Save settings'}
          </button>
        </footer>
      </form>
    </dialog>,
    document.body,
  );
}

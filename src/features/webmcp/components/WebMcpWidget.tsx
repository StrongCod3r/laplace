import { useEffect, useRef, useState } from 'preact/hooks';
import { useWorkspaceStore } from '@/store/workspace.store';
import { Icon } from '@/shared/components/Icon';
import { useNativeWebMcp } from '../hooks/use-native-webmcp';
import { useWebMcpBridge } from '../hooks/use-webmcp-bridge';
import { webMcpTools } from '../services/tools';
import styles from './WebMcpWidget.module.css';

export function WebMcpWidget({ buttonClassName }: { buttonClassName: string }) {
  const controller = useWorkspaceStore((state) => state.controller);
  const vaultId = useWorkspaceStore((state) => state.ui.activeVaultId);
  const access = useWorkspaceStore((state) => state.ui.access);
  const [expanded, setExpanded] = useState(false);
  const [token, setToken] = useState('');
  const bridge = useWebMcpBridge(controller, vaultId, access);
  const { status, available } = bridge;
  const widget = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const instructions = useRef<HTMLDialogElement | null>(null);
  const active = status === 'Connecting…' || status === 'Connected';
  const nativeStatus = useNativeWebMcp(controller, vaultId, available);
  const nativeMessage = {
    checking: 'Checking…',
    unsupported: 'Unavailable',
    waiting: 'No workspace',
    registering: 'Registering…',
    ready: `Ready · ${webMcpTools.length} tools`,
    error: 'Unavailable',
  }[nativeStatus];

  useEffect(() => {
    if (!expanded) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        !instructions.current?.open &&
        event.target instanceof Node &&
        !widget.current?.contains(event.target)
      )
        setExpanded(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || instructions.current?.open) return;
      setExpanded(false);
      trigger.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', closeOutside, true);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, [expanded]);

  function connect(event: Event) {
    event.preventDefault();
    bridge.connect(token);
    setToken('');
  }

  return (
    <div className={styles.widget} ref={widget}>
      {expanded && (
        <div id="webmcp-panel" className={styles.panel}>
          <div className={styles.panelHeader}>
            <strong>WebMCP</strong>
            <button
              type="button"
              className={styles.iconButton}
              title="Installation instructions"
              aria-label="WebMCP installation instructions"
              aria-haspopup="dialog"
              onClick={() => instructions.current?.showModal()}
            >
              <Icon name="circle-help" />
            </button>
          </div>
          <section
            className={styles.statusRow}
            aria-label="Browser WebMCP"
            data-state={nativeStatus}
          >
            <span>Browser</span>
            <span className={styles.nativeValue} aria-live="polite">
              {nativeMessage}
            </span>
          </section>
          <div className={styles.statusRow}>
            <span>Local bridge</span>
            <span role="status">{available ? status : 'No workspace'}</span>
          </div>
          {status === 'Connected' ? (
            <button className={styles.disconnect} type="button" onClick={bridge.disconnect}>
              Disconnect
            </button>
          ) : (
            <form className={styles.bridgeForm} onSubmit={connect}>
              <input
                id="webmcp-token"
                type="password"
                autoComplete="off"
                aria-label="Connection token"
                placeholder="Connection token"
                spellcheck={false}
                value={token}
                disabled={active || !available}
                onInput={(event) => setToken(event.currentTarget.value)}
              />
              {active ? (
                <button type="button" onClick={bridge.disconnect}>
                  Cancel
                </button>
              ) : (
                <button type="submit" disabled={!available || active || !token.trim()}>
                  Connect
                </button>
              )}
            </form>
          )}
        </div>
      )}
      <button
        type="button"
        ref={trigger}
        className={`${buttonClassName} ${styles.trigger}`}
        title={status === 'Connected' ? 'WebMCP · Connected' : 'WebMCP'}
        aria-label="WebMCP"
        data-connected={status === 'Connected' ? '' : undefined}
        aria-expanded={expanded}
        aria-controls="webmcp-panel"
        onClick={() => setExpanded(!expanded)}
      >
        <Icon name="plug" />
      </button>
      <dialog
        ref={instructions}
        className={styles.instructions}
        aria-labelledby="webmcp-instructions-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) instructions.current?.close();
        }}
      >
        <header className={`${styles.panelHeader} ${styles.dialogHeader}`}>
          <h2 id="webmcp-instructions-title">Install WebMCP</h2>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Close installation instructions"
            onClick={() => instructions.current?.close()}
          >
            <Icon name="x" />
          </button>
        </header>
        <div
          className={styles.dialogContent}
          tabIndex={0}
          role="region"
          aria-label="Installation instructions"
        >
          <p>
            Browser tools are registered automatically when supported. Inspect them in DevTools
            under Application → WebMCP. Browser agents use this route without a local bridge or
            token.
          </p>
          <p>To connect an external MCP client through the local bridge:</p>
          <ol>
            <li>Install Node.js with npm on the computer running Laplace.</li>
            <li>
              Add this server in your AI agent or MCP client's server settings:
              <pre>
                <code>
                  {JSON.stringify(
                    {
                      mcpServers: {
                        webmcp: {
                          command: 'npx',
                          args: ['-y', '@jason.today/webmcp@latest', '--mcp'],
                        },
                      },
                    },
                    null,
                    2,
                  )}
                </code>
              </pre>
              <p>Use a local server (stdio). Adapt this configuration to your client's format.</p>
            </li>
            <li>
              Enable the server and restart your agent or client if needed, then ask it to generate
              a WebMCP connection token.
            </li>
            <li>Paste the token into the WebMCP panel in Laplace and select Connect.</li>
          </ol>
          <p>
            If the local bridge does not start automatically, run this command in a terminal on the
            same computer as your browser. Keep the terminal open, then generate a new connection
            token:
          </p>
          <pre>
            <code>npx -y @jason.today/webmcp@latest --foreground</code>
          </pre>
          <p>
            Connect only a trusted client: it can read and edit notes in this vault. Closing the
            panel keeps the connection active; use Disconnect to end it.
          </p>
          <p>
            The authorized bridge session is remembered in this tab so it can reconnect after a
            refresh. Disconnect, a vault change, blocked access, connection failure, or five minutes
            without tool activity clears it. The one-time connection token is never stored. Edits
            require write access and support Undo.
          </p>
        </div>
      </dialog>
    </div>
  );
}

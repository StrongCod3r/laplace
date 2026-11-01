import { webMcpServer, type BridgeCredentials } from './connection';

export const BRIDGE_SESSION_KEY = 'laplace.webmcp.bridge-session';
type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Persist the issued session token, never the single-use registration token or note content. */
export function saveBridgeSession(
  vaultId: string,
  credentials: BridgeCredentials | null,
  storage?: SessionStorage,
) {
  try {
    const target = storage ?? window.sessionStorage;
    if (credentials)
      target.setItem(BRIDGE_SESSION_KEY, JSON.stringify({ version: 1, vaultId, ...credentials }));
    else target.removeItem(BRIDGE_SESSION_KEY);
  } catch {
    // A live connection still works when the browser disables session storage.
  }
}

export function loadBridgeSession(
  vaultId: string,
  host: string,
  storage?: SessionStorage,
): BridgeCredentials | null {
  try {
    const target = storage ?? window.sessionStorage;
    const raw = target.getItem(BRIDGE_SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (
      value?.version !== 1 ||
      value.vaultId !== vaultId ||
      value.host !== host ||
      typeof value.server !== 'string' ||
      typeof value.token !== 'string' ||
      !value.token ||
      !Number.isFinite(value.expiresAt) ||
      value.expiresAt <= Date.now()
    )
      throw new Error('Stale bridge session');
    return {
      server: webMcpServer(value.server),
      token: value.token,
      host: value.host,
      expiresAt: value.expiresAt,
    };
  } catch {
    saveBridgeSession(vaultId, null, storage);
    return null;
  }
}

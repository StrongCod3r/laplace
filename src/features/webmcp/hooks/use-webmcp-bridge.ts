import { useEffect, useRef, useState } from 'preact/hooks';
import type { WorkspaceController } from '@/features/editor/types';
import type { WorkspaceAccess } from '@/features/workspace/types';
import { WebMcpConnection } from '../services/connection';
import { loadBridgeSession, saveBridgeSession } from '../services/bridge-session';

export function useWebMcpBridge(
  controller: WorkspaceController | null,
  vaultId: string | null,
  access: WorkspaceAccess,
) {
  const [status, setStatus] = useState('Disconnected');
  const connection = useRef<WebMcpConnection | null>(null);
  const available = !!controller && !!vaultId && ['writable', 'readonly'].includes(access);
  function newConnection() {
    if (!available || !controller || !vaultId) return null;
    connection.current?.disconnect();
    const next: WebMcpConnection = new WebMcpConnection(
      (name, args) => controller.invokeWebMcpTool(vaultId, name, args, { signal: next.signal }),
      setStatus,
      (credentials) => saveBridgeSession(vaultId, credentials),
    );
    connection.current = next;
    return next;
  }
  useEffect(() => {
    if (access === 'blocked') saveBridgeSession(vaultId ?? '', null);
    if (!available || !vaultId) return;
    const saved = loadBridgeSession(vaultId, window.location.host.replace(/[.:]/g, '_'));
    if (saved) {
      const next = newConnection();
      try {
        next?.resume(saved);
      } catch {
        next?.disconnect('Session expired. Generate a new token.');
      }
    }
    return () => {
      // Keep only the current tab's authorized session across reloads and remounts.
      // A different vault is rejected and cleared by loadBridgeSession after hydration.
      connection.current?.disconnect('Disconnected', { preserveSession: true });
      connection.current = null;
    };
  }, [controller, vaultId, available, access === 'blocked']);

  function connect(token: string) {
    const next = newConnection();
    if (!next) return;
    try {
      next.connect(token);
    } catch (error) {
      next.disconnect(error instanceof Error ? error.message : 'Connection failed.');
    }
  }
  return { status, available, connect, disconnect: () => connection.current?.disconnect() };
}

import { useEffect, useState } from 'preact/hooks';
import type { WorkspaceController } from '@/features/editor/types';
import {
  nativeModelContext,
  registerNativeWebMcp,
  type NativeWebMcpStatus,
} from '../services/native';

export function useNativeWebMcp(
  controller: WorkspaceController | null,
  vaultId: string | null,
  available: boolean,
) {
  const [status, setStatus] = useState<NativeWebMcpStatus>('checking');
  useEffect(() => {
    try {
      const context = nativeModelContext(document);
      if (!context) {
        setStatus('unsupported');
        return;
      }
      if (!available || !controller || !vaultId) {
        setStatus('waiting');
        return;
      }
      setStatus('registering');
      const session = registerNativeWebMcp(context, controller, vaultId, setStatus);
      return session.dispose;
    } catch {
      setStatus('error');
    }
  }, [controller, vaultId, available]);
  return status;
}

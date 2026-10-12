import { render } from 'preact';
import { App } from '@/app/App';
import { useWorkspaceStore } from '@/store/workspace.store';

export async function remountWorkspace({ flush = true } = {}) {
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing application root');
  if (flush) await useWorkspaceStore.getState().controller?.flush();
  render(null, root);
  if (useWorkspaceStore.getState().controller !== null)
    throw new Error('Controller was not disposed');
  render(<App />, root);
}

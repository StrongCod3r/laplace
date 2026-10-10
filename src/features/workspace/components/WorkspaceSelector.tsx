import { withModuleClasses } from '@/shared/lib/css-classes';
import workspaceStyles from './Workspace.module.css';
import { Icon } from '@/shared/components/Icon';
import { useWorkspaceStore } from '@/store/workspace.store';

const styles = workspaceStyles;

export function WorkspaceSelector() {
  const locations = useWorkspaceStore((state) => state.ui.locations);
  const controller = useWorkspaceStore((state) => state.controller);
  const gitBusy = useWorkspaceStore((state) => state.gitBusy);
  const active = locations.find((location) => location.active)?.id || 'browser';
  const canCloseSelected = locations.some((location) => location.id === active);
  return (
    <div className={withModuleClasses(styles, 'sidebar-footer')} inert={gitBusy}>
      <div className={withModuleClasses(styles, 'vault-footer')}>
        <div className={withModuleClasses(styles, 'vault-footer-heading')}>
          <div className={withModuleClasses(styles, 'vault-footer-label')}>Workspace</div>
          <div className={withModuleClasses(styles, 'workspace-footer-actions')}>
            <button
              type="button"
              id="saveBrowserWorkspaceBtn"
              className={withModuleClasses(styles, 'vault-action workspace-local-copy hidden')}
              title="Save a local copy of the current Browser storage workspace"
              aria-label="Save a local copy of the current Browser storage workspace"
            >
              <Icon name="download" size="16" />
            </button>
            <button
              type="button"
              className={withModuleClasses(styles, 'vault-action')}
              id="chooseDirectoryBtn"
              title="Add or open a local workspace"
              aria-label="Add or open a local workspace"
            >
              <Icon name="folder-plus" size="16" />
            </button>
            <button
              type="button"
              className={withModuleClasses(styles, 'vault-action')}
              id="closeWorkspaceBtn"
              title="Close selected workspace"
              aria-label="Close selected workspace"
              disabled={!canCloseSelected}
              onClick={(event) => {
                event.stopPropagation();
                controller?.invoke('requestCloseSelectedWorkspace');
              }}
            >
              <Icon name="x" size="16" />
            </button>
          </div>
        </div>
        <div className={withModuleClasses(styles, 'workspace-controls')}>
          <select
            id="workspaceSelect"
            className={withModuleClasses(styles, 'vault-select')}
            aria-label="Switch workspace"
            value={active}
            onChange={(event) => {
              event.stopPropagation();
              controller?.invoke('switchWorkspaceLocation', event.currentTarget.value);
            }}
          >
            {locations.length ? (
              locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))
            ) : (
              <option value="browser">Browser storage</option>
            )}
          </select>
        </div>
      </div>
    </div>
  );
}

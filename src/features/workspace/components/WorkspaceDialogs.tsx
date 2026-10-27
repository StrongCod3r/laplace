import { withModuleClasses } from '@/shared/lib/css-classes';
import workspaceStyles from './Workspace.module.css';
import { memo } from 'preact/compat';
import { Icon } from '@/shared/components/Icon';

const styles = workspaceStyles;

export const WorkspaceDialogs = memo(function WorkspaceDialogs() {
  return (
    <>
      <div
        id="workspaceAccessNotice"
        className={withModuleClasses(styles, 'workspace-access-notice hidden')}
        role="alertdialog"
        aria-modal="true"
        aria-hidden="true"
        aria-labelledby="workspaceAccessTitle"
      >
        <section className={withModuleClasses(styles, 'workspace-access-card')}>
          <div className={withModuleClasses(styles, 'workspace-access-lock')} aria-hidden="true">
            <Icon name="shield-lock" size="24" className={withModuleClasses(styles, '')} />
          </div>
          <h2 id="workspaceAccessTitle">{'Workspace disconnected'}</h2>
          <p id="workspaceAccessMessage">{'Cannot verify synchronization with local files.'}</p>
          <button
            id="workspaceReconnectBtn"
            type="button"
            className={withModuleClasses(styles, 'primary-btn')}
          >
            {'Grant access again'}
          </button>
          <button
            id="workspaceDisconnectCloseBtn"
            type="button"
            className={withModuleClasses(styles, 'primary-btn')}
          >
            {'Close workspace'}
          </button>
        </section>
      </div>
      <div
        id="workspaceCloseDialog"
        className={withModuleClasses(styles, 'modal-backdrop hidden')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspaceCloseTitle"
        aria-describedby="workspaceCloseMessage"
      >
        <div className={withModuleClasses(styles, 'vault-dialog panel')}>
          <h3 id="workspaceCloseTitle">{'Close workspace?'}</h3>
          <p
            id="workspaceCloseMessage"
            className={withModuleClasses(styles, 'workspace-close-message')}
          ></p>
          <div className={withModuleClasses(styles, 'vault-dialog-actions')}>
            <button
              type="button"
              className={withModuleClasses(styles, 'vault-dialog-cancel')}
              id="workspaceCloseCancel"
            >
              {'Cancel'}
            </button>
            <button
              type="button"
              className={withModuleClasses(styles, 'vault-dialog-confirm')}
              id="workspaceCloseConfirm"
            >
              {'Close workspace'}
            </button>
          </div>
        </div>
      </div>
      <div
        id="vaultDialog"
        className={withModuleClasses(styles, 'modal-backdrop hidden')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vaultDialogTitle"
      >
        <div className={withModuleClasses(styles, 'vault-dialog panel')}>
          <h3 id="vaultDialogTitle">{'Create vault'}</h3>
          <input
            id="vaultDialogInput"
            className={withModuleClasses(styles, 'vault-dialog-input')}
            type="text"
            maxLength={80}
            autoComplete="off"
            spellcheck={false}
          />
          <div
            id="vaultDialogError"
            className={withModuleClasses(styles, 'vault-dialog-error')}
            aria-live="polite"
          ></div>
          <div className={withModuleClasses(styles, 'vault-dialog-actions')}>
            <button
              type="button"
              className={withModuleClasses(styles, 'vault-dialog-cancel')}
              data-vault-dialog-cancel
            >
              {'Cancel'}
            </button>
            <button
              type="button"
              className={withModuleClasses(styles, 'vault-dialog-confirm')}
              id="vaultDialogConfirm"
            >
              {'Create'}
            </button>
          </div>
        </div>
      </div>
      <div
        id="newFolderDialog"
        className={withModuleClasses(styles, 'modal-backdrop hidden')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="newFolderDialogTitle"
      >
        <div className={withModuleClasses(styles, 'vault-dialog panel')}>
          <h3 id="newFolderDialogTitle">{'New folder'}</h3>
          <input
            id="newFolderNameInput"
            className={withModuleClasses(styles, 'vault-dialog-input')}
            type="text"
            autoComplete="off"
            spellcheck={false}
            aria-label="Folder name"
            placeholder="Folder name"
          />
          <div
            id="newFolderNameError"
            className={withModuleClasses(styles, 'vault-dialog-error')}
            aria-live="polite"
          ></div>
          <div className={withModuleClasses(styles, 'vault-dialog-actions')}>
            <button
              type="button"
              className={withModuleClasses(styles, 'vault-dialog-cancel')}
              id="newFolderCancel"
              data-new-folder-cancel
            >
              {'Cancel'}
            </button>
            <button
              type="button"
              className={withModuleClasses(styles, 'vault-dialog-confirm')}
              id="newFolderConfirm"
            >
              {'Create'}
            </button>
          </div>
        </div>
      </div>
      <div
        id="deleteConfirmDialog"
        className={withModuleClasses(styles, 'modal-backdrop hidden')}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="deleteConfirmTitle"
        aria-describedby="deleteConfirmMessage"
      >
        <div className={withModuleClasses(styles, 'vault-dialog panel')}>
          <h3 id="deleteConfirmTitle">{'Delete item?'}</h3>
          <p
            id="deleteConfirmMessage"
            className={withModuleClasses(styles, 'workspace-close-message')}
          ></p>
          <div className={withModuleClasses(styles, 'vault-dialog-actions')}>
            <button
              type="button"
              className={withModuleClasses(styles, 'vault-dialog-cancel')}
              id="deleteConfirmCancel"
            >
              {'Cancel'}
            </button>
            <button
              type="button"
              className={withModuleClasses(styles, 'vault-dialog-confirm destructive')}
              id="deleteConfirmAccept"
            >
              {'Delete'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
});

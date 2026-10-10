import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import {
  formatAutoCommitMessage,
  validateGitAutoCommitSettings,
} from '../services/git-auto-commit';
import type { GitAutoCommitSettings } from '../services/git-auto-commit';
import styles from './GitAutoCommitDialog.module.css';

interface Props {
  settings: GitAutoCommitSettings;
  workspaceName: string;
  error: string;
  busy: boolean;
  onClose(): void;
  onSave(settings: GitAutoCommitSettings): void;
}

export function GitAutoCommitDialog({
  settings,
  workspaceName,
  error,
  busy,
  onClose,
  onSave,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [autoPush, setAutoPush] = useState(settings.autoPush);
  const [interval, setInterval] = useState(String(settings.intervalMinutes));
  const [messageFormat, setMessageFormat] = useState(settings.messageFormat);
  const [validationError, setValidationError] = useState('');

  useLayoutEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);

  const intervalMinutes = interval.trim() ? Number(interval) : Number.NaN;
  const draft = { enabled, autoPush, intervalMinutes, messageFormat };
  const validation = validateGitAutoCommitSettings(draft);
  const preview = formatAutoCommitMessage(messageFormat, {
    workspace: workspaceName,
    branch: 'main',
    date: new Date(),
  });

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="gitAutoCommitTitle"
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          if (validation) {
            setValidationError(validation);
            return;
          }
          setValidationError('');
          onSave(draft);
        }}
      >
        <h2 id="gitAutoCommitTitle">Automatic commits</h2>
        <p className={styles.description}>
          Create a local commit when the workspace has saved changes.
        </p>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            disabled={busy}
            checked={enabled}
            onChange={(event) => setEnabled(event.currentTarget.checked)}
          />
          Enable automatic commits
        </label>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            disabled={busy}
            checked={autoPush}
            onChange={(event) => setAutoPush(event.currentTarget.checked)}
          />
          Auto push
        </label>
        <p className={styles.hint}>
          Push pending commits to the remote after each scheduled check.
        </p>
        <label>
          Interval (minutes)
          <input
            type="number"
            disabled={busy}
            min="1"
            max="10080"
            step="1"
            required
            value={interval}
            onInput={(event) => setInterval(event.currentTarget.value)}
          />
        </label>
        <label>
          Commit message format
          <input
            type="text"
            disabled={busy}
            maxLength={500}
            required
            value={messageFormat}
            onInput={(event) => setMessageFormat(event.currentTarget.value)}
          />
        </label>
        <p className={styles.hint}>
          Use {'{workspace}'}, {'{branch}'}, {'{date}'} or {'{time}'} as placeholders.
        </p>
        <p className={styles.preview}>
          Preview: <span>{preview || 'Enter a commit message format.'}</span>
        </p>
        {(validationError || error) && (
          <p className={styles.error} role="alert">
            {validationError || error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={styles.primary}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

import { Icon } from '@/shared/components/Icon';
import styles from './GitPanel.module.css';

export function GitFileIcon({ path }: { path: string }) {
  const extension = path.split('.').at(-1)?.toLowerCase();
  if (extension === 'tsx' || extension === 'jsx')
    return (
      <svg
        className={styles.reactIcon}
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle cx="12" cy="12" r="1.8" fill="currentColor" />
        {[0, 60, 120].map((angle) => (
          <ellipse
            key={angle}
            cx="12"
            cy="12"
            rx="11"
            ry="4.2"
            stroke="currentColor"
            strokeWidth="1.3"
            transform={`rotate(${angle} 12 12)`}
          />
        ))}
      </svg>
    );
  if (extension === 'ts' || extension === 'js')
    return (
      <span
        aria-hidden="true"
        className={`${styles.fileTypeIcon} ${extension === 'ts' ? styles.tsIcon : styles.jsIcon}`}
      >
        {extension.toUpperCase()}
      </span>
    );
  if (extension === 'css' || extension === 'scss')
    return (
      <span aria-hidden="true" className={`${styles.fileTypeIcon} ${styles.cssIcon}`}>
        CSS
      </span>
    );
  return (
    <span className={styles.documentIcon}>
      <Icon name={extension === 'md' || extension === 'txt' ? 'file-text' : 'file'} size="16" />
    </span>
  );
}

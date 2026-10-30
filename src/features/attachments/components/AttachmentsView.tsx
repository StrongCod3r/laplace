import { withModuleClasses } from '@/shared/lib/css-classes';
import attachmentsStyles from './Attachments.module.css';
import { Icon, NoteIcon } from '@/shared/components/Icon';
import { useWorkspaceStore } from '@/store/workspace.store';
import { useEffect, useRef, useState } from 'preact/hooks';

const styles = attachmentsStyles;

export function AttachmentsView() {
  const gallery = useWorkspaceStore((state) => state.ui.gallery);
  const isActive = useWorkspaceStore((state) => state.ui.mainView === 'attachments');
  const controller = useWorkspaceStore((state) => state.controller);
  const writable = useWorkspaceStore((state) => state.ui.access === 'writable' && !state.gitBusy);
  const [cleaning, setCleaning] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [gallery.page, gallery.filter]);
  const status = gallery.loading
    ? 'Loading files…'
    : gallery.error
      ? 'Folder unavailable'
      : gallery.filter
        ? `${gallery.count} of ${gallery.totalCount} files · .attachments`
        : `${gallery.count} file${gallery.count === 1 ? '' : 's'} · .attachments`;
  const start = gallery.page * 24;
  return (
    <section
      id="attachmentsView"
      className={withModuleClasses(styles, `attachments-view${isActive ? '' : ' hidden'}`)}
      aria-label="Attachments"
      aria-busy={gallery.loading || cleaning}
    >
      <header className={withModuleClasses(styles, 'graph-toolbar attachments-gallery-header')}>
        <div className={withModuleClasses(styles, 'graph-title')}>
          <b>Attachments</b>
          <span>{status}</span>
        </div>
        <div className={withModuleClasses(styles, 'attachments-filter')}>
          <input
            type="text"
            aria-label="Filter attachments by file pattern"
            placeholder="Filter files, e.g. *.svg;*.png"
            title="Separate file patterns with ; to match any. * matches text, ? matches one character, ** matches folders (case-insensitive)"
            value={gallery.filter}
            aria-invalid={!!gallery.filterError}
            aria-describedby={gallery.filterError ? 'attachmentsFilterError' : undefined}
            spellcheck={false}
            onInput={(event) =>
              controller?.invoke('setAttachmentGalleryFilter', event.currentTarget.value)
            }
          />
          {gallery.filterError && (
            <span id="attachmentsFilterError" role="status">
              {gallery.filterError}
            </span>
          )}
        </div>
        <div className={withModuleClasses(styles, 'graph-controls')}>
          <button
            type="button"
            className={withModuleClasses(
              styles,
              `graph-control-btn attachments-cleanup-btn${cleaning ? ' cleaning' : ''}`,
            )}
            disabled={
              !writable || !controller || gallery.loading || cleaning || !gallery.totalCount
            }
            title={
              cleaning
                ? 'Checking unused files…'
                : 'Delete attachments that are not referenced in this workspace'
            }
            aria-label={cleaning ? 'Checking unused files…' : 'Clean unused assets'}
            onClick={async () => {
              setCleaning(true);
              try {
                await controller?.invoke('cleanupUnusedAttachments');
              } finally {
                setCleaning(false);
              }
            }}
          >
            <Icon name={cleaning ? 'loader-circle' : 'brush-cleaning'} size="16" />
          </button>
          <button
            type="button"
            className={withModuleClasses(styles, 'graph-control-btn')}
            data-attachments-refresh
            title="Refresh attachments"
            aria-label="Refresh attachments"
            disabled={gallery.loading || cleaning}
          >
            <Icon name="refresh-cw" size="16" />
          </button>
        </div>
      </header>
      <div ref={contentRef} className={withModuleClasses(styles, 'attachments-gallery-content')}>
        {gallery.loading ? (
          <div className={withModuleClasses(styles, 'attachments-gallery-status')}>
            Loading attachments…
          </div>
        ) : gallery.error ? (
          <div className={withModuleClasses(styles, 'attachments-gallery-status')}>
            {gallery.error}
            <button
              type="button"
              className={withModuleClasses(styles, 'attachments-retry-btn')}
              data-attachments-refresh
            >
              Try again
            </button>
          </div>
        ) : !gallery.count ? (
          <div className={withModuleClasses(styles, 'attachments-gallery-status')}>
            {gallery.filterError
              ? 'Enter a valid file pattern to filter attachments.'
              : gallery.totalCount
                ? 'No attachments match this pattern.'
                : 'No files in .attachments yet.'}
          </div>
        ) : (
          <div className={withModuleClasses(styles, 'attachments-gallery-grid')} role="list">
            {gallery.items.map((item) => (
              <div
                key={item.path}
                className={withModuleClasses(
                  styles,
                  `attachment-gallery-card${item.references.length ? '' : ' attachment-gallery-unreferenced'}`,
                )}
                role="listitem"
              >
                {item.image ? (
                  <button
                    type="button"
                    className={withModuleClasses(styles, 'attachment-gallery-thumb')}
                    data-attachment-preview={item.path}
                    title={`Preview ${item.name}`}
                    aria-label={`Preview image ${item.name}`}
                  >
                    <img
                      src={item.source}
                      data-attachment-path={item.path}
                      alt={item.name}
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                ) : (
                  <div
                    className={withModuleClasses(
                      styles,
                      'attachment-gallery-thumb attachment-gallery-file',
                    )}
                    aria-hidden="true"
                  >
                    <NoteIcon html={item.iconHTML} />
                  </div>
                )}
                <div className={withModuleClasses(styles, 'attachment-gallery-copy')}>
                  <b title={item.name}>{item.name}</b>
                </div>
                <div className={withModuleClasses(styles, 'attachment-gallery-actions')}>
                  <button
                    type="button"
                    className={withModuleClasses(styles, 'attachment-gallery-reference-trigger')}
                    data-attachment-references-path={item.path}
                    aria-pressed={gallery.selectedPath === item.path}
                    aria-label={`Show references for ${item.name}`}
                  >
                    {item.references.length
                      ? `Used in ${item.references.length} ${item.references.length === 1 ? 'page' : 'pages'}`
                      : 'Not referenced'}
                  </button>
                  {item.image && (
                    <button
                      type="button"
                      className={withModuleClasses(styles, 'attachment-gallery-copy-action')}
                      data-attachment-copy={item.path}
                      title={`Copy ${item.name} for pasting into a page`}
                      aria-label={`Copy image attachment ${item.name}`}
                    >
                      <Icon name="copy" size="14" />
                    </button>
                  )}
                  <button
                    type="button"
                    className={withModuleClasses(styles, 'attachment-gallery-delete')}
                    data-attachment-delete={item.path}
                    title={`Delete ${item.name}`}
                    aria-label={`Delete attachment ${item.name}`}
                  >
                    <Icon name="trash" size="14" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {gallery.pageCount > 1 && (
        <nav
          className={withModuleClasses(styles, 'attachments-pagination')}
          aria-label="Attachment pages"
        >
          <button
            type="button"
            data-attachment-page={gallery.page - 1}
            disabled={gallery.page === 0}
          >
            <Icon name="chevron-left" size="15" />
            <span>Previous</span>
          </button>
          <span>
            Showing {start + 1}–{Math.min(start + 24, gallery.count)} of {gallery.count} · Page{' '}
            {gallery.page + 1} of {gallery.pageCount}
          </span>
          <button
            type="button"
            data-attachment-page={gallery.page + 1}
            disabled={gallery.page >= gallery.pageCount - 1}
          >
            <span>Next</span>
            <Icon name="chevron-right" size="15" />
          </button>
        </nav>
      )}
    </section>
  );
}

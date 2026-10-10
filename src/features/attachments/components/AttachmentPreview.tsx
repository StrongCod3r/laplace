import { withModuleClasses } from '@/shared/lib/css-classes';
import attachmentsStyles from './Attachments.module.css';
import { memo } from 'preact/compat';
import { Icon } from '@/shared/components/Icon';

const styles = attachmentsStyles;

export const AttachmentPreview = memo(function AttachmentPreview() {
  return (
    <>
      <div
        id="attachmentPreview"
        className={withModuleClasses(styles, 'attachment-preview-backdrop hidden')}
        role="presentation"
        aria-hidden="true"
      >
        <section
          className={withModuleClasses(styles, 'attachment-preview-dialog')}
          role="dialog"
          aria-modal="true"
          aria-labelledby="attachmentPreviewTitle"
        >
          <header className={withModuleClasses(styles, 'attachment-preview-header')}>
            <div>
              <b id="attachmentPreviewTitle"></b>
              <small id="attachmentPreviewPath"></small>
            </div>
            <button
              type="button"
              className={withModuleClasses(styles, 'icon-btn')}
              data-attachment-preview-close
              title="Close preview"
              aria-label="Close preview"
            >
              <Icon name="x" size="18" className={withModuleClasses(styles, '')} />
            </button>
          </header>
          <div className={withModuleClasses(styles, 'attachment-preview-image-wrap')}>
            <img id="attachmentPreviewImage" alt="" />
          </div>
          <div
            className={withModuleClasses(styles, 'image-viewer-controls')}
            data-image-viewer-controls
            role="toolbar"
            aria-label="Image controls"
          >
            <button
              type="button"
              data-image-viewer-zoom="out"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <Icon name="zoom-out" size="16" className={withModuleClasses(styles, '')} />
            </button>
            <output data-image-viewer-zoom-value>100%</output>
            <button
              type="button"
              data-image-viewer-zoom="in"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <Icon name="zoom-in" size="16" className={withModuleClasses(styles, '')} />
            </button>
            <span
              className={withModuleClasses(styles, 'image-viewer-separator')}
              aria-hidden="true"
            />
            <button
              type="button"
              data-image-viewer-download
              title="Download image"
              aria-label="Download image"
            >
              <Icon name="download" size="16" className={withModuleClasses(styles, '')} />
            </button>
            <button
              type="button"
              data-image-viewer-fit
              title="Fit to screen"
              aria-label="Fit to screen"
            >
              <Icon name="locate-fixed" size="16" className={withModuleClasses(styles, '')} />
            </button>
          </div>
          <button
            type="button"
            className={withModuleClasses(styles, 'image-viewer-close')}
            data-image-viewer-close
            title="Close image"
            aria-label="Close image"
          >
            <Icon name="x" size="18" className={withModuleClasses(styles, '')} />
          </button>
        </section>
      </div>
    </>
  );
});

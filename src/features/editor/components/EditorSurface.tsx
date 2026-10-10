import { withModuleClasses } from '@/shared/lib/css-classes';
import editorStyles from './EditorSurface.module.css';
import { memo } from 'preact/compat';
import { Icon } from '@/shared/components/Icon';

const styles = editorStyles;

export const EditorSurface = memo(function EditorSurface() {
  return (
    <>
      <div
        id="editorDock"
        className={withModuleClasses(styles, 'editor-dock hidden')}
        aria-label="Docked editors"
      ></div>
      <section id="editorView" className={withModuleClasses(styles, 'editor-view')}>
        <article className={withModuleClasses(styles, 'page')} id="pageEditor">
          <div className={withModuleClasses(styles, 'note-inline-header')}>
            <button
              id="pageIcon"
              className={withModuleClasses(styles, 'page-icon hidden')}
              title="Change icon"
            ></button>
            <h1
              id="pageTitle"
              className={withModuleClasses(styles, 'page-title')}
              contentEditable="true"
              spellcheck={true}
              data-placeholder="Untitled"
            ></h1>
          </div>
          <div
            id="pageComments"
            className={withModuleClasses(styles, 'page-comments hidden')}
          ></div>
          <div id="blockEditor" className={withModuleClasses(styles, 'block-editor')}></div>
          <div id="emptyHint" className={withModuleClasses(styles, 'empty-hint')}>
            {'Type '}
            <b>{'/'}</b>
            {' for commands'}
          </div>
        </article>
      </section>
    </>
  );
});

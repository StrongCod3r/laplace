import { withModuleClasses } from '@/shared/lib/css-classes';
import commandsStyles from './CommandOverlays.module.css';
import { memo } from 'preact/compat';
import { Icon } from '@/shared/components/Icon';

const styles = commandsStyles;

export const CommandOverlays = memo(function CommandOverlays() {
  return (
    <>
      <div id="commandPalette" className={withModuleClasses(styles, 'modal-backdrop hidden')}>
        <div className={withModuleClasses(styles, 'command-palette panel')}>
          <div className={withModuleClasses(styles, 'command-search-row')}>
            <Icon name="search" size="18" className={withModuleClasses(styles, '')} />
            <input
              id="commandSearch"
              placeholder="Search pages and actions..."
              autoComplete="off"
            />
          </div>
          <div id="commandResults" className={withModuleClasses(styles, 'command-results')}></div>
        </div>
      </div>
      <div id="slashMenu" className={withModuleClasses(styles, 'floating-menu hidden')}>
        <div className={withModuleClasses(styles, 'menu-search')}>
          <input id="slashSearch" placeholder="Filter..." />
        </div>
        <div id="slashResults" className={withModuleClasses(styles, 'slash-results')}></div>
      </div>
      <div
        id="emojiMenu"
        className={withModuleClasses(styles, 'floating-menu emoji-menu hidden')}
        role="dialog"
        aria-label="Emoji picker"
      >
        <div id="emojiResults" className={withModuleClasses(styles, 'emoji-results')}></div>
      </div>
      <div id="blockMenu" className={withModuleClasses(styles, 'floating-menu hidden')}></div>
      <div
        id="inlineEquationPanel"
        className={withModuleClasses(styles, 'inline-equation-panel hidden')}
        role="dialog"
        aria-label="Inline equation"
        aria-modal="false"
      >
        <label htmlFor="inlineEquationInput">Inline equation</label>
        <textarea
          id="inlineEquationInput"
          data-equation-input
          rows={3}
          spellcheck={false}
          placeholder={'e.g. \\frac{x^2}{2}'}
          aria-describedby="inlineEquationHint inlineEquationError"
        />
        <div id="inlineEquationHint" className={withModuleClasses(styles, 'equation-hint')}>
          Write LaTeX. Enter to apply · Esc to cancel
        </div>
        <div
          data-equation-preview
          className={withModuleClasses(styles, 'equation-preview')}
          aria-label="Equation preview"
        ></div>
        <div
          id="inlineEquationError"
          data-equation-error
          className={withModuleClasses(styles, 'equation-error')}
          role="status"
          hidden
        ></div>
        <div className={withModuleClasses(styles, 'equation-actions')}>
          <button type="button" data-equation-remove hidden>
            Remove equation
          </button>
          <button type="button" data-equation-cancel>
            Cancel
          </button>
          <button type="button" data-equation-save>
            Done
          </button>
        </div>
      </div>
      <div
        id="textFormatToolbar"
        className={withModuleClasses(styles, 'text-format-toolbar hidden')}
        role="toolbar"
        aria-label="Text formatting"
      >
        <button
          type="button"
          data-format-equation
          title="Inline equation"
          aria-label="Inline equation"
        >
          <Icon name="radical" size="16" />
        </button>
        <div style={{ position: 'relative' }} data-format-type-control>
          <button
            type="button"
            className={withModuleClasses(styles, 'format-type-btn')}
            data-format-type-toggle
            title="Turn into"
          >
            <span data-format-type-label>{'Normal text'}</span>
            <Icon
              name="chevron-down"
              size="16"
              className={withModuleClasses(styles, 'ui-chevron')}
            />
          </button>
          <div
            className={withModuleClasses(styles, 'text-format-popover type-menu hidden')}
            data-format-type-menu
          >
            <button data-format-block-type="text">{'Normal text'}</button>
            <button data-format-block-type="h1">{'Heading 1'}</button>
            <button data-format-block-type="h2">{'Heading 2'}</button>
            <button data-format-block-type="h3">{'Heading 3'}</button>
            <button data-format-block-type="h4">{'Heading 4'}</button>
            <button data-format-block-type="h5">{'Heading 5'}</button>
            <button data-format-block-type="h6">{'Heading 6'}</button>
            <button data-format-block-type="bullet">{'Bulleted list'}</button>
            <button data-format-block-type="number">{'Numbered list'}</button>
            <button data-format-block-type="todo">{'To-do list'}</button>
            <button data-format-block-type="quote">{'Quote'}</button>
            <button data-format-block-type="callout">{'Callout'}</button>
          </div>
        </div>
        <span className={withModuleClasses(styles, 'format-sep')} data-format-type-separator></span>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className={withModuleClasses(styles, 'format-color-btn')}
            data-format-color-toggle
            title="Text color and highlight"
          >
            {'A'}
          </button>
          <div
            className={withModuleClasses(styles, 'text-format-popover color-menu hidden')}
            data-format-color-menu
          >
            <div className={withModuleClasses(styles, 'format-color-section-title')}>
              {'Text color'}
            </div>
            <div className={withModuleClasses(styles, 'format-color-grid')}>
              <button data-format-color="default" title="Default">
                <span className={withModuleClasses(styles, 'format-color-chip text-default')}>
                  {'A'}
                </span>
              </button>
              <button data-format-color="gray" title="Gray">
                <span className={withModuleClasses(styles, 'format-color-chip inline-color-gray')}>
                  {'A'}
                </span>
              </button>
              <button data-format-color="brown" title="Brown">
                <span className={withModuleClasses(styles, 'format-color-chip inline-color-brown')}>
                  {'A'}
                </span>
              </button>
              <button data-format-color="orange" title="Orange">
                <span
                  className={withModuleClasses(styles, 'format-color-chip inline-color-orange')}
                >
                  {'A'}
                </span>
              </button>
              <button data-format-color="yellow" title="Yellow">
                <span
                  className={withModuleClasses(styles, 'format-color-chip inline-color-yellow')}
                >
                  {'A'}
                </span>
              </button>
              <button data-format-color="green" title="Green">
                <span className={withModuleClasses(styles, 'format-color-chip inline-color-green')}>
                  {'A'}
                </span>
              </button>
              <button data-format-color="blue" title="Blue">
                <span className={withModuleClasses(styles, 'format-color-chip inline-color-blue')}>
                  {'A'}
                </span>
              </button>
              <button data-format-color="purple" title="Purple">
                <span
                  className={withModuleClasses(styles, 'format-color-chip inline-color-purple')}
                >
                  {'A'}
                </span>
              </button>
              <button data-format-color="pink" title="Pink">
                <span className={withModuleClasses(styles, 'format-color-chip inline-color-pink')}>
                  {'A'}
                </span>
              </button>
              <button data-format-color="red" title="Red">
                <span className={withModuleClasses(styles, 'format-color-chip inline-color-red')}>
                  {'A'}
                </span>
              </button>
            </div>
            <div className={withModuleClasses(styles, 'format-color-section-title')}>
              {'Background'}
            </div>
            <div className={withModuleClasses(styles, 'format-color-grid')}>
              <button data-format-background="default" title="No highlight">
                <span className={withModuleClasses(styles, 'format-color-chip text-default')}>
                  {'A'}
                </span>
              </button>
              <button data-format-background="gray" title="Gray background">
                <span className={withModuleClasses(styles, 'format-color-chip inline-bg-gray')}>
                  {'A'}
                </span>
              </button>
              <button data-format-background="brown" title="Brown background">
                <span className={withModuleClasses(styles, 'format-color-chip inline-bg-brown')}>
                  {'A'}
                </span>
              </button>
              <button data-format-background="orange" title="Orange background">
                <span className={withModuleClasses(styles, 'format-color-chip inline-bg-orange')}>
                  {'A'}
                </span>
              </button>
              <button data-format-background="yellow" title="Yellow background">
                <span className={withModuleClasses(styles, 'format-color-chip inline-bg-yellow')}>
                  {'A'}
                </span>
              </button>
              <button data-format-background="green" title="Green background">
                <span className={withModuleClasses(styles, 'format-color-chip inline-bg-green')}>
                  {'A'}
                </span>
              </button>
              <button data-format-background="blue" title="Blue background">
                <span className={withModuleClasses(styles, 'format-color-chip inline-bg-blue')}>
                  {'A'}
                </span>
              </button>
              <button data-format-background="purple" title="Purple background">
                <span className={withModuleClasses(styles, 'format-color-chip inline-bg-purple')}>
                  {'A'}
                </span>
              </button>
              <button data-format-background="pink" title="Pink background">
                <span className={withModuleClasses(styles, 'format-color-chip inline-bg-pink')}>
                  {'A'}
                </span>
              </button>
              <button data-format-background="red" title="Red background">
                <span className={withModuleClasses(styles, 'format-color-chip inline-bg-red')}>
                  {'A'}
                </span>
              </button>
            </div>
          </div>
        </div>
        <button type="button" data-format-inline="bold" title="Bold (Ctrl/Cmd+B)">
          <Icon name="bold" size="16" className={withModuleClasses(styles, '')} />
        </button>
        <button type="button" data-format-inline="italic" title="Italic (Ctrl/Cmd+I)">
          <Icon name="italic" size="16" className={withModuleClasses(styles, '')} />
        </button>
        <button type="button" data-format-inline="underline" title="Underline (Ctrl/Cmd+U)">
          <Icon name="underline" size="16" className={withModuleClasses(styles, '')} />
        </button>
        <button type="button" data-format-inline="strike" title="Strikethrough (Ctrl/Cmd+Shift+S)">
          <Icon name="strikethrough" size="16" className={withModuleClasses(styles, '')} />
        </button>
        <span className={withModuleClasses(styles, 'format-sep')}></span>
        <div style={{ position: 'relative' }}>
          <button type="button" data-format-link-toggle title="Link (Ctrl/Cmd+K)">
            <Icon name="link" size="16" className={withModuleClasses(styles, '')} />
          </button>
          <div
            className={withModuleClasses(styles, 'text-format-popover format-link-popover hidden')}
            data-format-link-popover
          >
            <label className={withModuleClasses(styles, 'format-link-field')}>
              <span>{'Page or URL'}</span>
              <div className={withModuleClasses(styles, 'format-link-row')}>
                <input
                  data-format-link-input
                  type="text"
                  autoComplete="off"
                  spellcheck={false}
                  placeholder="Search pages or paste a link…"
                />
                <button className={withModuleClasses(styles, 'primary')} data-format-link-apply>
                  {'Link'}
                </button>
              </div>
            </label>
            <div
              className={withModuleClasses(styles, 'format-link-results')}
              data-format-link-results
            ></div>
            <label className={withModuleClasses(styles, 'format-link-field')}>
              <span>{'Link title'}</span>
              <input
                data-format-link-title
                type="text"
                autoComplete="off"
                spellcheck={false}
                placeholder="Text to display"
              />
            </label>
            <button
              type="button"
              className={withModuleClasses(styles, 'format-link-remove hidden')}
              data-format-link-remove
            >
              {'Remove link'}
            </button>
          </div>
        </div>
        <button type="button" data-format-inline="code" title="Inline code (Ctrl/Cmd+E)">
          <Icon name="code-xml" size="16" className={withModuleClasses(styles, '')} />
        </button>
        <button
          type="button"
          data-format-clear
          aria-label="Clear formatting"
          title="Clear formatting"
        >
          <Icon name="remove-formatting" size="16" />
        </button>
      </div>
      <div
        id="linkEditPanel"
        className={withModuleClasses(styles, 'link-edit-panel hidden')}
        role="dialog"
        aria-label="Edit link"
      >
        <label className={withModuleClasses(styles, 'format-link-field')}>
          <span>{'Page or URL'}</span>
          <input
            data-format-link-input
            type="text"
            autoComplete="off"
            spellcheck={false}
            placeholder="https://example.com"
          />
        </label>
        <label className={withModuleClasses(styles, 'format-link-field')}>
          <span>{'Link title'}</span>
          <input
            data-format-link-title
            type="text"
            autoComplete="off"
            spellcheck={false}
            placeholder="Text to display"
          />
        </label>
        <div className={withModuleClasses(styles, 'link-edit-divider')}></div>
        <button
          type="button"
          className={withModuleClasses(styles, 'link-edit-remove')}
          data-format-link-remove
        >
          <Icon name="trash" size="17" className={withModuleClasses(styles, '')} />
          <span>{'Remove link'}</span>
        </button>
      </div>
      <div
        id="pageMetaMenu"
        className={withModuleClasses(styles, 'floating-menu page-meta-menu hidden')}
      ></div>
      <input
        id="pageIconFileInput"
        type="file"
        accept="image/svg+xml,image/png,image/jpeg,image/webp,image/gif,image/x-icon,.svg,.png,.jpg,.jpeg,.webp,.gif,.ico"
        hidden
      />
    </>
  );
});

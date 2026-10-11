import { APP_NAME } from './../../../app-identity';
import { withModuleClasses } from '@/shared/lib/css-classes';
import settingsStyles from './SettingsDialogs.module.css';
import { memo } from 'preact/compat';
import { Icon } from '@/shared/components/Icon';

const styles = settingsStyles;

export const SettingsDialogs = memo(function SettingsDialogs() {
  return (
    <>
      <div id="shareModal" className={withModuleClasses(styles, 'modal-backdrop hidden')}>
        <div className={withModuleClasses(styles, 'share-panel panel')}>
          <div className={withModuleClasses(styles, 'modal-title-row')}>
            <h3>{'Share'}</h3>
            <button className={withModuleClasses(styles, 'icon-btn')} data-close-modal>
              <Icon name="x" size="18" className={withModuleClasses(styles, '')} />
            </button>
          </div>
          <div className={withModuleClasses(styles, 'share-input-row')}>
            <input placeholder="Email or name" />
            <button>{'Invite'}</button>
          </div>
          <div className={withModuleClasses(styles, 'share-row')}>
            <div>
              <b>{'General access'}</b>
              <div className={withModuleClasses(styles, 'muted')}>
                {'Only invited people can access'}
              </div>
            </div>
            <button className={withModuleClasses(styles, 'select-btn')}>
              <span className={withModuleClasses(styles, 'select-btn-label')}>{'Restricted'}</span>
              <Icon
                name="chevron-down"
                size="16"
                className={withModuleClasses(styles, 'ui-chevron select-chevron')}
              />
            </button>
          </div>
          <div className={withModuleClasses(styles, 'share-row')}>
            <div>
              <b>{'Publish to web'}</b>
              <div className={withModuleClasses(styles, 'muted')}>
                {'Create a public link to this page'}
              </div>
            </div>
            <button id="publishToggle" className={withModuleClasses(styles, 'toggle')}>
              <span></span>
            </button>
          </div>
        </div>
      </div>
      <div id="settingsModal" className={withModuleClasses(styles, 'modal-backdrop hidden')}>
        <div className={withModuleClasses(styles, 'settings-panel panel')}>
          <div className={withModuleClasses(styles, 'settings-header')}>
            <div className={withModuleClasses(styles, 'modal-title-row')}>
              <h3>{'Settings'}</h3>
              <button className={withModuleClasses(styles, 'icon-btn')} data-close-modal>
                <Icon name="x" size="18" className={withModuleClasses(styles, '')} />
              </button>
            </div>
            <div
              className={withModuleClasses(styles, 'settings-tabs')}
              role="tablist"
              aria-label="Settings sections"
            >
              <button
                className={withModuleClasses(styles, 'settings-tab active')}
                type="button"
                data-settings-tab="general"
                role="tab"
                aria-selected="true"
              >
                <Icon name="settings" size="15" className={withModuleClasses(styles, '')} />
                <span>{'General'}</span>
              </button>
              <button
                className={withModuleClasses(styles, 'settings-tab')}
                type="button"
                data-settings-tab="shortcuts"
                role="tab"
                aria-selected="false"
              >
                <Icon name="list-checks" size="15" className={withModuleClasses(styles, '')} />
                <span>{'Keyboard shortcuts'}</span>
              </button>
            </div>
          </div>
          <div className={withModuleClasses(styles, 'settings-content')}>
            <section
              className={withModuleClasses(styles, 'settings-view')}
              data-settings-view="general"
              role="tabpanel"
            >
              <div className={withModuleClasses(styles, 'setting-row')}>
                <div>
                  <b>{'Appearance'}</b>
                  <div className={withModuleClasses(styles, 'muted')}>
                    {'Choose the workspace theme'}
                  </div>
                </div>
                <button id="themeToggle" className={withModuleClasses(styles, 'select-btn')}>
                  <span className={withModuleClasses(styles, 'select-btn-label')}>{'System'}</span>
                  <Icon
                    name="chevron-down"
                    size="16"
                    className={withModuleClasses(styles, 'ui-chevron select-chevron')}
                  />
                </button>
              </div>
              <label className={withModuleClasses(styles, 'setting-row')} htmlFor="pageFont">
                <span>
                  <b>{'Page font'}</b>
                  <span className={withModuleClasses(styles, 'muted setting-description')}>
                    {'Choose the font used for page content'}
                  </span>
                </span>
                <select id="pageFont" className={withModuleClasses(styles, 'setting-select')}>
                  <option value="system">Default sans serif</option>
                  <option value="arial">Arial</option>
                  <option value="georgia">Georgia</option>
                  <option value="serif">Serif</option>
                  <option value="monospace">Monospace</option>
                </select>
              </label>
              <label
                className={withModuleClasses(styles, 'setting-row')}
                htmlFor="spellcheckEnabled"
              >
                <span>
                  <b>{'Spellcheck'}</b>
                  <span className={withModuleClasses(styles, 'muted setting-description')}>
                    {'Check spelling while editing notes'}
                  </span>
                </span>
                <input
                  id="spellcheckEnabled"
                  type="checkbox"
                  aria-label="Enable spellcheck"
                  defaultChecked
                />
              </label>
              <label
                className={withModuleClasses(styles, 'setting-row')}
                htmlFor="showCustomPageIcons"
              >
                <span>
                  <b>{'Show custom page icons'}</b>
                  <span className={withModuleClasses(styles, 'muted setting-description')}>
                    {'Use custom icons for notes instead of the default note and folder icons'}
                  </span>
                </span>
                <input
                  id="showCustomPageIcons"
                  type="checkbox"
                  aria-label="Show custom page icons"
                  defaultChecked
                />
              </label>
              <label
                className={withModuleClasses(styles, 'setting-row')}
                htmlFor="showFilesAndTabIcons"
              >
                <span>
                  <b>{'Show icons in Files and tabs'}</b>
                  <span className={withModuleClasses(styles, 'muted setting-description')}>
                    {'Display note and folder icons in the Files tree and page tabs'}
                  </span>
                </span>
                <input
                  id="showFilesAndTabIcons"
                  type="checkbox"
                  aria-label="Show icons in Files and tabs"
                  defaultChecked
                />
              </label>
              <label
                className={withModuleClasses(styles, 'setting-row')}
                htmlFor="showBreadcrumbIcons"
              >
                <span>
                  <b>{'Show icons in breadcrumbs'}</b>
                  <span className={withModuleClasses(styles, 'muted setting-description')}>
                    {"Display each note's icon beside its name"}
                  </span>
                </span>
                <input
                  id="showBreadcrumbIcons"
                  type="checkbox"
                  aria-label="Show icons in breadcrumbs"
                />
              </label>
              <label
                className={withModuleClasses(styles, 'setting-row')}
                htmlFor="folderNotesEnabled"
              >
                <span>
                  <b>{'Folder notes'}</b>
                  <span className={withModuleClasses(styles, 'muted setting-description')}>
                    {'Open or create the matching note when you select a folder'}
                  </span>
                </span>
                <input
                  id="folderNotesEnabled"
                  type="checkbox"
                  aria-label="Enable folder notes"
                  defaultChecked
                />
              </label>
              <div className={withModuleClasses(styles, 'setting-row setting-range-row')}>
                <div>
                  <b>{'Tree icon size'}</b>
                  <div className={withModuleClasses(styles, 'muted')}>
                    {'Size of note and folder icons in the Files tree'}
                  </div>
                </div>
                <div className={withModuleClasses(styles, 'setting-range-control')}>
                  <input
                    id="treeIconSize"
                    type="range"
                    min="12"
                    max="32"
                    step="1"
                    defaultValue="14"
                    aria-label="Tree icon size"
                  />
                  <output id="treeIconSizeValue" htmlFor="treeIconSize">
                    {'14 px'}
                  </output>
                </div>
              </div>
              <div className={withModuleClasses(styles, 'setting-row hidden')} id="installAppRow">
                <div>
                  <b>{`Install ${APP_NAME}`}</b>
                  <div className={withModuleClasses(styles, 'muted')}>
                    {'Open your workspace from the desktop or home screen'}
                  </div>
                </div>
                <button id="installAppBtn">{'Install'}</button>
              </div>
              <div className={withModuleClasses(styles, 'setting-row')}>
                <div>
                  <b>{'Reset app settings'}</b>
                  <div className={withModuleClasses(styles, 'muted')}>
                    {
                      'Restore default preferences and keyboard shortcuts. Your notes and workspaces are kept.'
                    }
                  </div>
                </div>
                <button id="resetAppSettingsBtn" type="button">
                  {'Restore defaults'}
                </button>
              </div>
              <input id="imageFileInput" type="file" accept="image/*" hidden />
            </section>
            <section
              className={withModuleClasses(styles, 'settings-view hidden')}
              data-settings-view="shortcuts"
              role="tabpanel"
            >
              <p className={withModuleClasses(styles, 'shortcut-help')}>
                {
                  'Select a shortcut, then press a key combination. Use Backspace or Delete to clear it.'
                }
              </p>
              <div id="shortcutList" className={withModuleClasses(styles, 'shortcut-list')}></div>
              <div className={withModuleClasses(styles, 'shortcut-footer')}>
                <button
                  type="button"
                  className={withModuleClasses(styles, 'shortcut-reset-all')}
                  data-shortcuts-reset
                >
                  {'Reset shortcuts'}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
});

// @ts-nocheck
// Existing editor algorithms, isolated behind the typed controller boundary.
import { APP_SETTING_KEYS, APPEARANCE_KEYS, pickConfig } from '@/workspace-config';
import type { EditorRuntime } from '@/features/editor/types';

export function registerSettings(runtime: EditorRuntime) {
  const PAGE_FONT_STACKS = {
    system:
      'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    arial: 'Arial, Helvetica, sans-serif',
    georgia: 'Georgia, "Times New Roman", serif',
    serif: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
    monospace:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  } as const;

  type PageFont = keyof typeof PAGE_FONT_STACKS;

  function normalizePageFont(value: unknown): PageFont {
    const candidate = String(value);
    return Object.hasOwn(PAGE_FONT_STACKS, candidate) ? (candidate as PageFont) : 'system';
  }

  function applyPageFont() {
    const font = normalizePageFont(runtime.state.pageFont);
    runtime.state.pageFont = font;
    document.documentElement.style.setProperty('--page-font-family', PAGE_FONT_STACKS[font]);
  }

  function syncPageFontSettings() {
    if (runtime.els.pageFont)
      runtime.els.pageFont.value = normalizePageFont(runtime.state.pageFont);
    applyPageFont();
  }

  function normalizeShortcutValue(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    const parts = value
        .split('+')
        .map((part) => part.trim())
        .filter(Boolean),
      key = (parts.pop() || '').toUpperCase();
    const aliases = {
      CTRL: 'Mod',
      CONTROL: 'Mod',
      META: 'Mod',
      CMD: 'Mod',
      COMMAND: 'Mod',
      OPTION: 'Alt',
    };
    const modifiers = new Set();
    for (const part of parts) {
      const modifier =
        aliases[part.toUpperCase()] || part[0]?.toUpperCase() + part.slice(1).toLowerCase();
      if (!['Mod', 'Alt', 'Shift'].includes(modifier)) return '';
      modifiers.add(modifier);
    }
    if (!key || (!modifiers.has('Mod') && !modifiers.has('Alt'))) return '';
    const ordered = ['Mod', 'Alt', 'Shift'].filter((modifier) => modifiers.has(modifier));
    return [...ordered, key].join('+');
  }

  function normalizeWorkspaceShortcuts(shortcuts) {
    const source = shortcuts && typeof shortcuts === 'object' ? shortcuts : {};
    const normalized = {},
      used = new Set();
    for (const [action, fallback] of Object.entries(runtime.DEFAULT_SHORTCUTS)) {
      const provided = Object.prototype.hasOwnProperty.call(source, action);
      let value = provided ? runtime.normalizeShortcutValue(source[action]) : fallback;
      const reserved =
        runtime.RESERVED_SHORTCUTS.has(value) || (value === 'Mod+K' && action !== 'search');
      if (reserved || (value && used.has(value))) value = fallback;
      if (
        runtime.RESERVED_SHORTCUTS.has(value) ||
        (value === 'Mod+K' && action !== 'search') ||
        used.has(value)
      )
        value = '';
      normalized[action] = value;
      if (value) used.add(value);
    }
    return normalized;
  }

  function shortcutFromEvent(event) {
    if (event.getModifierState?.('AltGraph')) return '';
    if (['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) return '';
    const key =
      event.key === ' '
        ? 'Space'
        : event.key === '+'
          ? 'Plus'
          : event.key.length === 1
            ? event.key.toUpperCase()
            : event.key.toUpperCase();
    const modifiers = [];
    if (event.ctrlKey || event.metaKey) modifiers.push('Mod');
    if (event.altKey) modifiers.push('Alt');
    if (event.shiftKey) modifiers.push('Shift');
    return runtime.normalizeShortcutValue([...modifiers, key].join('+'));
  }

  function formatShortcut(value) {
    if (!value) return 'Not set';
    const mac = /Mac|iPhone|iPad/i.test(navigator.platform || '');
    const keyNames = {
      SPACE: 'Space',
      ESCAPE: 'Esc',
      PAGEUP: 'Page Up',
      PAGEDOWN: 'Page Down',
      ARROWUP: '↑',
      ARROWDOWN: '↓',
      ARROWLEFT: '←',
      ARROWRIGHT: '→',
    };
    return value
      .split('+')
      .map((part) =>
        part === 'Mod'
          ? mac
            ? '⌘'
            : 'Ctrl'
          : part === 'Alt'
            ? mac
              ? '⌥'
              : 'Alt'
            : part === 'Shift'
              ? mac
                ? '⇧'
                : 'Shift'
              : keyNames[part] || part,
      )
      .join(' + ');
  }

  function cycleTheme() {
    const options = ['system', 'light', 'dark'];
    runtime.state.theme = options[(options.indexOf(runtime.state.theme) + 1) % options.length];
    runtime.scheduleSave();
    runtime.applyTheme();
    runtime.toast(`Theme: ${runtime.state.theme}`);
  }

  function openSettings(view = 'general') {
    runtime.hideFloatingMenus();
    runtime.hideTextFormatToolbar();
    runtime.shortcutCaptureAction = null;
    runtime.updateSettingsText();
    runtime.syncPageFontSettings();
    runtime.syncTreeIconSizeSettings();
    runtime.syncCustomPageIconSettings();
    runtime.syncFilesAndTabIconSettings();
    runtime.syncBreadcrumbIconSettings();
    runtime.syncFolderNoteSettings();
    runtime.renderShortcutSettings();
    runtime.setSettingsView(view);
    runtime.els.settingsModal.classList.remove('hidden');
  }

  function setSettingsView(view) {
    const selected = ['general', 'shortcuts'].includes(view) ? view : 'general';
    if (selected !== 'shortcuts' && runtime.shortcutCaptureAction) {
      runtime.shortcutCaptureAction = null;
      runtime.renderShortcutSettings();
    }
    document.querySelectorAll('[data-settings-tab]').forEach((tab) => {
      const active = tab.dataset.settingsTab === selected;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    document
      .querySelectorAll('[data-settings-view]')
      .forEach((panel) =>
        panel.classList.toggle('hidden', panel.dataset.settingsView !== selected),
      );
  }

  function renderShortcutSettings() {
    if (!runtime.els.shortcutList) return;
    runtime.els.shortcutList.innerHTML = runtime.SHORTCUT_ACTIONS.map(({ id, label }) => {
      const recording = runtime.shortcutCaptureAction === id;
      const visibleLabel =
        id === 'redo' && runtime.state.shortcuts.redo === runtime.DEFAULT_SHORTCUTS.redo
          ? 'Redo (Ctrl/Cmd+Y also works)'
          : label;
      return runtime.htmlWithStyles(
        `<div class="shortcut-row"><span class="shortcut-label">${visibleLabel}</span><button type="button" class="shortcut-binding ${recording ? 'recording' : ''}" data-shortcut-action="${id}" aria-label="Set shortcut for ${label}">${recording ? 'Press keys…' : runtime.formatShortcut(runtime.state.shortcuts?.[id])}</button></div>`,
      );
    }).join('');
  }

  function resetAppSettings() {
    Object.assign(
      runtime.state,
      runtime.clone(
        pickConfig(runtime.DEFAULT_WORKSPACE, [
          ...APP_SETTING_KEYS,
          ...APPEARANCE_KEYS,
          'shortcuts',
        ]),
      ),
    );
    runtime.state.shortcuts = runtime.normalizeWorkspaceShortcuts(runtime.DEFAULT_SHORTCUTS);
    runtime.shortcutCaptureAction = null;
    runtime.scheduleSave();
    runtime.applyTheme();
    runtime.renderAll();
    runtime.syncPageFontSettings();
    runtime.syncTreeIconSizeSettings();
    runtime.renderShortcutSettings();
    runtime.toast('App settings restored to defaults');
  }

  function resetShortcuts() {
    runtime.shortcutCaptureAction = null;
    runtime.state.shortcuts = { ...runtime.DEFAULT_SHORTCUTS };
    runtime.scheduleSave();
    runtime.renderShortcutSettings();
    runtime.toast('Shortcuts reset to defaults');
  }

  function shortcutActionForEvent(event) {
    const shortcut = runtime.shortcutFromEvent(event);
    return (
      Object.keys(runtime.state.shortcuts || {}).find(
        (action) => shortcut && runtime.state.shortcuts[action] === shortcut,
      ) || null
    );
  }

  function runShortcutAction(action) {
    if (action === 'reopenClosedTab') {
      runtime.reopenClosedTab();
      return;
    }
    if (action === 'undo') {
      void runtime.undoWorkspace();
      return;
    }
    if (action === 'redo') {
      void runtime.redoWorkspace();
      return;
    }
    if (action === 'navigateBack') {
      runtime.navigateHistory(-1);
      return;
    }
    if (action === 'navigateForward') {
      runtime.navigateHistory(1);
      return;
    }
    if (action === 'search') {
      runtime.openCommandPalette();
      return;
    }
    if (action === 'favorite') {
      const page =
        runtime.state.mainView === 'page' && runtime.state.currentPageId !== '__home__'
          ? runtime.currentPage()
          : null;
      if (!page) return;
      page.favorite = !page.favorite;
      runtime.scheduleSave();
      runtime.renderSidebar();
      runtime.toast(page.favorite ? 'Added to favorites' : 'Removed from favorites');
      return;
    }
    if (action === 'comments') {
      if (runtime.state.mainView === 'page' && runtime.state.currentPageId !== '__home__')
        runtime.openComments();
      return;
    }
    if (action === 'share') {
      if (runtime.state.mainView === 'page' && runtime.state.currentPageId !== '__home__')
        runtime.els.shareModal.classList.remove('hidden');
      return;
    }
    if (action === 'toggleLeftSidebar') {
      runtime.state.sidebarOpen = !runtime.state.sidebarOpen;
      runtime.scheduleSave();
      runtime.updateWorkspaceChrome();
      return;
    }
    if (action === 'toggleRightSidebar') {
      runtime.state.rightSidebarOpen = !runtime.state.rightSidebarOpen;
      runtime.scheduleSave();
      runtime.updateWorkspaceChrome();
      return;
    }
    if (action === 'toggleTheme') {
      runtime.cycleTheme();
      return;
    }
    if (action === 'settings') {
      runtime.openSettings();
      return;
    }
    if (action === 'newPage') {
      runtime.createPage();
      return;
    }
    if (action === 'splitRight') {
      runtime.splitActiveTab('right');
      return;
    }
    if (action === 'splitDown') {
      runtime.splitActiveTab('bottom');
      return;
    }
    if (action === 'mergePanes') {
      runtime.resetEditorLayout();
      return;
    }
    if (action === 'graph') runtime.openGraphTab();
  }

  function updateSettingsText() {
    if (runtime.els.themeToggle)
      runtime.els.themeToggle.innerHTML = runtime.htmlWithStyles(
        `<span class="select-btn-label">${runtime.state.theme[0].toUpperCase() + runtime.state.theme.slice(1)}</span>${runtime.chevronSvg('down', 'select-chevron')}`,
      );
  }

  function syncTreeIconSizeSettings() {
    const size = runtime.normalizeTreeIconSize(runtime.state.treeIconSize);
    runtime.applyTreeIconSizes();
    if (runtime.els.treeIconSize && runtime.els.treeIconSize.value !== String(size))
      runtime.els.treeIconSize.value = String(size);
    const value = document.getElementById('treeIconSizeValue');
    if (value) value.textContent = `${size} px`;
  }

  function syncBreadcrumbIconSettings() {
    if (runtime.els.showBreadcrumbIcons)
      runtime.els.showBreadcrumbIcons.checked = runtime.state.showBreadcrumbIcons === true;
  }

  function syncCustomPageIconSettings() {
    if (runtime.els.showCustomPageIcons)
      runtime.els.showCustomPageIcons.checked = runtime.state.showCustomPageIcons !== false;
  }

  function syncSpellcheckSettings() {
    if (runtime.els.spellcheckEnabled)
      runtime.els.spellcheckEnabled.checked = runtime.state.spellcheckEnabled !== false;
    runtime.syncSpellcheckElements(document);
  }

  function syncFilesAndTabIconSettings() {
    const show = runtime.state.showFilesAndTabIcons !== false;
    if (runtime.els.showFilesAndTabIcons) runtime.els.showFilesAndTabIcons.checked = show;
    document.body.classList.toggle('hide-files-tab-icons', !show);
  }

  Object.assign(runtime, {
    normalizeShortcutValue,
    normalizeWorkspaceShortcuts,
    shortcutFromEvent,
    formatShortcut,
    cycleTheme,
    openSettings,
    setSettingsView,
    renderShortcutSettings,
    resetShortcuts,
    resetAppSettings,
    shortcutActionForEvent,
    runShortcutAction,
    updateSettingsText,
    normalizePageFont,
    applyPageFont,
    syncPageFontSettings,
    syncTreeIconSizeSettings,
    syncBreadcrumbIconSettings,
    syncCustomPageIconSettings,
    syncSpellcheckSettings,
    syncFilesAndTabIconSettings,
  });
}

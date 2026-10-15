// @ts-nocheck
// Existing editor algorithms, isolated behind the typed controller boundary.
import type { EditorRuntime } from '@/features/editor/types';
import type { EditorTab } from '@/features/workspace/types';
import { useWorkspaceStore } from '@/store/workspace.store';
import { hydrateInlineMath } from '@/features/math/render';

export function registerNavigation(runtime: EditorRuntime) {
  let editorScrollSaveTimer = null;
  const plainTextTabs = new Set<string>();
  const closedTabs = new Map<string, { tab: EditorTab; index: number }[]>();

  function plainTextKey(page, tabId = runtime.state.activeTabId) {
    return JSON.stringify([runtime.activeVaultId, tabId, page.id]);
  }

  function syncPlainTextView(root, page, tabId = runtime.state.activeTabId) {
    if (!root || !page) return;
    const enabled = plainTextTabs.has(plainTextKey(page, tabId));
    root.dataset.plainText = String(enabled);
    let preview = root.querySelector('[data-plain-text-content]');
    if (enabled) {
      if (!preview) {
        root.insertAdjacentHTML(
          'beforeend',
          runtime.htmlWithStyles(
            '<pre class="plain-text-content" data-plain-text-content tabindex="0" aria-label="Markdown source"></pre>',
          ),
        );
        preview = root.querySelector('[data-plain-text-content]');
      }
      const memo = new Map();
      const paths = {
        get: (id) => {
          const target = runtime.pageById(id);
          return target ? runtime.filePathForWorkspacePage(target, runtime.state, memo) : undefined;
        },
      };
      preview.textContent = runtime.markdownForPage(runtime.clone(page), runtime.state, paths);
    }
    if (preview) preview.hidden = !enabled;
  }

  function togglePagePlainText() {
    const page = runtime.currentPage();
    if (!page) return;
    runtime.cancelPageOperations();
    const key = plainTextKey(page);
    if (plainTextTabs.has(key)) plainTextTabs.delete(key);
    else plainTextTabs.add(key);
    const root = runtime.els.blockEditor.closest('.page');
    syncPlainTextView(root, page);
    runtime.renderBreadcrumbs(page);
  }

  function groupTabs(groupId) {
    return runtime.state.openTabs.filter((tab) => tab.groupId === groupId);
  }

  function selectedGroupTab(group) {
    const tabs = runtime.groupTabs(group.id);
    return tabs.find((tab) => tab.id === group.activeTabId) || tabs[0] || null;
  }

  function bindEditorElements(root) {
    const mapping = {
      pageTitle: '[data-dock-title]',
      pageIcon: '[data-dock-icon]',
      pageComments: '[data-dock-comments]',
      blockEditor: '[data-dock-blocks]',
      emptyHint: '[data-dock-empty]',
    };
    for (const [key, selector] of Object.entries(mapping))
      runtime.els[key] = root?.querySelector(selector) || runtime.baseEditorElements[key];
  }

  function focusEditorGroup(groupId) {
    const group = runtime.editorGroup(runtime.state.editorLayout, groupId);
    if (!group) return;
    const tab = runtime.selectedGroupTab(group);
    if (!tab) return;
    if (tab.kind === 'graph' || tab.kind === 'attachments') return;
    if (runtime.state.activeEditorGroupId === groupId && runtime.state.activeTabId === tab.id)
      return;
    runtime.cancelPageOperations();
    runtime.state.activeEditorGroupId = groupId;
    runtime.state.activeTabId = tab.id;
    if (tab.kind === 'page') {
      runtime.state.currentPageId = tab.pageId;
      runtime.state.mainView = 'page';
    }
    runtime.bindEditorElements(
      [...runtime.els.editorDock.querySelectorAll('[data-dock-page]')].find(
        (root) => root.dataset.editorGroup === groupId,
      ),
    );
    runtime.els.editorDock
      .querySelectorAll('.dock-pane')
      .forEach((pane) => pane.classList.toggle('active', pane.dataset.editorGroup === groupId));
    runtime.renderTabs();
    runtime.renderSidebar();
    if (tab.kind === 'page') {
      const page = runtime.pageById(tab.pageId);
      runtime.trackNavigationLocation();
      runtime.renderBreadcrumbs(page);
    }
    runtime.syncNavigationButtons();
    runtime.renderRightSidebar();
  }

  function dockTabMarkup(tab, active) {
    const page = tab.kind === 'page' ? runtime.pageById(tab.pageId) : null;
    const title =
      page?.title ||
      (tab.kind === 'graph'
        ? 'Graph view'
        : tab.kind === 'attachments'
          ? 'Attachments'
          : 'Untitled');
    const tabIcon = page
      ? runtime.pageIconMarkup(runtime.pageIconFor(page))
      : runtime.iconMarkup(tab.kind === 'attachments' ? 'paperclip' : 'network');
    return runtime.htmlWithStyles(
      `<div class="dock-tab ${active ? 'active' : ''}" role="tab" aria-selected="${active}" data-tab-id="${tab.id}" draggable="true"><span class="tab-icon">${tabIcon}</span><span class="tab-title">${runtime.escapeHtml(title)}</span><button type="button" class="tab-close" data-tab-close="${tab.id}" title="Close ${runtime.escapeHtml(title)}">${runtime.iconMarkup('x', '14px')}</button></div>`,
    );
  }

  function dockGroupMarkup(group) {
    const tabs = runtime.groupTabs(group.id),
      selected = runtime.selectedGroupTab(group),
      page = selected?.kind === 'page' ? runtime.pageById(selected.pageId) : null;
    const content = page
      ? runtime.htmlWithStyles(
          `<div class="dock-scroll"><article class="page dock-page" data-dock-page data-editor-group="${group.id}" data-page-id="${page.id}" data-tab-id="${selected.id}"><div class="note-inline-header"><button class="page-icon ${runtime.state.showCustomPageIcons === false ? 'hidden' : ''}" data-dock-icon title="Change icon">${runtime.state.showCustomPageIcons === false ? '' : runtime.pageIconMarkup(runtime.pageIconFor(page), '')}</button><h1 class="page-title" contenteditable="true" spellcheck="true" data-dock-title data-placeholder="Untitled">${runtime.escapeHtml(page.title || '')}</h1></div><div class="page-comments hidden" data-dock-comments></div><div class="block-editor" data-dock-blocks></div><div class="empty-hint" data-dock-empty>Type <b>/</b> for commands</div></article></div>`,
        )
      : selected?.kind === 'attachments'
        ? runtime.htmlWithStyles(
            '<div class="dock-empty">Select the Attachments tab to open the gallery.</div>',
          )
        : runtime.htmlWithStyles(
            '<div class="dock-empty">Drag a page tab here or press Ctrl/Cmd+Alt+N to create one.</div>',
          );
    return runtime.htmlWithStyles(
      `<section class="dock-pane ${runtime.state.activeEditorGroupId === group.id ? 'active' : ''}" data-editor-group="${group.id}"><div class="dock-tabs"><div class="dock-tabs-scroll" role="tablist" aria-label="Open pages in pane">${tabs.map((tab) => runtime.dockTabMarkup(tab, tab.id === selected?.id)).join('')}</div><div class="dock-tab-spacer"></div></div><nav class="dock-breadcrumbs breadcrumbs" aria-label="Page path">${page ? runtime.breadcrumbBarMarkup(page, group.id) : ''}</nav>${content}</section>`,
    );
  }

  function dockNodeMarkup(node) {
    if (node.type === 'group') return runtime.dockGroupMarkup(node);
    return runtime.htmlWithStyles(
      `<div class="dock-split ${node.direction}" data-dock-split style="--first-size:${Math.round(node.ratio * 100)}%"><div class="dock-branch">${runtime.dockNodeMarkup(node.first)}</div><div class="dock-divider" data-dock-divider role="separator" aria-orientation="${node.direction === 'row' ? 'vertical' : 'horizontal'}" title="Drag to resize"></div><div class="dock-branch">${runtime.dockNodeMarkup(node.second)}</div></div>`,
    );
  }

  function renderDockLayout() {
    runtime.els.homeView.classList.add('hidden');
    runtime.els.graphView?.classList.add('hidden');
    runtime.els.editorView.classList.add('hidden');
    runtime.els.editorDock.classList.remove('hidden');
    runtime.els.editorDock.innerHTML = runtime.dockNodeMarkup(runtime.state.editorLayout);
    runtime.els.editorDock.querySelectorAll('[data-dock-page]').forEach((root) => {
      const page = runtime.pageById(root.dataset.pageId),
        blocks = root.querySelector('[data-dock-blocks]');
      if (page && blocks) {
        if (!page.blocks.length) page.blocks.push(runtime.newTextBlock());
        blocks.innerHTML = page.blocks
          .map((block, index) => runtime.blockHTML(block, index, page.blocks))
          .join('');
        runtime.hydrateAttachmentImages(blocks);
        hydrateInlineMath(blocks);
        root.querySelector('[data-dock-empty]').style.display = 'none';
        runtime.syncPlainTextView(root, page, root.dataset.tabId);
      }
    });
    const active = [...runtime.els.editorDock.querySelectorAll('[data-dock-page]')].find(
      (root) => root.dataset.editorGroup === runtime.state.activeEditorGroupId,
    );
    runtime.bindEditorElements(active);
    if (active) runtime.scheduleMermaidPreviews(active.querySelector('[data-dock-blocks]'));
    const page = runtime.currentPage();
    if (page) runtime.renderBreadcrumbs(page);
    runtime.els.editorDock.querySelectorAll('.dock-scroll').forEach((scroller) => {
      const tabId = scroller.querySelector('[data-dock-page]')?.dataset.tabId;
      if (tabId) runtime.restoreEditorScrollPosition(tabId, scroller);
    });
    runtime.lifecycle.frame(runtime.syncAllSimpleTableHandles);
  }

  function restoreEditorScrollPosition(tabId, scroller) {
    if (!tabId || !scroller) return;
    const savedTop = Number(runtime.state.editorScrollPositions?.[tabId]?.top),
      top = Number.isFinite(savedTop) ? Math.max(0, savedTop) : 0;
    scroller.scrollTop = top;
    runtime.lifecycle.frame(() => {
      if (!scroller.isConnected) return;
      const visibleTabId = scroller.matches('#editorView')
        ? runtime.state.activeTabId
        : scroller.querySelector('[data-dock-page]')?.dataset.tabId;
      if (visibleTabId === tabId) scroller.scrollTop = top;
    });
  }

  function captureEditorScrollPosition(scroller) {
    if (!scroller?.matches?.('#editorView, .dock-scroll')) return;
    const tabId = scroller.matches('#editorView')
      ? runtime.state.activeTabId
      : scroller.querySelector('[data-dock-page]')?.dataset.tabId;
    if (!tabId) return;
    const top = Math.min(10_000_000, Math.max(0, Number(scroller.scrollTop) || 0));
    const positions =
      runtime.state.editorScrollPositions || (runtime.state.editorScrollPositions = {});
    const previousTop = Number(positions[tabId]?.top);
    if (Number.isFinite(previousTop) && Math.abs(previousTop - top) < 1) return;
    if (!Number.isFinite(previousTop) && top === 0) return;
    positions[tabId] = { top };
    runtime.lifecycle.clearTimeout(editorScrollSaveTimer);
    editorScrollSaveTimer = runtime.lifecycle.timeout(() => {
      editorScrollSaveTimer = null;
      void runtime.persistViewStateNow?.();
    }, 350);
  }

  function replaceGroupNode(node, id, replacement) {
    if (node.type === 'group') return node.id === id ? replacement : node;
    node.first = runtime.replaceGroupNode(node.first, id, replacement);
    node.second = runtime.replaceGroupNode(node.second, id, replacement);
    return node;
  }

  function removeGroupNode(node, id) {
    if (node.type === 'group') return node.id === id ? null : node;
    const first = runtime.removeGroupNode(node.first, id),
      second = runtime.removeGroupNode(node.second, id);
    if (!first) return second;
    if (!second) return first;
    node.first = first;
    node.second = second;
    return node;
  }

  function repairEditorGroups() {
    for (const group of runtime.editorGroups(runtime.state.editorLayout)) {
      const tabs = runtime.groupTabs(group.id);
      if (!tabs.some((tab) => tab.id === group.activeTabId))
        group.activeTabId = tabs[0]?.id || null;
    }
    for (const group of [...runtime.editorGroups(runtime.state.editorLayout)]) {
      if (
        runtime.editorGroups(runtime.state.editorLayout).length > 1 &&
        !runtime.groupTabs(group.id).length
      )
        runtime.state.editorLayout = runtime.removeGroupNode(runtime.state.editorLayout, group.id);
    }
    const active = runtime.state.openTabs.find((tab) => tab.id === runtime.state.activeTabId);
    if (!active) {
      const group = runtime.editorGroups(runtime.state.editorLayout)[0],
        next = runtime.selectedGroupTab(group);
      runtime.state.activeEditorGroupId = group.id;
      runtime.state.activeTabId = next?.id || null;
      if (next?.kind === 'page') runtime.state.currentPageId = next.pageId;
    } else runtime.state.activeEditorGroupId = active.groupId;
  }

  function splitTab(tabId, targetGroupId, edge) {
    let tab = runtime.state.openTabs.find((item) => item.id === tabId);
    const target = runtime.editorGroup(runtime.state.editorLayout, targetGroupId);
    if (!tab || !target || tab.kind !== 'page') return;
    const sourceId = tab.groupId;
    // A single tab can display the same page in two panes, as in Obsidian.
    if (sourceId === targetGroupId && runtime.groupTabs(sourceId).length === 1) {
      tab = { ...tab, id: runtime.uid('tab') };
      runtime.state.openTabs.push(tab);
      const savedPosition = runtime.state.editorScrollPositions?.[runtime.state.activeTabId];
      if (savedPosition) runtime.state.editorScrollPositions[tab.id] = runtime.clone(savedPosition);
    }
    const newGroup = { type: 'group', id: runtime.uid('editor_group'), activeTabId: tab.id };
    const oldGroup = { ...target };
    runtime.state.editorLayout = runtime.replaceGroupNode(
      runtime.state.editorLayout,
      targetGroupId,
      {
        type: 'split',
        direction: edge === 'left' || edge === 'right' ? 'row' : 'column',
        ratio: 0.5,
        first: edge === 'left' || edge === 'top' ? newGroup : oldGroup,
        second: edge === 'left' || edge === 'top' ? oldGroup : newGroup,
      },
    );
    tab.groupId = newGroup.id;
    runtime.state.activeEditorGroupId = newGroup.id;
    runtime.state.activeTabId = tab.id;
    runtime.state.currentPageId = tab.pageId;
    runtime.state.mainView = 'page';
    runtime.repairEditorGroups();
    runtime.scheduleSave();
    runtime.renderAll();
  }

  function moveTabToGroup(tabId, groupId, beforeTabId = null) {
    const tab = runtime.state.openTabs.find((item) => item.id === tabId),
      group = runtime.editorGroup(runtime.state.editorLayout, groupId);
    if (!tab || !group) return;
    if (tab.groupId === groupId && beforeTabId === tabId) return;
    runtime.state.openTabs = runtime.state.openTabs.filter((item) => item.id !== tabId);
    tab.groupId = groupId;
    const index = beforeTabId
      ? runtime.state.openTabs.findIndex((item) => item.id === beforeTabId)
      : -1;
    runtime.state.openTabs.splice(index < 0 ? runtime.state.openTabs.length : index, 0, tab);
    group.activeTabId = tab.id;
    runtime.state.activeEditorGroupId = groupId;
    runtime.state.activeTabId = tab.id;
    if (tab.kind === 'page') {
      runtime.state.currentPageId = tab.pageId;
      runtime.state.mainView = 'page';
    } else runtime.state.mainView = tab.kind === 'attachments' ? 'attachments' : 'graph';
    runtime.repairEditorGroups();
    runtime.scheduleSave();
    runtime.renderAll();
  }

  function splitActiveTab(edge) {
    if (runtime.state.activeTabId)
      runtime.splitTab(runtime.state.activeTabId, runtime.state.activeEditorGroupId, edge);
  }

  function resetEditorLayout() {
    runtime.state.editorLayout = {
      type: 'group',
      id: runtime.MAIN_EDITOR_GROUP,
      activeTabId: runtime.state.activeTabId,
    };
    runtime.state.openTabs.forEach((tab) => {
      tab.groupId = runtime.MAIN_EDITOR_GROUP;
    });
    runtime.state.activeEditorGroupId = runtime.MAIN_EDITOR_GROUP;
    runtime.scheduleSave();
    runtime.renderAll();
  }

  function renderAll() {
    // Normalize tabs and commit chrome before DOM adapters query the tree/selectors.
    runtime.renderTabs();
    runtime.deferPublication(() => {
      runtime.applyPageFont();
      runtime.syncCustomPageIconSettings();
      runtime.syncFilesAndTabIconSettings();
      runtime.syncBreadcrumbIconSettings();
      runtime.syncFolderNoteSettings();
      const docked =
        runtime.state.mainView === 'page' &&
        runtime.state.currentPageId !== '__home__' &&
        runtime.editorGroups(runtime.state.editorLayout).length > 1;
      runtime.els.editorTabs.parentElement.classList.toggle('docked', docked);
      runtime.renderWorkspaceSelector();
      runtime.renderVaultSelector();
      runtime.renderSidebar();
      runtime.trackNavigationLocation();
      if (runtime.state.mainView === 'attachments') runtime.renderAttachmentsView();
      else if (runtime.state.mainView === 'graph') runtime.renderGraphView();
      else if (runtime.state.currentPageId === '__home__') runtime.renderHome();
      else if (docked) runtime.renderDockLayout();
      else runtime.renderPage();
      runtime.renderRightSidebar();
      runtime.updateWorkspaceChrome();
      runtime.syncNavigationButtons();
      runtime.syncWorkspaceEditorAccess();
      runtime.syncSpellcheckSettings();
    });
  }

  function renderTabs() {
    if (!runtime.els.tabsScroll) return;
    const validIds = new Set(runtime.state.pages.map((p) => p.id));
    const validGroups = new Set(
      runtime.editorGroups(runtime.state.editorLayout).map((group) => group.id),
    );
    const fallbackGroup = validGroups.has(runtime.state.activeEditorGroupId)
      ? runtime.state.activeEditorGroupId
      : runtime.editorGroups(runtime.state.editorLayout)[0].id;
    if (!Array.isArray(runtime.state.openTabs)) runtime.state.openTabs = [];
    runtime.state.openTabs = runtime.state.openTabs
      .map((tab) => {
        if (typeof tab === 'string')
          return validIds.has(tab)
            ? { id: runtime.uid('tab'), kind: 'page', pageId: tab, groupId: fallbackGroup }
            : null;
        if (!tab || typeof tab !== 'object') return null;
        const groupId = validGroups.has(tab.groupId) ? tab.groupId : fallbackGroup;
        if (tab.kind === 'graph' || tab.view === 'graph')
          return { id: tab.id || runtime.uid('tab'), kind: 'graph', groupId };
        if (tab.kind === 'attachments')
          return { id: tab.id || runtime.uid('tab'), kind: 'attachments', groupId };
        return validIds.has(tab.pageId)
          ? { id: tab.id || runtime.uid('tab'), kind: 'page', pageId: tab.pageId, groupId }
          : null;
      })
      .filter(Boolean);

    if (runtime.state.mainView === 'attachments') {
      let active =
        runtime.state.openTabs.find(
          (t) => t.id === runtime.state.activeTabId && t.kind === 'attachments',
        ) || runtime.state.openTabs.find((t) => t.kind === 'attachments');
      if (!active) {
        active = { id: runtime.uid('tab'), kind: 'attachments', groupId: fallbackGroup };
        runtime.state.openTabs.push(active);
      }
      runtime.state.activeTabId = active.id;
      runtime.state.activeEditorGroupId = active.groupId;
      runtime.editorGroup(runtime.state.editorLayout, active.groupId).activeTabId = active.id;
    } else if (runtime.state.mainView === 'graph') {
      let active =
        runtime.state.openTabs.find(
          (t) => t.id === runtime.state.activeTabId && t.kind === 'graph',
        ) || runtime.state.openTabs.find((t) => t.kind === 'graph');
      if (!active) {
        active = { id: runtime.uid('tab'), kind: 'graph', groupId: fallbackGroup };
        runtime.state.openTabs.push(active);
      }
      runtime.state.activeTabId = active.id;
      runtime.state.activeEditorGroupId = active.groupId;
    } else if (runtime.state.currentPageId === '__home__') runtime.state.activeTabId = null;
    else if (validIds.has(runtime.state.currentPageId)) {
      let active = runtime.state.openTabs.find(
        (t) =>
          t.id === runtime.state.activeTabId &&
          t.kind !== 'graph' &&
          t.pageId === runtime.state.currentPageId,
      );
      if (!active)
        active = runtime.state.openTabs.find(
          (t) => t.kind !== 'graph' && t.pageId === runtime.state.currentPageId,
        );
      if (!active) {
        active = {
          id: runtime.uid('tab'),
          kind: 'page',
          pageId: runtime.state.currentPageId,
          groupId: fallbackGroup,
        };
        runtime.state.openTabs.push(active);
      }
      runtime.state.activeTabId = active.id;
      runtime.state.activeEditorGroupId = active.groupId;
      runtime.editorGroup(runtime.state.editorLayout, active.groupId).activeTabId = active.id;
    }

    runtime.publish();
    runtime.lifecycle.frame(() =>
      runtime.els.tabsScroll
        .querySelector('.editor-tab.active')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
    );
  }

  function createTab(pageId, activate = true, groupId = runtime.state.activeEditorGroupId) {
    if (!runtime.pageById(pageId)) return null;
    if (!Array.isArray(runtime.state.openTabs)) runtime.state.openTabs = [];
    const tab = { id: runtime.uid('tab'), kind: 'page', pageId, groupId };
    runtime.state.openTabs.push(tab);
    if (activate) {
      runtime.resetFilesTreeSelection(runtime.fileTreeKeyForPage(runtime.pageById(pageId)));
      runtime.cancelPageOperations();
      runtime.state.activeEditorGroupId = groupId;
      runtime.editorGroup(runtime.state.editorLayout, groupId).activeTabId = tab.id;
      runtime.state.activeTabId = tab.id;
      runtime.state.currentPageId = pageId;
      runtime.state.mainView = 'page';
    }
    return tab;
  }

  function replaceActiveTab(pageId) {
    if (!runtime.pageById(pageId)) return null;
    runtime.resetFilesTreeSelection(runtime.fileTreeKeyForPage(runtime.pageById(pageId)));
    if (!Array.isArray(runtime.state.openTabs)) runtime.state.openTabs = [];
    const tab = runtime.state.openTabs.find((t) => t.id === runtime.state.activeTabId);
    if (!tab || tab.kind === 'graph' || tab.kind === 'attachments')
      return runtime.createTab(pageId, true);
    if (tab.pageId !== pageId || runtime.state.currentPageId !== pageId) {
      runtime.cancelPageOperations();
      if (tab.pageId !== pageId && runtime.state.editorScrollPositions)
        delete runtime.state.editorScrollPositions[tab.id];
    }
    tab.kind = 'page';
    tab.pageId = pageId;
    runtime.state.activeEditorGroupId = tab.groupId;
    runtime.editorGroup(runtime.state.editorLayout, tab.groupId).activeTabId = tab.id;
    runtime.state.currentPageId = pageId;
    runtime.state.mainView = 'page';
    return tab;
  }

  function activateTab(tabId) {
    useWorkspaceStore.getState().setGitDiff(null);
    const tab = (runtime.state.openTabs || []).find((t) => t.id === tabId);
    if (!tab) return;
    runtime.resetFilesTreeSelection(
      runtime.fileTreeKeyForPage(tab.kind === 'page' ? runtime.pageById(tab.pageId) : null),
    );
    runtime.state.activeEditorGroupId = tab.groupId;
    runtime.editorGroup(runtime.state.editorLayout, tab.groupId).activeTabId = tab.id;
    if (tab.kind === 'graph') {
      if (runtime.state.activeTabId !== tab.id || runtime.state.mainView !== 'graph')
        runtime.cancelPageOperations();
      runtime.state.activeTabId = tab.id;
      runtime.state.mainView = 'graph';
      runtime.scheduleSave('view');
      runtime.renderAll();
      return;
    }
    if (tab.kind === 'attachments') {
      if (runtime.state.activeTabId !== tab.id || runtime.state.mainView !== 'attachments')
        runtime.cancelPageOperations();
      runtime.state.activeTabId = tab.id;
      runtime.state.mainView = 'attachments';
      runtime.scheduleSave('view');
      runtime.renderAll();
      return;
    }
    if (!runtime.pageById(tab.pageId)) return;
    if (
      runtime.state.activeTabId !== tab.id ||
      runtime.state.currentPageId !== tab.pageId ||
      runtime.state.mainView !== 'page'
    )
      runtime.cancelPageOperations();
    runtime.state.mainView = 'page';
    runtime.state.activeTabId = tab.id;
    runtime.state.currentPageId = tab.pageId;
    runtime.scheduleSave('view');
    runtime.renderAll();
  }

  function closeTab(tabId) {
    if (!Array.isArray(runtime.state.openTabs)) runtime.state.openTabs = [];
    const index = runtime.state.openTabs.findIndex((t) => t.id === tabId);
    if (index < 0) return;
    const wasActive = runtime.state.activeTabId === tabId;
    const groupId = runtime.state.openTabs[index].groupId;
    const history = closedTabs.get(runtime.activeVaultId) || [];
    history.push({ tab: { ...runtime.state.openTabs[index] }, index });
    if (history.length > 50) history.shift();
    closedTabs.set(runtime.activeVaultId, history);
    if (wasActive) runtime.cancelPageOperations();
    runtime.state.openTabs.splice(index, 1);
    if (wasActive) {
      const next =
        runtime.groupTabs(groupId)[0] ||
        runtime.state.openTabs[Math.min(index, runtime.state.openTabs.length - 1)] ||
        null;
      if (next?.kind === 'graph') {
        runtime.state.activeEditorGroupId = next.groupId;
        runtime.state.activeTabId = next.id;
        runtime.state.mainView = 'graph';
      } else if (next?.kind === 'attachments') {
        runtime.state.activeEditorGroupId = next.groupId;
        runtime.state.activeTabId = next.id;
        runtime.state.mainView = 'attachments';
      } else if (next?.pageId && runtime.pageById(next.pageId)) {
        runtime.state.activeEditorGroupId = next.groupId;
        runtime.state.activeTabId = next.id;
        runtime.state.currentPageId = next.pageId;
        runtime.state.mainView = 'page';
      } else {
        runtime.state.activeTabId = null;
        runtime.state.currentPageId = '__home__';
        runtime.state.mainView = 'page';
      }
    }
    runtime.repairEditorGroups();
    runtime.scheduleSave('view');
    runtime.renderAll();
  }

  function reopenClosedTab(): boolean {
    const history = closedTabs.get(runtime.activeVaultId);
    while (history?.length) {
      const { tab, index } = history.pop()!;
      if (runtime.state.openTabs.some((item) => item.id === tab.id)) continue;
      if (tab.kind === 'page' && !runtime.pageById(tab.pageId)) continue;
      if (!runtime.editorGroup(runtime.state.editorLayout, tab.groupId))
        tab.groupId = runtime.state.activeEditorGroupId;
      runtime.state.openTabs.splice(Math.min(index, runtime.state.openTabs.length), 0, tab);
      runtime.activateTab(tab.id);
      return true;
    }
    return false;
  }

  function cycleTab(direction = 1) {
    const tabs = runtime.state.openTabs || [];
    if (!tabs.length) return;
    const current = tabs.findIndex((t) => t.id === runtime.state.activeTabId);
    const next = current < 0 ? 0 : (current + direction + tabs.length) % tabs.length;
    runtime.activateTab(tabs[next].id);
  }

  function openGraphTab() {
    useWorkspaceStore.getState().setGitDiff(null);
    if (!Array.isArray(runtime.state.openTabs)) runtime.state.openTabs = [];
    let tab = runtime.state.openTabs.find((t) => t.kind === 'graph');
    if (!tab) {
      tab = { id: runtime.uid('tab'), kind: 'graph', groupId: runtime.state.activeEditorGroupId };
      runtime.state.openTabs.push(tab);
    }
    if (runtime.state.activeTabId !== tab.id || runtime.state.mainView !== 'graph')
      runtime.cancelPageOperations();
    runtime.state.activeEditorGroupId = tab.groupId;
    runtime.editorGroup(runtime.state.editorLayout, tab.groupId).activeTabId = tab.id;
    runtime.state.activeTabId = tab.id;
    runtime.state.mainView = 'graph';
    runtime.scheduleSave();
    runtime.renderAll();
    return tab;
  }

  function openAttachmentsTab() {
    useWorkspaceStore.getState().setGitDiff(null);
    if (!Array.isArray(runtime.state.openTabs)) runtime.state.openTabs = [];
    let tab = runtime.state.openTabs.find((item) => item.kind === 'attachments');
    if (!tab) {
      tab = {
        id: runtime.uid('tab'),
        kind: 'attachments',
        groupId: runtime.state.activeEditorGroupId,
      };
      runtime.state.openTabs.push(tab);
    }
    if (runtime.state.activeTabId !== tab.id || runtime.state.mainView !== 'attachments')
      runtime.cancelPageOperations();
    runtime.state.activeEditorGroupId = tab.groupId;
    runtime.editorGroup(runtime.state.editorLayout, tab.groupId).activeTabId = tab.id;
    runtime.state.activeTabId = tab.id;
    runtime.state.mainView = 'attachments';
    runtime.scheduleSave();
    runtime.renderAll();
    return tab;
  }

  function updateSidebarState() {
    runtime.updateWorkspaceChrome();
  }

  function updateWorkspaceChrome() {
    document.documentElement.style.setProperty(
      '--sidebar-width',
      `${Math.max(210, Math.min(420, runtime.state.sidebarWidth || 276))}px`,
    );
    document.documentElement.style.setProperty(
      '--right-sidebar-width',
      `${Math.max(220, Math.min(420, runtime.state.rightSidebarWidth || 286))}px`,
    );
    runtime.applyTreeIconSizes();
    runtime.els.sidebar?.classList.toggle('collapsed', !runtime.state.sidebarOpen);
    runtime.els.sidebarOpen?.classList.toggle('hidden', runtime.state.sidebarOpen);
    runtime.els.rightSidebar?.classList.toggle('collapsed', !runtime.state.rightSidebarOpen);
    runtime.els.editorTabs?.parentElement.classList.toggle(
      'right-sidebar-collapsed',
      !runtime.state.rightSidebarOpen,
    );
    document
      .querySelector('.left-resizer')
      ?.classList.toggle('hidden-resizer', !runtime.state.sidebarOpen);
    document
      .querySelector('.right-resizer')
      ?.classList.toggle('hidden-resizer', !runtime.state.rightSidebarOpen);
    if (runtime.els.rightSidebarToggle) {
      runtime.publish();
      runtime.els.rightSidebarToggle.setAttribute(
        'aria-expanded',
        String(runtime.state.rightSidebarOpen),
      );
    }
    if (runtime.els.revealCurrentFileBtn)
      runtime.els.revealCurrentFileBtn.disabled = !runtime.activeTabPageForFiles();
    document
      .querySelectorAll(
        '[data-ribbon-action="files"],[data-ribbon-action="favorites"],[data-ribbon-action="git"]',
      )
      .forEach((btn) => {
        btn.classList.toggle(
          'active',
          runtime.state.sidebarOpen && btn.dataset.ribbonAction === runtime.state.leftPanelMode,
        );
        btn.setAttribute('aria-pressed', btn.classList.contains('active') ? 'true' : 'false');
      });
    const attachmentsButton = document.querySelector('[data-ribbon-action="attachments"]');
    if (attachmentsButton) {
      attachmentsButton.classList.toggle('active', runtime.state.mainView === 'attachments');
      attachmentsButton.setAttribute(
        'aria-pressed',
        runtime.state.mainView === 'attachments' ? 'true' : 'false',
      );
    }
    const graphButton = document.querySelector('[data-ribbon-action="graph"]');
    if (graphButton) {
      graphButton.classList.toggle('active', runtime.state.mainView === 'graph');
      graphButton.setAttribute(
        'aria-pressed',
        runtime.state.mainView === 'graph' ? 'true' : 'false',
      );
    }
    runtime.lifecycle.frame(runtime.updateSidebarOverflow);

    runtime.publish();
  }

  function breadcrumbMarkup(page) {
    const chain = [],
      seen = new Set();
    let cur = page;
    while (cur && !seen.has(cur.id)) {
      chain.unshift(cur);
      seen.add(cur.id);
      cur = cur.parentId ? runtime.pageById(cur.parentId) : null;
    }
    const root = chain[0],
      folderPath = root?.folderId ? runtime.folderPathForId(root.folderId) : '';
    const entries = [];
    let currentPath = '';
    for (const segment of runtime.normalizeFolderPath(folderPath).split('/').filter(Boolean)) {
      currentPath = [currentPath, segment].filter(Boolean).join('/');
      const folder = runtime.folderByPath(currentPath);
      entries.push({ kind: 'folder', path: currentPath, title: folder?.name || segment });
    }
    entries.push(
      ...chain.map((item) => ({ kind: 'page', page: item, title: item.title || 'Untitled' })),
    );
    return entries
      .map((entry, index) => {
        const isPage = entry.kind === 'page';
        const attributes = isPage
          ? `data-crumb-id="${entry.page.id}"`
          : `data-crumb-folder-path="${runtime.escapeHtml(entry.path)}"`;
        const icon =
          isPage && runtime.state.showBreadcrumbIcons
            ? runtime.htmlWithStyles(
                `<span class="crumb-icon">${runtime.pageIconMarkup(runtime.pageIconFor(entry.page))}</span>`,
              )
            : '';
        return runtime.htmlWithStyles(
          `<span class="crumb" ${attributes}>${icon}<span class="crumb-label">${runtime.escapeHtml(entry.title)}</span></span>${index < entries.length - 1 ? '<span class="crumb-sep">/</span>' : ''}`,
        );
      })
      .join('');
  }

  function navigationHistoryForVault(
    vaultId = runtime.activeVaultId,
    groupId = runtime.state.activeEditorGroupId,
  ) {
    if (!vaultId) return null;
    const key = `${runtime.historyKeyForVault(vaultId)}:${groupId || runtime.MAIN_EDITOR_GROUP}`;
    let history = runtime.navigationHistoryByVault.get(key);
    if (!history) {
      history = { entries: [], index: -1 };
      runtime.navigationHistoryByVault.set(key, history);
    }
    return history;
  }

  function currentNavigationLocation() {
    if (runtime.state.mainView === 'attachments') return { kind: 'attachments' };
    if (runtime.state.mainView === 'graph') return { kind: 'graph' };
    if (
      runtime.state.currentPageId === '__home__' ||
      !runtime.pageById(runtime.state.currentPageId)
    )
      return { kind: 'home' };
    return { kind: 'page', pageId: runtime.state.currentPageId };
  }

  function sameNavigationLocation(left, right) {
    return left?.kind === right?.kind && (left?.kind !== 'page' || left.pageId === right.pageId);
  }

  function navigationLocationIsAvailable(location) {
    return (
      location?.kind === 'home' ||
      location?.kind === 'graph' ||
      location?.kind === 'attachments' ||
      (location?.kind === 'page' && Boolean(runtime.pageById(location.pageId)))
    );
  }

  function navigationHistoryTargetIndex(history, direction) {
    if (!history) return -1;
    for (
      let index = history.index + direction;
      index >= 0 && index < history.entries.length;
      index += direction
    ) {
      if (runtime.navigationLocationIsAvailable(history.entries[index])) return index;
    }
    return -1;
  }

  function syncNavigationButtons(root = document) {
    root.querySelectorAll?.('[data-navigation-history]').forEach((button) => {
      const history = runtime.navigationHistoryForVault(
        runtime.activeVaultId,
        button.dataset.navigationHistoryGroup || runtime.state.activeEditorGroupId,
      );
      button.disabled =
        runtime.navigationHistoryTargetIndex(history, Number(button.dataset.navigationHistory)) < 0;
    });
  }

  function trackNavigationLocation(groupId = runtime.state.activeEditorGroupId) {
    const history = runtime.navigationHistoryForVault(runtime.activeVaultId, groupId);
    if (!history) return;
    const location = runtime.currentNavigationLocation(),
      current = history.entries[history.index];
    if (runtime.sameNavigationLocation(current, location)) {
      runtime.syncNavigationButtons();
      return;
    }
    history.entries = history.entries.slice(0, history.index + 1);
    history.entries.push(location);
    if (history.entries.length > runtime.NAVIGATION_HISTORY_LIMIT)
      history.entries.splice(0, history.entries.length - runtime.NAVIGATION_HISTORY_LIMIT);
    history.index = history.entries.length - 1;
    runtime.syncNavigationButtons();
  }

  function navigationHistoryButtonsMarkup(groupId = runtime.state.activeEditorGroupId) {
    const history = runtime.navigationHistoryForVault(runtime.activeVaultId, groupId);
    const backDisabled = runtime.navigationHistoryTargetIndex(history, -1) < 0 ? ' disabled' : '';
    const forwardDisabled = runtime.navigationHistoryTargetIndex(history, 1) < 0 ? ' disabled' : '';
    const groupAttribute = `data-navigation-history-group="${runtime.escapeHtml(groupId || runtime.MAIN_EDITOR_GROUP)}"`;
    return runtime.htmlWithStyles(
      `<span class="breadcrumb-history-controls" aria-label="Navigation history"><button type="button" class="breadcrumb-history-btn" data-navigation-history="-1" ${groupAttribute} title="Back" aria-label="Back"${backDisabled}>${runtime.iconMarkup('arrow-left', '15px')}</button><button type="button" class="breadcrumb-history-btn" data-navigation-history="1" ${groupAttribute} title="Forward" aria-label="Forward"${forwardDisabled}>${runtime.iconMarkup('arrow-right', '15px')}</button></span>`,
    );
  }

  function navigateHistory(direction, groupId = runtime.state.activeEditorGroupId) {
    const history = runtime.navigationHistoryForVault(runtime.activeVaultId, groupId),
      index = runtime.navigationHistoryTargetIndex(history, direction);
    if (!history || index < 0) return;
    history.index = index;
    const location = history.entries[index];
    if (location.kind === 'page') runtime.openPage(location.pageId);
    else if (location.kind === 'graph') runtime.openGraphTab();
    else if (location.kind === 'attachments') runtime.openAttachmentsTab();
    else {
      runtime.cancelPageOperations();
      runtime.state.mainView = 'page';
      runtime.state.currentPageId = '__home__';
      runtime.state.activeTabId = null;
      runtime.scheduleSave();
      runtime.renderAll();
    }
    runtime.syncNavigationButtons();
  }

  function openFolderBreadcrumb(path) {
    const normalized = runtime.normalizeFolderPath(path);
    if (!normalized) return;
    if (!runtime.folderByPath(normalized)) runtime.ensureFolderEntries(normalized);
    void runtime.selectMarkdownFolder(normalized);
  }

  function breadcrumbBarMarkup(page, groupId = runtime.state.activeEditorGroupId) {
    if (!page) return '';
    return `${runtime.navigationHistoryButtonsMarkup(groupId)}${runtime.breadcrumbMarkup(page)}${runtime.pageMenuButtonMarkup(page, groupId)}`;
  }

  function pageMenuButtonMarkup(page, groupId = runtime.state.activeEditorGroupId) {
    const group = runtime.editorGroup(runtime.state.editorLayout, groupId);
    const tabId = group ? runtime.selectedGroupTab(group)?.id : runtime.state.activeTabId;
    const enabled = plainTextTabs.has(plainTextKey(page, tabId));
    return runtime.htmlWithStyles(
      `<button type="button" class="breadcrumb-plain-text-button" data-page-plain-text-toggle title="${enabled ? 'Show editor' : 'Show plain text'}" aria-label="Plain text" aria-pressed="${enabled}">${runtime.iconMarkup('code', '15px')}</button><button type="button" class="breadcrumb-page-menu-button" data-page-menu-trigger="${page.id}" title="Page options" aria-label="Page options" aria-haspopup="menu" aria-expanded="false">${runtime.iconMarkup('ellipsis-vertical', '15px', 'more-dots-icon vertical')}</button>`,
    );
  }

  function updateBreadcrumbBar(container, page) {
    const button = container.querySelector('[data-page-plain-text-toggle]');
    const menu = container.querySelector('[data-page-menu-trigger]');
    container.querySelectorAll('.crumb,.crumb-sep').forEach((item) => item.remove());
    if (!page) {
      button?.remove();
      menu?.remove();
      return;
    }
    if (button) {
      const groupId =
        container.closest('.dock-pane')?.dataset.editorGroup || runtime.state.activeEditorGroupId;
      const group = runtime.editorGroup(runtime.state.editorLayout, groupId);
      const enabled = plainTextTabs.has(plainTextKey(page, runtime.selectedGroupTab(group)?.id));
      button.setAttribute('aria-pressed', String(enabled));
      button.title = enabled ? 'Show editor' : 'Show plain text';
      if (menu) menu.dataset.pageMenuTrigger = page.id;
      button.insertAdjacentHTML('beforebegin', runtime.breadcrumbMarkup(page));
    } else container.innerHTML = runtime.breadcrumbBarMarkup(page);
  }

  function renderBreadcrumbs(page) {
    runtime.updateBreadcrumbBar(runtime.els.breadcrumbs, page);
    if (!runtime.els.editorDock?.classList.contains('hidden'))
      runtime.els.editorDock.querySelectorAll('.dock-pane').forEach((pane) => {
        const group = runtime.editorGroup(runtime.state.editorLayout, pane.dataset.editorGroup),
          tab = group && runtime.selectedGroupTab(group);
        if (tab?.pageId === page.id)
          runtime.updateBreadcrumbBar(pane.querySelector('.dock-breadcrumbs'), page);
      });
  }

  Object.assign(runtime, {
    syncPlainTextView,
    togglePagePlainText,
    groupTabs,
    selectedGroupTab,
    bindEditorElements,
    focusEditorGroup,
    dockTabMarkup,
    dockGroupMarkup,
    dockNodeMarkup,
    renderDockLayout,
    replaceGroupNode,
    removeGroupNode,
    repairEditorGroups,
    splitTab,
    moveTabToGroup,
    splitActiveTab,
    resetEditorLayout,
    renderAll,
    renderTabs,
    restoreEditorScrollPosition,
    captureEditorScrollPosition,
    createTab,
    replaceActiveTab,
    activateTab,
    closeTab,
    reopenClosedTab,
    cycleTab,
    openGraphTab,
    openAttachmentsTab,
    updateSidebarState,
    updateWorkspaceChrome,
    breadcrumbMarkup,
    navigationHistoryForVault,
    currentNavigationLocation,
    sameNavigationLocation,
    navigationLocationIsAvailable,
    navigationHistoryTargetIndex,
    syncNavigationButtons,
    trackNavigationLocation,
    navigationHistoryButtonsMarkup,
    navigateHistory,
    openFolderBreadcrumb,
    breadcrumbBarMarkup,
    pageMenuButtonMarkup,
    updateBreadcrumbBar,
    renderBreadcrumbs,
  });
}

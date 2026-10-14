// @ts-nocheck
import { APP_NAME } from './../../../app-identity';
// Existing editor algorithms, isolated behind the typed controller boundary.
import type { EditorRuntime } from '@/features/editor/types';
import { createEditorVerticalNavigation } from '@/features/editor/services/vertical-navigation';
import { useWorkspaceStore } from '@/store/workspace.store';

export function registerInteractions(runtime: EditorRuntime) {
  const verticalNavigation = createEditorVerticalNavigation();
  function bindEvents() {
    if (runtime.eventsBound) return;
    runtime.eventsBound = true;
    runtime.lifecycle.listen(runtime.els.workspaceReconnectBtn, 'click', () => {
      void runtime.requestWorkspaceWriteAccess();
    });
    runtime.lifecycle.listen(runtime.els.workspaceWritePermissionBtn, 'click', () => {
      void runtime.requestWorkspaceWriteAccess();
    });
    runtime.lifecycle.listen(document, 'click', runtime.onClick);
    runtime.lifecycle.listen(document, 'dblclick', runtime.onImageBlockDoubleClick);
    runtime.lifecycle.listen(document, 'wheel', runtime.onImageBlockViewerWheel, {
      passive: false,
    });
    runtime.lifecycle.listen(document, 'pointerover', runtime.onLinkPointerOver);
    runtime.lifecycle.listen(document, 'pointerout', runtime.onLinkPointerOut);
    runtime.lifecycle.listen(window, 'scroll', runtime.hideLinkHoverMenu, true);
    runtime.lifecycle.listen(window, 'resize', runtime.hideLinkHoverMenu);
    runtime.lifecycle.listen(document, 'pointerdown', runtime.onTreeContextMenuOutside, true);
    runtime.lifecycle.listen(document, 'contextmenu', runtime.onTreeContextMenu);
    runtime.lifecycle.listen(document, 'auxclick', runtime.onAuxClick);
    runtime.lifecycle.listen(document, 'mousedown', runtime.onMouseDown);
    runtime.lifecycle.listen(document, 'pointerdown', runtime.onLinkEditOutsidePointerDown, true);
    runtime.lifecycle.listen(document, 'pointerdown', runtime.onInlineSelectionPointerDown, true);
    runtime.lifecycle.listen(document, 'pointerdown', runtime.startImageBlockViewerPan);
    runtime.lifecycle.listen(window, 'pointermove', runtime.moveImageBlockViewerPan);
    runtime.lifecycle.listen(window, 'pointerup', runtime.endImageBlockViewerPan);
    runtime.lifecycle.listen(window, 'pointercancel', runtime.endImageBlockViewerPan);
    runtime.lifecycle.listen(document, 'pointerup', runtime.onInlineSelectionPointerEnd, true);
    runtime.lifecycle.listen(document, 'pointercancel', runtime.onInlineSelectionPointerEnd, true);
    runtime.lifecycle.listen(document, 'keydown', runtime.onInlineSelectionKeyDown, true);
    runtime.lifecycle.listen(document, 'keyup', runtime.onInlineSelectionKeyUp, true);
    runtime.lifecycle.listen(document, 'pointerdown', runtime.onPaneResizeStart);
    runtime.lifecycle.listen(document, 'pointermove', runtime.onSimpleTableHandlePointerMove, true);
    runtime.lifecycle.listen(document, 'input', runtime.onInput);
    runtime.lifecycle.listen(document, 'input', verticalNavigation.reset);
    runtime.lifecycle.listen(document, 'pointerdown', verticalNavigation.reset, true);
    runtime.lifecycle.listen(document, 'compositionend', (event) => {
      const content = event.target.closest?.('.block-content');
      if (content)
        runtime.lifecycle.frame(() => {
          if (content.isConnected)
            runtime.onInput({ target: content, inputType: 'insertCompositionText' });
        });
    });
    runtime.lifecycle.listen(document, 'focusout', runtime.onFocusOut);
    runtime.lifecycle.listen(document, 'input', (e) => {
      if (e.target.closest?.('[data-dock-page]'))
        runtime.refreshOtherDockPages(runtime.state.currentPageId);
    });
    runtime.lifecycle.listen(document, 'focusin', (e) => {
      const target = e.target;
      const pane = target.closest?.('.dock-pane[data-editor-group]');
      if (pane) runtime.focusEditorGroup(pane.dataset.editorGroup);
      if (target === runtime.els.pageTitle || target.matches?.('[data-dock-title]')) {
        const folder = runtime.folderNoteFolderForPage(runtime.pageForTitleEditor(target));
        if (folder) {
          target.dataset.folderNotePath = folder.path;
          target.dataset.folderNoteTitle = folder.name;
        } else {
          delete target.dataset.folderNotePath;
          delete target.dataset.folderNoteTitle;
        }
      }
    });
    runtime.lifecycle.listen(document, 'keydown', runtime.onKeyDown);
    runtime.lifecycle.listen(document, 'change', runtime.onChange);
    runtime.lifecycle.listen(document, 'dragstart', runtime.onDragStart);
    runtime.lifecycle.listen(document, 'dragover', runtime.onDragOver);
    runtime.lifecycle.listen(document, 'dragleave', (e) => {
      const zone = e.target.closest?.('[data-external-icon-dropzone]');
      if (zone && (!e.relatedTarget || !zone.contains(e.relatedTarget)))
        zone.classList.remove('drag-over');
    });
    runtime.lifecycle.listen(document, 'drop', runtime.onDrop);
    runtime.lifecycle.listen(document, 'paste', runtime.onPaste);
    runtime.lifecycle.listen(document, 'copy', runtime.onCopy);
    runtime.lifecycle.listen(document, 'cut', runtime.onCut);
    runtime.lifecycle.listen(document, 'beforeinput', runtime.onBeforeInput);
    runtime.lifecycle.listen(
      document,
      'selectionchange',
      runtime.scheduleTextFormatToolbarFromSelection,
    );
    runtime.lifecycle.listen(document, 'wheel', runtime.onGraphWheel, { passive: false });
    runtime.lifecycle.listen(document, 'pointerdown', runtime.onGraphPointerDown);
    runtime.lifecycle.listen(document, 'pointermove', runtime.onGraphPointerMove);
    runtime.lifecycle.listen(document, 'pointerup', runtime.onGraphPointerUp);
    runtime.lifecycle.listen(document, 'pointercancel', runtime.onGraphPointerCancel);
    runtime.lifecycle.listen(document, 'dragend', runtime.clearDragState);
    runtime.lifecycle.listen(window, 'beforeinstallprompt', (event) => {
      if (matchMedia('(display-mode: standalone)').matches) return;
      event.preventDefault();
      runtime.deferredInstallPrompt = event;
      runtime.els.installAppRow?.classList.remove('hidden');
    });
    runtime.lifecycle.listen(window, 'appinstalled', () => {
      runtime.deferredInstallPrompt = null;
      runtime.els.installAppRow?.classList.add('hidden');
      runtime.toast(`${APP_NAME} installed`);
    });
    runtime.lifecycle.listen(window, 'blur', runtime.onInlineSelectionInteractionBlur);
    runtime.lifecycle.listen(
      document,
      'scroll',
      (e) => {
        runtime.onInlineSelectionScroll(e);
        if (e.target?.matches?.('[data-code-editor]')) runtime.syncCodeScroll(e.target);
        if (e.target?.matches?.('#editorView, .dock-scroll'))
          runtime.captureEditorScrollPosition(e.target);
        if (e.target?.matches?.('.simple-table-scroll'))
          runtime.syncSimpleTableHandles(e.target.closest('.simple-table-block'));
        if (runtime.multiBlockSelection?.active) runtime.renderMultiBlockSelection();
      },
      true,
    );
    runtime.lifecycle.listen(window, 'resize', () => {
      runtime.hideFloatingMenus();
      runtime.hideTextFormatToolbar();
      runtime.updateSidebarOverflow();
      runtime.syncAllSimpleTableHandles();
      if (runtime.multiBlockSelection?.active) runtime.renderMultiBlockSelection();
      if (runtime.activeImageCropBlockId)
        runtime.scheduleImageCropDialogLayout(runtime.activeImageCropBlockId);
      runtime.fitImageBlockViewer();
    });
  }

  function onGraphWheel(e) {
    if (runtime.state.mainView !== 'graph' || !e.target.closest?.('[data-graph-svg]')) return;
    e.preventDefault();
    runtime.setGraphZoom(runtime.graphViewRuntime.scale * (e.deltaY > 0 ? 0.9 : 1.1));
  }

  function graphPointerPosition(svg, e) {
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    return point.matrixTransform(matrix.inverse());
  }

  function onGraphPointerDown(e) {
    if (runtime.state.mainView !== 'graph' || e.button !== 0 || e.isPrimary === false) return;
    const svg = e.target.closest?.('[data-graph-svg]');
    if (!svg) return;
    const point = runtime.graphPointerPosition(svg, e);
    if (!point) return;
    runtime.graphViewRuntime.pointerDrag = {
      pointerId: e.pointerId,
      svg,
      startX: point.x,
      startY: point.y,
      originX: runtime.graphViewRuntime.panX,
      originY: runtime.graphViewRuntime.panY,
      moved: false,
    };
  }

  function onGraphPointerMove(e) {
    const drag = runtime.graphViewRuntime.pointerDrag;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const point = runtime.graphPointerPosition(drag.svg, e);
    if (!point) return;
    const deltaX = point.x - drag.startX,
      deltaY = point.y - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 3) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.svg.classList.add('graph-panning');
      try {
        drag.svg.setPointerCapture(e.pointerId);
      } catch {}
    }
    e.preventDefault();
    runtime.setGraphPan(drag.originX + deltaX, drag.originY + deltaY);
  }

  function onGraphPointerUp(e) {
    const drag = runtime.graphViewRuntime.pointerDrag;
    if (!drag || drag.pointerId !== e.pointerId) return;
    runtime.graphViewRuntime.pointerDrag = null;
    drag.svg.classList.remove('graph-panning');
    if (!drag.moved) return;
    runtime.graphViewRuntime.suppressNodeClick = true;
    runtime.lifecycle.timeout(() => {
      runtime.graphViewRuntime.suppressNodeClick = false;
    });
  }

  function onGraphPointerCancel(e) {
    const drag = runtime.graphViewRuntime.pointerDrag;
    if (!drag || drag.pointerId !== e.pointerId) return;
    runtime.graphViewRuntime.pointerDrag = null;
    drag.svg.classList.remove('graph-panning');
  }

  function onPaneResizeStart(e) {
    const dockDivider = e.target.closest?.('[data-dock-divider]');
    if (dockDivider && e.button === 0) {
      e.preventDefault();
      dockDivider.classList.add('resizing');
      const splitElement = dockDivider.closest('[data-dock-split]'),
        path = [];
      let node = runtime.state.editorLayout,
        current = splitElement;
      while (current?.parentElement?.closest('[data-dock-split]')) {
        const parent = current.parentElement.closest('[data-dock-split]');
        path.unshift(parent.firstElementChild.contains(current) ? 'first' : 'second');
        current = parent;
      }
      for (const branch of path) node = node[branch];
      const move = (event) => {
        const rect = splitElement.getBoundingClientRect();
        node.ratio = Math.max(
          0.2,
          Math.min(
            0.8,
            node.direction === 'row'
              ? (event.clientX - rect.left) / rect.width
              : (event.clientY - rect.top) / rect.height,
          ),
        );
        splitElement.style.setProperty('--first-size', `${Math.round(node.ratio * 100)}%`);
      };
      const stop = () => {
        dockDivider.classList.remove('resizing');
        window.removeEventListener('pointermove', move);
        runtime.scheduleSave();
      };
      runtime.lifecycle.listen(window, 'pointermove', move);
      runtime.lifecycle.listen(window, 'pointerup', stop, { once: true });
      return;
    }
    const handle = e.target.closest('[data-resizer]');
    if (!handle || e.button !== 0) return;
    e.preventDefault();
    const side = handle.dataset.resizer;
    document.body.classList.add('resizing-pane');
    handle.classList.add('resizing');
    const move = (ev) => {
      if (side === 'left') {
        runtime.state.sidebarWidth = Math.max(210, Math.min(420, ev.clientX - 44));
      } else {
        runtime.state.rightSidebarWidth = Math.max(
          220,
          Math.min(420, window.innerWidth - ev.clientX),
        );
      }
      runtime.updateWorkspaceChrome();
    };
    const up = () => {
      document.body.classList.remove('resizing-pane');
      handle.classList.remove('resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      runtime.scheduleSave();
    };
    runtime.lifecycle.listen(window, 'pointermove', move);
    runtime.lifecycle.listen(window, 'pointerup', up, { once: true });
  }

  function onClick(e) {
    if (runtime.gitOperationActive && !e.target.closest?.('[data-git-panel]')) return;
    if (
      runtime.els.blockMenu &&
      !runtime.els.blockMenu.classList.contains('hidden') &&
      !runtime.els.blockMenu.contains(e.target)
    )
      runtime.els.blockMenu.classList.add('hidden');
    if (runtime.consumeImageBlockViewerDragClick(e)) return;
    const imageViewerAction = e.target.closest?.(
      '[data-image-viewer-close],[data-image-viewer-zoom],[data-image-viewer-download],[data-image-viewer-fit]',
    );
    if (imageViewerAction) {
      if (imageViewerAction.matches('[data-image-viewer-close]')) runtime.closeAttachmentPreview();
      else if (imageViewerAction.matches('[data-image-viewer-zoom]'))
        runtime.zoomImageBlockViewer(imageViewerAction.dataset.imageViewerZoom);
      else if (imageViewerAction.matches('[data-image-viewer-download]')) {
        const id = runtime.els.attachmentPreview?.dataset.imageViewerBlockId;
        if (id) runtime.downloadImageBlock(id);
      } else runtime.fitImageBlockViewer();
      return;
    }
    const imageViewer = runtime.els.attachmentPreview;
    const imageViewerImage = runtime.els.attachmentPreviewImage;
    const imageViewerStage = imageViewerImage?.closest('.attachment-preview-image-wrap');
    if (imageViewer?.hasAttribute('data-image-block-fullscreen') && e.target === imageViewerImage) {
      runtime.toggleImageBlockViewerZoom(e);
      return;
    }
    if (
      imageViewer?.hasAttribute('data-image-block-fullscreen') &&
      imageViewerStage?.contains(e.target) &&
      !imageViewerImage?.contains(e.target) &&
      !e.target.closest?.('[data-image-viewer-controls],[data-image-viewer-close]')
    ) {
      runtime.closeAttachmentPreview();
      return;
    }
    if (!e.target.closest?.('[data-mermaid-mode-toggle], [data-mermaid-view-mode]'))
      runtime.closeMermaidModeToolbars();
    if (runtime.addBlockOnBlankPageEndClick(e)) return;
    if (e.target.closest?.('#deleteConfirmAccept')) {
      e.preventDefault();
      runtime.settleDeleteConfirmation(true);
      return;
    }
    if (e.target.closest?.('#deleteConfirmCancel')) {
      e.preventDefault();
      runtime.settleDeleteConfirmation(false);
      return;
    }
    if (e.target === runtime.els.deleteConfirmDialog) {
      runtime.settleDeleteConfirmation(false);
      return;
    }
    if (e.target.closest?.('#workspaceCloseConfirm')) {
      e.preventDefault();
      void runtime.confirmCloseSelectedWorkspace();
      return;
    }
    if (e.target.closest?.('#workspaceCloseCancel')) {
      e.preventDefault();
      runtime.closeWorkspaceCloseDialog();
      return;
    }
    if (e.target === runtime.els.workspaceCloseDialog) {
      runtime.closeWorkspaceCloseDialog();
      return;
    }
    if (
      e.target === runtime.els.attachmentPreview ||
      e.target.closest?.('[data-attachment-preview-close]')
    ) {
      runtime.closeAttachmentPreview();
      return;
    }
    const attachmentCopyButton = e.target.closest?.('[data-attachment-copy]');
    if (attachmentCopyButton) {
      e.preventDefault();
      e.stopPropagation();
      runtime.copyAttachmentToClipboard?.(attachmentCopyButton.dataset.attachmentCopy);
      return;
    }
    const attachmentDeleteButton = e.target.closest?.('[data-attachment-delete]');
    if (attachmentDeleteButton) {
      e.preventDefault();
      e.stopPropagation();
      void runtime.deleteAttachmentFromGallery?.(attachmentDeleteButton.dataset.attachmentDelete);
      return;
    }
    const attachmentReference = e.target.closest?.('[data-attachment-references-path]');
    if (attachmentReference) {
      runtime.selectAttachmentForBacklinks?.(attachmentReference.dataset.attachmentReferencesPath);
      return;
    }
    const attachmentPreviewButton = e.target.closest?.('[data-attachment-preview]');
    if (attachmentPreviewButton) {
      runtime.openAttachmentPreview(attachmentPreviewButton.dataset.attachmentPreview);
      return;
    }
    if (e.target.closest?.('[data-attachment-page]')) {
      runtime.attachmentGalleryPage =
        Number(e.target.closest('[data-attachment-page]').dataset.attachmentPage) || 0;
      runtime.renderAttachmentsGallery();
      return;
    }
    if (e.target.closest?.('[data-attachments-refresh]')) {
      void runtime.refreshAttachmentList();
      return;
    }
    const linkHoverCopy = e.target.closest?.('[data-link-hover-copy]');
    if (linkHoverCopy) {
      e.preventDefault();
      e.stopPropagation();
      runtime.copyHoveredLink();
      return;
    }
    const linkHoverEdit = e.target.closest?.('[data-link-hover-edit]');
    if (linkHoverEdit) {
      e.preventDefault();
      e.stopPropagation();
      runtime.editHoveredLink();
      return;
    }
    if (e.target.closest?.('[data-link-hover-menu]')) return;
    if (e.target.closest?.('#linkEditPanel')) {
      if (e.target.closest('[data-format-link-remove]')) {
        e.preventDefault();
        runtime.removeInlineSelectionLink();
      }
      return;
    }
    if (runtime.standaloneLinkEditorOpen) return;
    const navigationButton = e.target.closest?.('[data-navigation-history]');
    if (navigationButton) {
      const pane = navigationButton.closest('.dock-pane[data-editor-group]');
      const groupId =
        pane?.dataset.editorGroup ||
        navigationButton.dataset.navigationHistoryGroup ||
        runtime.state.activeEditorGroupId;
      if (pane && pane.dataset.editorGroup !== runtime.state.activeEditorGroupId)
        runtime.focusEditorGroup(groupId);
      runtime.navigateHistory(Number(navigationButton.dataset.navigationHistory), groupId);
      return;
    }
    const settingsTab = e.target.closest?.('[data-settings-tab]');
    if (settingsTab) {
      runtime.setSettingsView(settingsTab.dataset.settingsTab);
      return;
    }
    const shortcutBinding = e.target.closest?.('[data-shortcut-action]');
    if (shortcutBinding) {
      runtime.shortcutCaptureAction = shortcutBinding.dataset.shortcutAction;
      runtime.renderShortcutSettings();
      return;
    }
    if (e.target.closest?.('[data-shortcuts-reset]')) {
      runtime.resetShortcuts();
      return;
    }
    if (e.target.closest('#installAppBtn')) {
      if (!runtime.deferredInstallPrompt) {
        runtime.toast('Use your browser menu to install this app');
        return;
      }
      runtime.deferredInstallPrompt.prompt();
      void runtime.deferredInstallPrompt.userChoice.then((choice) => {
        if (choice.outcome === 'accepted') runtime.els.installAppRow?.classList.add('hidden');
        runtime.deferredInstallPrompt = null;
      });
      return;
    }
    if (e.target.closest('#chooseDirectoryBtn')) {
      void runtime.chooseMarkdownDirectory();
      return;
    }
    if (e.target.closest('#saveBrowserWorkspaceBtn')) {
      void runtime.saveBrowserWorkspaceLocally();
      return;
    }
    if (e.target.closest('#closeWorkspaceBtn, #workspaceDisconnectCloseBtn')) {
      runtime.requestCloseSelectedWorkspace();
      return;
    }
    if (e.target.closest('#refreshNotesBtn')) {
      void runtime.refreshMarkdownWorkspace();
      return;
    }
    if (e.target.closest('#revealCurrentFileBtn')) {
      runtime.revealCurrentFile();
      return;
    }
    if (e.target.closest('#newFolderBtn')) {
      void runtime.createMarkdownFolder();
      return;
    }
    if (e.target.closest('#textFormatToolbar')) {
      const typeToggle = e.target.closest('[data-format-type-toggle]');
      if (typeToggle) {
        const menu = runtime.els.textFormatToolbar.querySelector('[data-format-type-menu]');
        const opening = menu.classList.contains('hidden');
        runtime.closeTextFormatPopovers(opening ? 'type' : '');
        menu.classList.toggle('hidden', !opening);
        return;
      }
      const blockType = e.target.closest('[data-format-block-type]');
      if (blockType) {
        runtime.transformInlineSelectionBlock(blockType.dataset.formatBlockType);
        return;
      }
      const colorToggle = e.target.closest('[data-format-color-toggle]');
      if (colorToggle) {
        const menu = runtime.els.textFormatToolbar.querySelector('[data-format-color-menu]');
        const opening = menu.classList.contains('hidden');
        runtime.closeTextFormatPopovers(opening ? 'color' : '');
        menu.classList.toggle('hidden', !opening);
        return;
      }
      const colorChoice = e.target.closest('[data-format-color]');
      if (colorChoice) {
        runtime.applyInlineToolbarChoice('color', colorChoice.dataset.formatColor);
        return;
      }
      const backgroundChoice = e.target.closest('[data-format-background]');
      if (backgroundChoice) {
        runtime.applyInlineToolbarChoice('background', backgroundChoice.dataset.formatBackground);
        return;
      }
      const format = e.target.closest('[data-format-inline]');
      if (format) {
        runtime.applyInlineToolbarFormat(format.dataset.formatInline);
        return;
      }
      if (e.target.closest('[data-format-link-toggle]')) {
        runtime.openInlineLinkPopover();
        return;
      }
      const formatLinkPage = e.target.closest('[data-format-link-page]');
      if (formatLinkPage) {
        runtime.applyInlineSelectionPageLink(formatLinkPage.dataset.formatLinkPage);
        return;
      }
      const formatLinkExternal = e.target.closest('[data-format-link-external]');
      if (formatLinkExternal) {
        const input = runtime.els.textFormatToolbar.querySelector('[data-format-link-input]');
        if (input) input.value = formatLinkExternal.dataset.formatLinkExternal;
        runtime.applyInlineSelectionLink();
        return;
      }
      if (e.target.closest('[data-format-link-apply]')) {
        runtime.applyInlineSelectionLink();
        return;
      }
      if (e.target.closest('[data-format-link-remove]')) {
        runtime.removeInlineSelectionLink();
        return;
      }
      if (e.target.closest('[data-format-clear]')) {
        runtime.clearInlineSelectionFormatting();
        return;
      }
      return;
    }
    const ribbon = e.target.closest('[data-ribbon-action]');
    if (ribbon) {
      const action = ribbon.dataset.ribbonAction;
      if (action === 'toggle-left') {
        runtime.state.sidebarOpen = !runtime.state.sidebarOpen;
        runtime.scheduleSave();
        runtime.updateWorkspaceChrome();
        return;
      }
      if (action === 'files' || action === 'favorites' || action === 'git') {
        runtime.state.leftPanelMode = action;
        runtime.state.sidebarOpen = true;
        runtime.scheduleSave();
        runtime.renderSidebar();
        runtime.updateWorkspaceChrome();
        return;
      }
      if (action === 'attachments') {
        runtime.openAttachmentsTab();
        return;
      }
      if (action === 'search') {
        runtime.openCommandPalette();
        return;
      }
      if (action === 'graph') {
        runtime.openGraphTab();
        return;
      }
      if (action === 'home') {
        if (runtime.state.currentPageId !== '__home__') runtime.cancelPageOperations();
        runtime.state.mainView = 'page';
        runtime.state.currentPageId = '__home__';
        runtime.state.activeTabId = null;
        runtime.scheduleSave();
        runtime.renderAll();
        return;
      }
      if (action === 'new-note') {
        runtime.createPage();
        return;
      }
      if (action === 'new-folder') {
        void runtime.createMarkdownFolder();
        return;
      }
      if (action === 'settings') {
        runtime.openSettings();
        return;
      }
    }
    const rightMode = e.target.closest('[data-right-mode]');
    if (rightMode) {
      runtime.state.rightPanelMode = rightMode.dataset.rightMode;
      runtime.scheduleSave();
      runtime.renderRightSidebar();
      return;
    }
    const outline = e.target.closest('[data-outline-block]');
    if (outline) {
      const blockId = outline.dataset.outlineBlock;
      const row = [
        ...(runtime.els.blockEditor?.querySelectorAll('.block-row[data-block-id]') || []),
      ].find((item) => item.dataset.blockId === blockId);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        runtime.lifecycle.frame(() => {
          const content = row.querySelector('.block-content[contenteditable="true"]');
          if (!content) return;
          content.focus();
          runtime.setCaretOffset(content, 0);
        });
      }
      return;
    }
    const backlink = e.target.closest('[data-backlink-page]');
    if (backlink) {
      runtime.openPage(backlink.dataset.backlinkPage);
      return;
    }
    const graphNode = e.target.closest('[data-graph-page]');
    if (graphNode) {
      if (runtime.graphViewRuntime.suppressNodeClick) return;
      runtime.openPage(graphNode.dataset.graphPage, { newTab: true });
      return;
    }
    if (e.target.closest('[data-graph-fit]')) {
      runtime.setGraphZoom(1);
      runtime.setGraphPan(0, 0);
      return;
    }
    if (e.target.closest('[data-graph-zoom-in]')) {
      runtime.setGraphZoom(runtime.graphViewRuntime.scale * 1.2);
      return;
    }
    if (e.target.closest('[data-graph-zoom-out]')) {
      runtime.setGraphZoom(runtime.graphViewRuntime.scale / 1.2);
      return;
    }
    const selectionRow = e.target.closest(
      '#pageTree .folder-tree-row[data-folder-id],#pageTree .page-tree-row[data-page-id]',
    );
    if (
      selectionRow &&
      e.target.closest('[data-action="select-folder"],[data-action="open-page"]') &&
      (e.shiftKey || e.ctrlKey || e.metaKey)
    ) {
      e.preventDefault();
      runtime.hideFloatingMenus();
      runtime.selectFilesTreeRow(selectionRow, e);
      return;
    }
    const folderRow = e.target.closest('.folder-tree-row[data-folder-path]');
    if (folderRow) {
      const path = folderRow.dataset.folderPath,
        folder = runtime.folderByPath(path);
      if (e.target.closest('[data-action="toggle-folder"]')) {
        if (folder) {
          folder.expanded = folder.expanded === false;
          runtime.scheduleSave();
          runtime.renderSidebar();
        }
        return;
      }
      if (e.target.closest('[data-action="select-folder"]')) {
        void runtime.selectMarkdownFolder(path);
        return;
      }
    }
    const wikiLink = e.target.closest('[data-wiki-page-title]');
    if (wikiLink) {
      e.preventDefault();
      e.stopPropagation();
      runtime.openWikiLink(wikiLink.dataset.wikiPage, wikiLink.dataset.wikiPageTitle, {
        newTab: e.shiftKey,
      });
      return;
    }
    const tabClose = e.target.closest('[data-tab-close]');
    if (tabClose) {
      e.stopPropagation();
      runtime.closeTab(tabClose.dataset.tabClose);
      return;
    }
    const tab = e.target.closest('.editor-tab[data-tab-id], .dock-tab[data-tab-id]');
    if (tab) {
      runtime.activateTab(tab.dataset.tabId);
      return;
    }
    const plainTextToggle = e.target.closest('[data-page-plain-text-toggle]');
    if (plainTextToggle) {
      const pane = plainTextToggle.closest('.dock-pane[data-editor-group]');
      if (pane) runtime.focusEditorGroup(pane.dataset.editorGroup);
      runtime.togglePagePlainText();
      return;
    }
    const pageMenuTrigger = e.target.closest('[data-page-menu-trigger]');
    if (pageMenuTrigger) {
      runtime.showPageMenu(pageMenuTrigger, pageMenuTrigger.dataset.pageMenuTrigger);
      return;
    }
    const pageRow = e.target.closest('.page-tree-row');
    if (pageRow) {
      const id = pageRow.dataset.pageId;
      if (e.target.closest('[data-action="toggle-page"]')) {
        const p = runtime.pageById(id);
        p.expanded = !p.expanded;
        runtime.scheduleSave();
        runtime.renderSidebar();
        return;
      }
      if (e.target.closest('[data-action="open-page"]')) {
        runtime.state.activeFolderPath = '';
        runtime.filesTreeSelectionCleared = false;
        runtime.openPage(id);
        return;
      }
    }
    if (
      runtime.state.leftPanelMode === 'files' &&
      e.target.closest('.sidebar-scroll') &&
      !e.target.closest(
        '.folder-tree-row,.page-tree-row,.section-title,button,[data-tree-context-action]',
      )
    ) {
      const hadFolderDestination = Boolean(runtime.state.activeFolderPath),
        hadVisualSelection = !runtime.filesTreeSelectionCleared;
      runtime.state.activeFolderPath = '';
      runtime.resetFilesTreeSelection(null, true);
      if (hadFolderDestination) runtime.scheduleSave();
      if (hadFolderDestination || hadVisualSelection) runtime.renderSidebar();
      return;
    }
    const folderCrumb = e.target.closest('[data-crumb-folder-path]');
    if (folderCrumb) {
      runtime.openFolderBreadcrumb(folderCrumb.dataset.crumbFolderPath);
      return;
    }
    const crumb = e.target.closest('[data-crumb-id]');
    if (crumb) {
      runtime.openPage(crumb.dataset.crumbId);
      return;
    }
    const homeCard = e.target.closest('[data-home-page]');
    if (homeCard) {
      runtime.openPage(homeCard.dataset.homePage);
      return;
    }
    const homeAction = e.target.closest('[data-home-action="new"]');
    if (homeAction) {
      runtime.createPage();
      return;
    }
    if (e.target.closest('#newPageBtn') || e.target.closest('#newPageFooterBtn')) {
      e.preventDefault();
      e.stopPropagation();
      runtime.createPage();
      return;
    }
    if (e.target.closest('#createVaultBtn')) {
      e.preventDefault();
      e.stopPropagation();
      runtime.createVault();
      return;
    }
    if (e.target.closest('#renameVaultBtn')) {
      e.preventDefault();
      e.stopPropagation();
      runtime.renameVault();
      return;
    }
    if (e.target.closest('#deleteVaultBtn')) {
      e.preventDefault();
      e.stopPropagation();
      runtime.deleteVault();
      return;
    }
    if (e.target.closest('#vaultDialogConfirm')) {
      e.preventDefault();
      runtime.submitVaultDialog();
      return;
    }
    if (e.target.closest('[data-vault-dialog-cancel]')) {
      e.preventDefault();
      runtime.closeVaultDialog();
      return;
    }
    if (e.target.closest('#newFolderConfirm')) {
      e.preventDefault();
      void runtime.submitNewFolderDialog();
      return;
    }
    if (e.target.closest('[data-new-folder-cancel]')) {
      e.preventDefault();
      runtime.closeNewFolderDialog();
      return;
    }
    if (e.target.closest('[data-action="home"]')) {
      if (runtime.state.currentPageId !== '__home__') runtime.cancelPageOperations();
      runtime.state.mainView = 'page';
      runtime.state.currentPageId = '__home__';
      runtime.state.activeTabId = null;
      runtime.scheduleSave();
      runtime.renderAll();
      return;
    }
    if (e.target.closest('[data-action="search"]')) {
      runtime.openCommandPalette();
      return;
    }
    if (e.target.closest('#sidebarToggle')) {
      runtime.state.sidebarOpen = false;
      runtime.scheduleSave();
      runtime.updateWorkspaceChrome();
      return;
    }
    if (e.target.closest('#sidebarOpen')) {
      runtime.state.sidebarOpen = true;
      runtime.scheduleSave();
      runtime.updateWorkspaceChrome();
      return;
    }
    if (e.target.closest('#rightSidebarToggle')) {
      runtime.state.rightSidebarOpen = !runtime.state.rightSidebarOpen;
      runtime.scheduleSave();
      runtime.updateWorkspaceChrome();
      return;
    }
    if (e.target.closest('#pageIcon,[data-dock-icon]')) {
      runtime.showIconMenu(e.target.closest('#pageIcon,[data-dock-icon]'));
      return;
    }
    if (e.target === runtime.els.newFolderDialog) {
      runtime.closeNewFolderDialog();
      return;
    }
    const closeModalButton = e.target.closest?.('[data-close-modal]');
    if (closeModalButton) {
      closeModalButton.closest('.modal-backdrop, #settingsModal')?.classList.add('hidden');
      return;
    }
    if (e.target.classList.contains('modal-backdrop')) {
      e.target.classList.add('hidden');
      return;
    }
    if (e.target.closest('#publishToggle')) {
      e.target.closest('#publishToggle').classList.toggle('on');
      runtime.toast('Public sharing updated');
      return;
    }
    if (e.target.closest('#themeToggle')) {
      runtime.cycleTheme();
      return;
    }
    if (e.target.closest('#resetAppSettingsBtn')) {
      runtime.resetAppSettings();
      return;
    }

    const emojiChoice = e.target.closest('[data-emoji-choice]');
    if (emojiChoice) {
      runtime.chooseEmoji(emojiChoice.dataset.emojiChoice);
      return;
    }

    const iconTab = e.target.closest('[data-icon-picker-tab]');
    if (iconTab) {
      runtime.switchIconPickerTab(iconTab.dataset.iconPickerTab);
      return;
    }
    if (e.target.closest('[data-default-page-icon]')) {
      runtime.setPageIcon(
        runtime.defaultIconForPage(runtime.currentPage()),
        runtime.state.currentPageId,
        true,
      );
      return;
    }
    const iconChoice = e.target.closest('[data-icon-choice]');
    if (iconChoice) {
      runtime.setPageIcon(iconChoice.dataset.iconChoice);
      return;
    }
    if (e.target.closest('[data-custom-icon-submit]')) {
      const input = runtime.els.pageMetaMenu.querySelector('[data-custom-icon-input]');
      if (input?.value.trim()) runtime.setPageIcon(input.value.trim().slice(0, 12));
      return;
    }
    if (e.target.closest('[data-external-icon-submit]')) {
      const input = runtime.els.pageMetaMenu.querySelector('[data-external-icon-url]');
      if (input) runtime.applyExternalIconUrl(input.value);
      return;
    }
    if (
      e.target.closest('[data-external-icon-upload]') ||
      e.target.closest('[data-external-icon-dropzone]')
    ) {
      e.preventDefault();
      runtime.els.pageIconFileInput?.click();
      return;
    }
    if (e.target.closest('[data-comment-submit]')) {
      runtime.addPageComment();
      return;
    }
    if (e.target.closest('[data-comments-close]')) {
      runtime.els.pageComments.classList.add('hidden');
      return;
    }
    const delComment = e.target.closest('[data-comment-delete]');
    if (delComment) {
      runtime.deletePageComment(delComment.dataset.commentDelete);
      return;
    }

    const pageBlockLink = e.target.closest('[data-page-block-open]');
    if (pageBlockLink) {
      runtime.openPage(pageBlockLink.dataset.pageBlockOpen);
      return;
    }
    const pageLinkOpen = e.target.closest('[data-page-link-open]');
    if (pageLinkOpen) {
      runtime.openPage(pageLinkOpen.dataset.pageLinkOpen);
      return;
    }
    const pageLinkChoose = e.target.closest('[data-page-link-choose]');
    if (pageLinkChoose) {
      const row = pageLinkChoose.closest('.page-link-block');
      if (row) runtime.showPageLinkPicker(row, row.dataset.blockId);
      return;
    }
    const pageLinkPick = e.target.closest('[data-page-link-pick]');
    if (pageLinkPick && runtime.activePageLinkBlockId) {
      runtime.setPageLinkTarget(runtime.activePageLinkBlockId, pageLinkPick.dataset.pageLinkPick);
      return;
    }

    const inlinePageLink = e.target.closest('[data-inline-page]');
    if (inlinePageLink) {
      e.preventDefault();
      e.stopPropagation();
      const page = runtime.pageById(inlinePageLink.dataset.inlinePage);
      if (page) runtime.openPage(page.id, { newTab: e.shiftKey });
      else runtime.toast('Linked page no longer exists');
      return;
    }
    const inlineLink = e.target.closest('a[data-inline-link]');
    if (inlineLink) {
      e.preventDefault();
      window.open(inlineLink.href, '_blank', 'noopener,noreferrer');
      return;
    }

    const blockRow = e.target.closest('.block-row');
    if (blockRow) {
      const id = blockRow.dataset.blockId;
      if (blockRow.classList.contains('image-block') && e.target.closest('.image-preview img')) {
        runtime.selectImageBlock?.(id);
        return;
      }
      if (e.target.closest('[data-code-copy]')) {
        runtime.copyCodeBlock(id);
        return;
      }
      const modeToggle = e.target.closest('[data-mermaid-mode-toggle]');
      if (modeToggle) {
        const toolbar = blockRow.querySelector('.mermaid-mode-toolbar');
        const open = !!toolbar && !toolbar.classList.contains('hidden');
        runtime.closeMermaidModeToolbars();
        if (toolbar) {
          toolbar.classList.toggle('hidden', open);
          modeToggle.setAttribute('aria-expanded', String(!open));
        }
        return;
      }
      const mermaidMode = e.target.closest('[data-mermaid-view-mode]');
      if (mermaidMode) {
        runtime.setMermaidViewMode(id, mermaidMode.dataset.mermaidViewMode);
        return;
      }
      if (e.target.closest('[data-mermaid-download]')) {
        void runtime.downloadMermaidDiagram(blockRow, id);
        return;
      }
      if (e.target.closest('[data-code-wrap]')) {
        const b = runtime.findBlock(id);
        if (b) {
          b.codeWrap = !b.codeWrap;
          runtime.scheduleSave();
          runtime.renderBlocks(runtime.currentPage());
          runtime.focusCodeBlock(id);
        }
        return;
      }
      if (e.target.closest('[data-code-more]')) {
        runtime.showCodeOptions(blockRow, id);
        return;
      }
      if (e.target.closest('[data-table-corner-select]')) {
        runtime.selectSimpleTable(id);
        return;
      }
      const rowMenu = e.target.closest('[data-table-row-menu]');
      if (rowMenu) {
        runtime.showSimpleTableAxisMenu(rowMenu, id, 'row', Number(rowMenu.dataset.tableRowMenu));
        return;
      }
      const colMenu = e.target.closest('[data-table-col-menu]');
      if (colMenu) {
        runtime.showSimpleTableAxisMenu(colMenu, id, 'col', Number(colMenu.dataset.tableColMenu));
        return;
      }
      if (e.target.closest('[data-table-add-row]')) {
        const b = runtime.findBlock(id);
        if (b) {
          runtime.normalizeSimpleTableBlock(b);
          const ri = b.tableRows.length;
          b.tableRows.push(Array(b.tableRows[0].length).fill(''));
          runtime.scheduleSave();
          runtime.renderBlocks(runtime.currentPage());
          runtime.focusSimpleTableCell(id, ri, 0);
        }
        return;
      }
      if (e.target.closest('[data-table-add-col]')) {
        const b = runtime.findBlock(id);
        if (b) {
          runtime.normalizeSimpleTableBlock(b);
          const ci = b.tableRows[0].length;
          b.tableRows.forEach((r) => r.push(''));
          runtime.scheduleSave();
          runtime.renderBlocks(runtime.currentPage());
          runtime.focusSimpleTableCell(id, 0, ci);
        }
        return;
      }
      if (e.target.closest('[data-table-header-row]')) {
        const b = runtime.findBlock(id);
        if (b) {
          b.tableHeaderRow = !b.tableHeaderRow;
          runtime.scheduleSave();
          runtime.renderBlocks(runtime.currentPage());
        }
        return;
      }
      if (e.target.closest('[data-table-header-col]')) {
        const b = runtime.findBlock(id);
        if (b) {
          b.tableHeaderColumn = !b.tableHeaderColumn;
          runtime.scheduleSave();
          runtime.renderBlocks(runtime.currentPage());
        }
        return;
      }
      if (e.target.closest('[data-block-action="add"]')) {
        runtime.addBlockAfter(id);
        return;
      }
      if (e.target.closest('[data-block-action="drag"]')) {
        runtime.showBlockMenu(blockRow, id);
        return;
      }
      if (e.target.closest('[data-image-upload]')) {
        runtime.chooseImageFile(id);
        return;
      }
      if (e.target.closest('[data-image-url]')) {
        runtime.openImageUrlEditor(id);
        return;
      }
      if (e.target.closest('[data-image-url-submit]')) {
        runtime.commitImageUrl(id, blockRow.querySelector('[data-image-url-input]'));
        return;
      }
      if (e.target.closest('[data-image-url-cancel]')) {
        runtime.activeImageLinkBlockId = null;
        runtime.renderBlocks(runtime.currentPage());
        return;
      }
      if (e.target.closest('[data-image-remove]')) {
        const b = runtime.findBlock(id);
        if (b) {
          b.src = '';
          b.alt = '';
          delete b.imageWidth;
          runtime.scheduleSave();
          runtime.renderBlocks(runtime.currentPage());
        }
        return;
      }
      const imageAlignChoice = e.target.closest('[data-image-align-choice]');
      if (imageAlignChoice) {
        runtime.setImageAlignment(id, imageAlignChoice.dataset.imageAlignChoice);
        return;
      }
      if (e.target.closest('[data-image-align]')) {
        const menu = blockRow.querySelector('[data-image-align-menu]');
        menu?.classList.toggle('hidden');
        return;
      }
      if (e.target.closest('[data-image-caption-toggle]')) {
        runtime.toggleImageCaption(id);
        return;
      }
      if (e.target.closest('[data-image-crop]')) {
        if (runtime.activeImageCropBlockId === id) runtime.cancelImageCrop(id);
        else runtime.openImageCrop(id);
        return;
      }
      if (e.target.closest('[data-image-crop-aspect-toggle]')) {
        blockRow.querySelector('[data-image-crop-aspect-menu]')?.classList.toggle('hidden');
        return;
      }
      if (e.target.matches('[data-image-crop-backdrop]')) {
        runtime.cancelImageCrop(id);
        return;
      }
      const cropAspect = e.target.closest('[data-image-crop-aspect]');
      if (cropAspect) {
        runtime.setImageCropAspect(id, cropAspect.dataset.imageCropAspect);
        return;
      }
      if (e.target.closest('[data-image-crop-reset]')) {
        runtime.resetImageCrop(id);
        return;
      }
      if (e.target.closest('[data-image-crop-cancel]')) {
        runtime.cancelImageCrop(id);
        return;
      }
      if (e.target.closest('[data-image-crop-apply]')) {
        runtime.applyImageCrop(id);
        return;
      }
      if (e.target.closest('[data-image-download]')) {
        runtime.downloadImageBlock(id);
        return;
      }
      if (e.target.closest('.toggle-prefix')) {
        const b = runtime.findBlock(id);
        if (b?.type === 'toggle') {
          b.open = !b.open;
          runtime.scheduleSave();
          runtime.renderCurrentBlocksKeepFocus();
        }
        return;
      }
    }

    const tableAxisAction = e.target.closest('[data-table-axis-action]');
    if (tableAxisAction) {
      runtime.runSimpleTableAxisAction(tableAxisAction);
      return;
    }
    const codeMenuAction = e.target.closest('[data-code-menu-action]');
    if (codeMenuAction) {
      runtime.runCodeMenuAction(
        codeMenuAction.dataset.codeMenuAction,
        codeMenuAction.dataset.blockId,
      );
      return;
    }
    const slashItem = e.target.closest('[data-slash-type]');
    if (slashItem) {
      runtime.applySlashType(slashItem.dataset.slashType);
      return;
    }
    const cmd = e.target.closest('[data-command]');
    if (cmd) {
      runtime.runCommand(cmd.dataset.command, cmd.dataset.pageId);
      return;
    }
    const treeContextAction = e.target.closest('[data-tree-context-action]');
    if (treeContextAction) {
      void runtime.runTreeContextAction(treeContextAction);
      return;
    }
    const blockMenuAction = e.target.closest('[data-block-menu-action]');
    if (blockMenuAction) {
      runtime.runBlockMenuAction(
        blockMenuAction.dataset.blockMenuAction,
        blockMenuAction.dataset.blockId,
      );
      return;
    }

    if (!e.target.closest('.floating-menu')) runtime.hideFloatingMenus();
  }

  function onImageBlockDoubleClick(event) {
    const image = event.target.closest?.('.image-block .image-preview img');
    const row = image?.closest('.image-block');
    if (!row) return;
    event.preventDefault();
    runtime.openImageBlockPreview(row.dataset.blockId);
  }

  function onTreeContextMenu(e) {
    const row = e.target.closest?.(
      '#pageTree .folder-tree-row[data-folder-path], #pageTree .page-tree-row[data-page-id]',
    );
    if (!row) return;
    e.preventDefault();
    runtime.showTreeContextMenu(e, row);
  }

  function onTreeContextMenuOutside(e) {
    if (
      !runtime.els.blockMenu ||
      runtime.els.blockMenu.classList.contains('hidden') ||
      runtime.els.blockMenu.contains(e.target)
    )
      return;
    runtime.els.blockMenu.classList.add('hidden');
  }

  function contextMenuItemContent(icon, label) {
    return `${runtime.iconMarkup(icon, '16px')}<span>${runtime.escapeHtml(label)}</span>`;
  }

  function treeContextActionIcon(action) {
    const icons = {
      'open-folder': 'folder-open',
      'new-note': 'file-plus',
      'new-folder': 'folder-plus',
      'duplicate-folder': 'copy',
      'delete-folder': 'trash',
      'open-page': 'file',
      'convert-page-to-folder': 'folder',
      'convert-folder-to-note': 'file',
      'duplicate-page': 'copy',
      'toggle-favorite': 'star',
      'delete-page': 'trash',
      'open-selected': 'files',
      'duplicate-selected': 'copy',
      'favorite-selected': 'star',
      'unfavorite-selected': 'star',
      'expand-selected': 'folder-open',
      'duplicate-folders-selected': 'copy',
      'delete-selected': 'trash',
    };
    return icons[action] || 'circle-help';
  }

  function treeContextMenuButton(
    action,
    label,
    { pageId = null, folderPath = null, danger = false } = {},
  ) {
    const attrs = [`data-tree-context-action="${runtime.escapeHtml(action)}"`];
    if (pageId !== null) attrs.push(`data-page-id="${runtime.escapeHtml(pageId)}"`);
    if (folderPath !== null) attrs.push(`data-folder-path="${runtime.escapeHtml(folderPath)}"`);
    return runtime.htmlWithStyles(
      `<button class="block-menu-item${danger ? ' danger' : ''}" role="menuitem" ${attrs.join(' ')}>${runtime.contextMenuItemContent(runtime.treeContextActionIcon(action), label)}</button>`,
    );
  }

  function showTreeContextMenu(event, row) {
    runtime.hideFloatingMenus();
    runtime.syncFilesTreeSelection();
    if (!runtime.filesTreeSelection.has(runtime.fileTreeRowKey(row)))
      runtime.selectFilesTreeRow(row);
    const selected = runtime.selectedFileTreeItems();
    runtime.treeContextSelection = {
      scope: runtime.fileTreeScope(),
      keys: [...runtime.filesTreeSelection],
    };
    const isFolder = row.dataset.itemType === 'folder';
    const id = row.dataset.pageId,
      path = row.dataset.folderPath;
    const page = id ? runtime.pageById(id) : null,
      folder = path ? runtime.folderByPath(path) : null;
    if ((isFolder && !folder) || (!isFolder && !page)) return;
    let items = isFolder
      ? runtime.treeContextMenuButton('open-folder', 'Open folder', { folderPath: path }) +
        runtime.treeContextMenuButton('convert-folder-to-note', 'Convert to Note', {
          folderPath: path,
        }) +
        runtime.treeContextMenuButton('new-note', 'New note', { folderPath: path }) +
        runtime.treeContextMenuButton('new-folder', 'New subfolder', { folderPath: path }) +
        runtime.treeContextMenuButton('duplicate-folder', 'Duplicate folder', {
          folderPath: path,
        }) +
        runtime.treeContextMenuButton('delete-folder', 'Delete folder', {
          folderPath: path,
          danger: true,
        })
      : runtime.treeContextMenuButton('open-page', 'Open note', { pageId: id }) +
        (runtime.representedFolderForPage(page)
          ? ''
          : runtime.treeContextMenuButton('convert-page-to-folder', 'Convert to Folder', {
              pageId: id,
            })) +
        runtime.treeContextMenuButton('duplicate-page', 'Duplicate', { pageId: id }) +
        runtime.treeContextMenuButton(
          'toggle-favorite',
          page.favorite ? 'Remove from favorites' : 'Add to favorites',
          { pageId: id },
        ) +
        runtime.treeContextMenuButton('delete-page', 'Delete note', { pageId: id, danger: true });
    if (selected.length > 1) items = runtime.treeSelectionMenuHTML(selected);
    const menu = runtime.els.blockMenu,
      width = selected.length > 1 ? 250 : 210;
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8))}px`;
    menu.setAttribute('role', 'menu');
    menu.innerHTML = items;
    const readActions = new Set(['open-page', 'open-folder', 'open-selected', 'expand-selected']);
    menu.querySelectorAll('[data-tree-context-action]').forEach((button) => {
      if (
        runtime.workspaceAccess !== 'writable' &&
        !readActions.has(button.dataset.treeContextAction)
      )
        button.disabled = true;
    });
    const height = menu.querySelectorAll('button').length * 38 + (selected.length > 1 ? 36 : 8);
    menu.style.top = Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)) + 'px';
    menu.classList.remove('hidden');
  }

  function treeSelectionMenuHTML(items) {
    const notes = items.filter((item) => item.type === 'page').map((item) => item.value);
    const folders = items.filter((item) => item.type === 'folder');
    const button = (action, label, danger = false) =>
      runtime.treeContextMenuButton(action, label, { danger });
    let html =
      runtime.htmlWithStyles('<div class="tree-context-summary">') +
      items.length +
      ' items selected</div>';
    if (notes.length) {
      const label = notes.length + ' note' + (notes.length === 1 ? '' : 's');
      html += button('open-selected', 'Open ' + label + ' in new tabs');
      html += button('duplicate-selected', 'Duplicate ' + label);
      const allFavorite = notes.every((page) => page.favorite);
      html += button(
        allFavorite ? 'unfavorite-selected' : 'favorite-selected',
        (allFavorite ? 'Remove ' + label + ' from' : 'Add ' + label + ' to') + ' favorites',
      );
    }
    if (folders.length) {
      html += button(
        'expand-selected',
        'Expand ' + folders.length + ' folder' + (folders.length === 1 ? '' : 's'),
      );
      html += button(
        'duplicate-folders-selected',
        'Duplicate ' + folders.length + ' folder' + (folders.length === 1 ? '' : 's'),
      );
    }
    return html + button('delete-selected', 'Delete ' + items.length + ' selected items', true);
  }

  function treeSelectionDeletion(items) {
    const paths = items
      .filter((item) => item.type === 'folder')
      .map((item) => runtime.normalizeFolderPath(item.value.path).toLocaleLowerCase());
    const insideFolder = (path) => {
      const normalized = runtime.normalizeFolderPath(path).toLocaleLowerCase();
      return paths.some((root) => normalized === root || normalized.startsWith(root + '/'));
    };
    const ids = new Set(items.filter((item) => item.type === 'page').map((item) => item.value.id));
    const rootFolderPathForPage = (page) => {
      let root = page;
      const visited = new Set();
      while (root.parentId && !visited.has(root.id)) {
        visited.add(root.id);
        const parent = runtime.pageById(root.parentId);
        if (!parent) break;
        root = parent;
      }
      return runtime.folderPathForId(root.folderId);
    };
    for (const page of runtime.state.pages)
      if (insideFolder(rootFolderPathForPage(page))) ids.add(page.id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const page of runtime.state.pages)
        if (ids.has(page.parentId) && !ids.has(page.id)) {
          ids.add(page.id);
          changed = true;
        }
    }
    return { ids, insideFolder };
  }

  async function runSelectedTreeAction(action, selection) {
    if (!selection || selection.scope !== runtime.fileTreeScope()) return;
    const items = runtime.selectedFileTreeItems(selection.keys);
    const notes = items.filter((item) => item.type === 'page').map((item) => item.value);
    if (!items.length) return;
    if (action === 'duplicate-folders-selected') {
      const paths = items.filter((item) => item.type === 'folder').map((item) => item.value.path);
      const roots = paths.filter(
        (path) =>
          !paths.some(
            (parent) =>
              path !== parent &&
              path.toLocaleLowerCase().startsWith(parent.toLocaleLowerCase() + '/'),
          ),
      );
      for (const path of roots) {
        if (selection.scope !== runtime.fileTreeScope()) return;
        if (!(await runtime.moveFolderByDrop(path, runtime.folderParentPath(path), { copy: true })))
          return;
      }
      return;
    }
    if (action === 'open-selected') {
      const groupId = runtime.state.activeEditorGroupId;
      notes.forEach((page, index) => runtime.createTab(page.id, index === 0, groupId));
      runtime.scheduleSave();
      runtime.renderAll();
      return;
    }
    if (action === 'expand-selected') {
      items
        .filter((item) => item.type === 'folder')
        .forEach((item) => {
          item.value.expanded = true;
        });
      runtime.scheduleSave();
      runtime.renderSidebar();
      return;
    }
    if (action === 'favorite-selected' || action === 'unfavorite-selected') {
      notes.forEach((page) => {
        page.favorite = action === 'favorite-selected';
      });
      runtime.scheduleSave();
      runtime.renderSidebar();
      return;
    }
    if (action === 'duplicate-selected') {
      const previousPages = runtime.state.pages,
        copies = [];
      runtime.state.pages = [...previousPages];
      for (const page of notes) {
        const copy = runtime.clone(page);
        copy.id = runtime.uid('page');
        delete copy.filePath;
        copy.title = runtime.uniqueNoteTitle(page.title, page.parentId, page.folderId);
        const error = runtime.validateFilesystemName(copy.title, 3);
        if (error) {
          runtime.state.pages = previousPages;
          runtime.toast(error);
          return;
        }
        copy.blocks = copy.blocks.map(runtime.cloneBlockWithNewIds);
        copy.favorite = false;
        copy.folderNote = false;
        copies.push(copy);
        runtime.state.pages.push(copy);
      }
      runtime.resetFilesTreeSelection();
      runtime.filesTreeSelection = new Set(copies.map((page) => 'page:' + page.id));
      runtime.filesTreeSelectionAnchor = copies.length ? 'page:' + copies[0].id : null;
      runtime.scheduleSave();
      runtime.renderAll();
      runtime.toast(copies.length + ' notes duplicated');
      return;
    }
    if (action === 'delete-selected') {
      if (
        !(await runtime.askDeleteConfirmation(
          'Delete selected items?',
          `Delete ${items.length} selected items? Selected folders and child notes will also be deleted.`,
        ))
      )
        return;
      if (selection.scope !== runtime.fileTreeScope()) return;
      const confirmedItems = runtime.selectedFileTreeItems(selection.keys);
      if (!confirmedItems.length) return;
      runtime.flushHistoryPending(runtime.activeVaultId);
      const previousWorkspace = runtime.clone(runtime.state),
        deletion = runtime.treeSelectionDeletion(confirmedItems);
      runtime.removePagesFromWorkspace(deletion.ids);
      runtime.state.folders = runtime.state.folders.filter(
        (folder) => !deletion.insideFolder(folder.path),
      );
      if (deletion.insideFolder(runtime.state.activeFolderPath))
        runtime.state.activeFolderPath = '';
      runtime.resetFilesTreeSelection(null, true);
      runtime.recordHistory();
      const saved = await runtime.persistStateNow(previousWorkspace);
      runtime.renderAll();
      runtime.toast(
        saved ? 'Selected items deleted' : 'Could not save the deletion. Check workspace access.',
      );
    }
  }

  async function runTreeContextAction(button) {
    if (button.disabled) return;
    const action = button.dataset.treeContextAction,
      id = button.dataset.pageId,
      path = button.dataset.folderPath;
    const selection = runtime.treeContextSelection;
    runtime.els.blockMenu.classList.add('hidden');
    if (!selection || selection.scope !== runtime.fileTreeScope()) return;
    if (!['open-page', 'open-folder', 'open-selected', 'expand-selected'].includes(action)) {
      if (runtime.workspaceAccess !== 'writable') {
        runtime.toast('Grant write access to modify the selected items.');
        return;
      }
      if (runtime.localStorageGateway.hasDirectory?.()) {
        const permission = await runtime.localStorageGateway.getDirectoryPermission?.();
        if (permission !== 'readwrite') {
          await runtime.applyWorkspacePermission(permission, { reload: true });
          runtime.toast('Grant write access to modify the selected items.');
          return;
        }
      }
      if (selection.scope !== runtime.fileTreeScope()) return;
    }
    if (action.endsWith('-selected')) {
      await runtime.runSelectedTreeAction(action, selection);
      return;
    }
    if (id) {
      if (action === 'toggle-favorite') {
        const page = runtime.pageById(id);
        if (page) {
          page.favorite = !page.favorite;
          runtime.scheduleSave();
          runtime.renderSidebar();
        }
        return;
      }
      runtime.runCommand(action, id);
      return;
    }
    if (action === 'open-folder') {
      await runtime.selectMarkdownFolder(path);
      return;
    }
    if (action === 'convert-folder-to-note') {
      await runtime.convertFolderToNote(path);
      return;
    }
    if (action === 'new-note') {
      runtime.state.activeFolderPath = path;
      runtime.createPage();
      return;
    }
    if (action === 'new-folder') {
      runtime.state.activeFolderPath = path;
      void runtime.createMarkdownFolder();
      return;
    }
    if (action === 'duplicate-folder') {
      await runtime.moveFolderByDrop(path, runtime.folderParentPath(path), { copy: true });
      return;
    }
    if (action === 'delete-folder') await runtime.deleteMarkdownFolder(path);
  }

  function onMouseDown(e) {
    const floatingTextPanel = e.target.closest?.(
      '#textFormatToolbar,#linkEditPanel,[data-link-hover-menu]',
    );
    if (floatingTextPanel) {
      runtime.lifecycle.clearTimeout(runtime.inlineSelectionUpdateTimer);
      runtime.lifecycle.clearTimeout(runtime.linkHoverHideTimer);
      runtime.linkHoverHideTimer = null;
      if (!e.target.closest?.('input,textarea')) e.preventDefault();
      return;
    }
    const dockPane = e.target.closest?.('.dock-pane[data-editor-group]');
    if (dockPane) runtime.focusEditorGroup(dockPane.dataset.editorGroup);
    const cropHandle = e.target.closest?.('[data-image-crop-handle]');
    if (e.button === 0 && cropHandle) {
      const row = cropHandle.closest('.image-block');
      if (row) {
        runtime.startImageCropFrameResize(cropHandle, row.dataset.blockId, e);
        return;
      }
    }
    const cropFrame = e.target.closest?.('[data-image-crop-frame]');
    if (e.button === 0 && cropFrame) {
      const row = cropFrame.closest('.image-block');
      if (row) {
        runtime.startImageCropFrameMove(cropFrame, row.dataset.blockId, e);
        return;
      }
    }
    const imageResize = e.target.closest?.('[data-image-resize]');
    if (e.button === 0 && imageResize) {
      const row = imageResize.closest('.image-block');
      if (row) {
        runtime.startImageResize(
          imageResize,
          row.dataset.blockId,
          imageResize.dataset.imageResize,
          e,
        );
        return;
      }
    }
    if (e.button === 0) {
      if (!e.target.closest?.('.image-block .image-preview img'))
        runtime.clearSelectedImageBlock?.();
      if (
        e.shiftKey &&
        e.target.closest?.(
          '#pageTree [data-action="open-page"],#pageTree [data-action="select-folder"]',
        )
      )
        e.preventDefault();
      const tableCell = e.target.closest?.('[data-table-cell]');
      if (tableCell && runtime.els.blockEditor?.contains(tableCell)) {
        runtime.beginTableCellSelection(e, tableCell);
      } else {
        runtime.clearTableCellSelection();
        if (runtime.selectedTableBlockId && !e.target.closest?.('[data-table-corner-select]'))
          runtime.clearSelectedTable();
        const content = e.target.closest?.('.block-content[contenteditable="true"]');
        if (content && runtime.els.blockEditor?.contains(content))
          runtime.beginMultiBlockSelection(e, content);
        else runtime.clearMultiBlockSelection();
      }
    }
    if (e.button !== 1) return;
    if (
      e.target.closest(
        '.editor-tab[data-tab-id], .dock-tab[data-tab-id], .page-tree-row [data-action="open-page"], .folder-tree-row [data-action="select-folder"], [data-crumb-id], [data-crumb-folder-path], [data-home-page], [data-page-block-open], [data-page-link-open]',
      )
    )
      e.preventDefault();
  }

  function selectableBlockContents() {
    return Array.from(
      runtime.els.blockEditor?.querySelectorAll?.('.block-content[contenteditable="true"]') || [],
    ).filter((el) => el.isConnected && el.offsetParent !== null);
  }

  function contentBoundaryPoint(content, atEnd = false) {
    if (!content) return null;
    if (!atEnd) return { node: content, offset: 0, content };
    return { node: content, offset: content.childNodes.length, content };
  }

  function caretPointInContent(content, x, y) {
    if (!content) return null;
    let node = null,
      offset = 0;
    try {
      if (document.caretPositionFromPoint) {
        const p = document.caretPositionFromPoint(x, y);
        node = p?.offsetNode || null;
        offset = p?.offset || 0;
      } else if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(x, y);
        node = r?.startContainer || null;
        offset = r?.startOffset || 0;
      }
    } catch {}
    if (node && (node === content || content.contains(node))) return { node, offset, content };
    const rect = content.getBoundingClientRect();
    const atEnd =
      y > rect.bottom || (y >= rect.top && y <= rect.bottom && x > rect.left + rect.width * 0.5);
    return runtime.contentBoundaryPoint(content, atEnd);
  }

  function nearestSelectableContent(x, y) {
    const pointElement = document.elementFromPoint(x, y);
    const direct = pointElement?.closest?.('.block-content[contenteditable="true"]');
    if (direct && runtime.els.blockEditor?.contains(direct)) return direct;
    const contents = runtime.selectableBlockContents();
    const table = pointElement?.closest?.('.simple-table-block');
    if (table && runtime.els.blockEditor?.contains(table)) {
      let before = null,
        after = null;
      for (const content of contents) {
        const relation = table.compareDocumentPosition(content);
        if (relation & Node.DOCUMENT_POSITION_PRECEDING) before = content;
        if (!after && relation & Node.DOCUMENT_POSITION_FOLLOWING) after = content;
      }
      const anchor = runtime.multiBlockSelection?.anchor?.content;
      if (anchor) {
        const tableAfterAnchor = !!(
          anchor.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING
        );
        return tableAfterAnchor ? after || before : before || after;
      }
      const rect = table.getBoundingClientRect();
      return y < rect.top + rect.height / 2 ? before || after : after || before;
    }
    let best = null,
      bestDistance = Infinity;
    for (const content of contents) {
      const r = content.getBoundingClientRect();
      const distance = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      if (distance < bestDistance) {
        best = content;
        bestDistance = distance;
      }
    }
    return bestDistance <= 32 ? best : null;
  }

  function pointOrder(a, b, contents = runtime.selectableBlockContents()) {
    const ai = contents.indexOf(a?.content),
      bi = contents.indexOf(b?.content);
    if (ai !== bi) return ai - bi;
    if (ai < 0) return 0;
    try {
      const ar = document.createRange(),
        br = document.createRange();
      ar.setStart(a.node, a.offset);
      ar.collapse(true);
      br.setStart(b.node, b.offset);
      br.collapse(true);
      return ar.compareBoundaryPoints(Range.START_TO_START, br);
    } catch {
      return 0;
    }
  }

  function orderedMultiSelectionPoints(selection = runtime.multiBlockSelection) {
    if (!selection?.anchor || !selection?.focus) return null;
    const contents = runtime.selectableBlockContents();
    const order = runtime.pointOrder(selection.anchor, selection.focus, contents);
    return order <= 0
      ? { start: selection.anchor, end: selection.focus, contents }
      : { start: selection.focus, end: selection.anchor, contents };
  }

  function multiSelectionRanges(selection = runtime.multiBlockSelection) {
    const ordered = runtime.orderedMultiSelectionPoints(selection);
    if (!ordered) return [];
    const { start, end, contents } = ordered,
      startIndex = contents.indexOf(start.content),
      endIndex = contents.indexOf(end.content);
    if (startIndex < 0 || endIndex < startIndex) return [];
    const ranges = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const content = contents[i],
        range = document.createRange();
      try {
        if (i === startIndex) range.setStart(start.node, start.offset);
        else range.setStart(content, 0);
        if (i === endIndex) range.setEnd(end.node, end.offset);
        else range.setEnd(content, content.childNodes.length);
        if (!range.collapsed) ranges.push({ content, range });
      } catch {}
    }
    return ranges;
  }

  function multiSelectionTables(selection = runtime.multiBlockSelection) {
    const ordered = runtime.orderedMultiSelectionPoints(selection);
    if (!ordered) return [];
    const { start, end } = ordered;
    if (start.content === end.content) return [];
    return Array.from(
      runtime.els.blockEditor?.querySelectorAll?.('.simple-table-block[data-block-id]') || [],
    ).filter((table) => {
      if (!table.isConnected || table.offsetParent === null) return false;
      const afterStart = !!(
        start.content.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING
      );
      const beforeEnd = !!(
        table.compareDocumentPosition(end.content) & Node.DOCUMENT_POSITION_FOLLOWING
      );
      return afterStart && beforeEnd;
    });
  }

  function multiSelectionCodeBlocks(selection = runtime.multiBlockSelection) {
    const ordered = runtime.orderedMultiSelectionPoints(selection);
    if (!ordered) return [];
    const { start, end } = ordered;
    if (start.content === end.content) return [];
    return Array.from(
      runtime.els.blockEditor?.querySelectorAll?.('.code-block[data-block-id]') || [],
    )
      .filter((row) => {
        if (!row.isConnected || row.offsetParent === null) return false;
        const afterStart = !!(
          start.content.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING
        );
        const beforeEnd = !!(
          row.compareDocumentPosition(end.content) & Node.DOCUMENT_POSITION_FOLLOWING
        );
        return afterStart && beforeEnd;
      })
      .map((row) => ({ row, block: runtime.findBlock(row.dataset.blockId) }))
      .filter((entry) => entry.block?.type === 'code');
  }

  function compareNodesInDocument(a, b) {
    if (a === b) return 0;
    const rel = a.compareDocumentPosition(b);
    if (rel & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (rel & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  }

  function multiSelectionLayer() {
    let layer = document.getElementById('multiBlockSelectionLayer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'multiBlockSelectionLayer';
      layer.className = runtime.classWithStyles('multi-block-selection-layer');
      document.body.appendChild(layer);
    }
    return layer;
  }

  function renderMultiBlockSelection() {
    const layer = runtime.multiSelectionLayer();
    layer.innerHTML = '';
    if (!runtime.multiBlockSelection?.active) return;
    for (const { range } of runtime.multiSelectionRanges()) {
      for (const rect of range.getClientRects()) {
        if (rect.width < 0.5 || rect.height < 0.5) continue;
        const mark = document.createElement('span');
        mark.className = runtime.classWithStyles('multi-block-selection-rect');
        mark.style.left = `${rect.left}px`;
        mark.style.top = `${rect.top}px`;
        mark.style.width = `${rect.width}px`;
        mark.style.height = `${rect.height}px`;
        layer.appendChild(mark);
      }
    }
    for (const table of runtime.multiSelectionTables()) {
      const target = table.querySelector('.simple-table-scroll') || table,
        rect = target.getBoundingClientRect();
      if (rect.width < 0.5 || rect.height < 0.5) continue;
      const mark = document.createElement('span');
      mark.className = runtime.classWithStyles(
        'multi-block-selection-rect multi-block-selection-table',
      );
      mark.style.left = `${rect.left}px`;
      mark.style.top = `${rect.top}px`;
      mark.style.width = `${rect.width}px`;
      mark.style.height = `${rect.height}px`;
      layer.appendChild(mark);
    }
  }

  function clearMultiBlockSelection() {
    if (runtime.multiBlockSelection?.dragging) {
      window.removeEventListener('mousemove', runtime.onMultiBlockSelectionMove, true);
      window.removeEventListener('mouseup', runtime.onMultiBlockSelectionEnd, true);
    }
    runtime.multiBlockSelection = null;
    const layer = document.getElementById('multiBlockSelectionLayer');
    if (layer) layer.innerHTML = '';
  }

  function beginMultiBlockSelection(e, content) {
    runtime.clearMultiBlockSelection();
    const anchor = runtime.caretPointInContent(content, e.clientX, e.clientY);
    if (!anchor) return;
    runtime.multiBlockSelection = {
      anchor,
      focus: anchor,
      active: false,
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
    };
    runtime.lifecycle.listen(window, 'mousemove', runtime.onMultiBlockSelectionMove, true);
    runtime.lifecycle.listen(window, 'mouseup', runtime.onMultiBlockSelectionEnd, true);
  }

  function onMultiBlockSelectionMove(e) {
    const selection = runtime.multiBlockSelection;
    if (!selection?.dragging) return;
    if (!(e.buttons & 1)) {
      runtime.onMultiBlockSelectionEnd(e);
      return;
    }
    const content = runtime.nearestSelectableContent(e.clientX, e.clientY);
    if (!content) return;
    const focus = runtime.caretPointInContent(content, e.clientX, e.clientY);
    if (!focus) return;
    const crossedBlock = content !== selection.anchor.content;
    const moved = Math.hypot(e.clientX - selection.startX, e.clientY - selection.startY) > 4;
    if (!selection.active && !(crossedBlock && moved)) return;
    selection.active = true;
    selection.focus = focus;
    e.preventDefault();
    try {
      window.getSelection()?.removeAllRanges();
    } catch {}
    runtime.renderMultiBlockSelection();
  }

  function onMultiBlockSelectionEnd(e) {
    const selection = runtime.multiBlockSelection;
    if (!selection) return;
    window.removeEventListener('mousemove', runtime.onMultiBlockSelectionMove, true);
    window.removeEventListener('mouseup', runtime.onMultiBlockSelectionEnd, true);
    selection.dragging = false;
    if (!selection.active) {
      runtime.multiBlockSelection = null;
      return;
    }
    const content = runtime.nearestSelectableContent(e.clientX, e.clientY);
    if (content) {
      const focus = runtime.caretPointInContent(content, e.clientX, e.clientY);
      if (focus) selection.focus = focus;
    }
    e.preventDefault?.();
    try {
      window.getSelection()?.removeAllRanges();
    } catch {}
    runtime.renderMultiBlockSelection();
    runtime.scheduleTextFormatToolbarFromSelection();
  }

  function multiSelectionSegments() {
    const segments = [];
    if (!runtime.multiBlockSelection?.active) return segments;
    for (const { content, range } of runtime.multiSelectionRanges()) {
      const row = content.closest('.block-row'),
        location = runtime.findBlockLocation(row?.dataset.blockId),
        block = location?.block;
      if (!block || !runtime.isTextLikeBlock(block)) continue;
      const start = runtime.localTextOffset(content, range.startContainer, range.startOffset);
      const end = runtime.localTextOffset(content, range.endContainer, range.endOffset);
      if (end <= start) continue;
      segments.push({ content, range, row, location, block, start, end });
    }
    return segments;
  }

  function markdownEscapeLinkLabel(value) {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/\]/g, '\\]');
  }

  function markdownEscapeLinkUrl(value) {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/[()]/g, (m) => `\\${m}`);
  }

  function markdownInlineSlice(block, start, end) {
    const text = String(block?.text || ''),
      safeStart = Math.max(0, Math.min(text.length, start)),
      safeEnd = Math.max(safeStart, Math.min(text.length, end));
    const links = runtime.inlineLinksForBlock(block);
    if (!links.length) return text.slice(safeStart, safeEnd);
    let out = '',
      cursor = safeStart;
    for (const link of links) {
      const from = Math.max(safeStart, link.start),
        to = Math.min(safeEnd, link.end);
      if (to <= from) continue;
      if (from > cursor) out += text.slice(cursor, from);
      out += `[${runtime.markdownEscapeLinkLabel(text.slice(from, to))}](${runtime.markdownEscapeLinkUrl(link.url)})`;
      cursor = to;
    }
    return out + text.slice(cursor, safeEnd);
  }

  function markdownPrefixForBlock(block, location) {
    if (!block) return '';
    const indent = '  '.repeat(runtime.listIndentLevel(block));
    if (block.type === 'bullet') return `${indent}- `;
    if (block.type === 'number')
      return `${indent}${runtime.numberForBlock(block.id, location?.blocks || [])}. `;
    if (block.type === 'todo') return `- [${block.checked ? 'x' : ' '}] `;
    if (block.type === 'h1') return '# ';
    if (block.type === 'h2') return '## ';
    if (block.type === 'h3') return '### ';
    if (block.type === 'quote' || block.type === 'callout') return '> ';
    return '';
  }

  function markdownCodeBlock(block) {
    const value = String(block?.text || ''),
      runs = [...value.matchAll(/`{3,}|~{3,}/g)].map((match) => match[0].length),
      fence = '`'.repeat(Math.max(3, ...runs.map((size) => size + 1)));
    return `${fence}${block?.language || ''}\n${value}\n${fence}`;
  }

  function selectedMultiBlockMarkdown() {
    const segments = runtime.multiSelectionSegments();
    if (!segments.length) return '';
    const entries = segments.map((segment) => ({ kind: 'text', node: segment.content, segment }));
    for (const row of runtime.multiSelectionTables()) {
      const block = runtime.findBlock(row.dataset.blockId);
      if (block?.type === 'table') entries.push({ kind: 'table', node: row, block });
    }
    for (const { row, block } of runtime.multiSelectionCodeBlocks())
      entries.push({ kind: 'code', node: row, block });
    entries.sort((a, b) => runtime.compareNodesInDocument(a.node, b.node));
    return entries
      .map((entry) => {
        if (entry.kind === 'table') return runtime.simpleTableMarkdown(entry.block);
        if (entry.kind === 'code') return runtime.markdownCodeBlock(entry.block);
        const { block, location, start, end } = entry.segment;
        const prefix = start === 0 ? runtime.markdownPrefixForBlock(block, location) : '';
        return prefix + runtime.markdownInlineSlice(block, start, end);
      })
      .join('\n');
  }

  function copyMultiBlockSelectionToClipboard(e) {
    const markdown = runtime.selectedMultiBlockMarkdown();
    if (!markdown) return false;
    e?.preventDefault?.();
    e?.clipboardData?.setData?.('text/plain', markdown);
    e?.clipboardData?.setData?.('text/markdown', markdown);
    return true;
  }

  function onCopy(e) {
    if (runtime.copySelectedImageBlockToClipboard?.(e)) return;
    if (runtime.copySelectedTableCellsToClipboard(e)) return;
    if (runtime.copySelectedTableToClipboard(e)) return;
    runtime.copyMultiBlockSelectionToClipboard(e);
  }

  function onCut(e) {
    if (runtime.cutSelectedImageBlock?.(e)) return;
    if (runtime.copySelectedTableCellsToClipboard(e)) {
      runtime.clearSelectedTableCells();
      return;
    }
    if (runtime.copySelectedTableToClipboard(e)) return;
    if (!runtime.multiBlockSelection?.active) return;
    if (runtime.copyMultiBlockSelectionToClipboard(e)) runtime.deleteMultiBlockSelection();
  }

  function localTextOffset(content, node, offset) {
    try {
      const range = document.createRange();
      range.selectNodeContents(content);
      range.setEnd(node, offset);
      return range.toString().length;
    } catch {
      return 0;
    }
  }

  function deleteBlockTextRange(block, start, end) {
    const original = String(block?.text || ''),
      safeStart = Math.max(0, Math.min(original.length, start)),
      safeEnd = Math.max(safeStart, Math.min(original.length, end));
    if (safeEnd <= safeStart) return;
    const links = runtime.inlineLinksAroundRange(block, safeStart, safeEnd),
      formats = runtime.inlineFormatsAroundRange(block, safeStart, safeEnd),
      rightShift = safeStart;
    block.text = original.slice(0, safeStart) + original.slice(safeEnd);
    const merged = [
      ...links.left,
      ...links.right.map((link) => ({
        start: link.start + rightShift,
        end: link.end + rightShift,
        url: link.url,
      })),
    ];
    block.inlineLinks = runtime.normalizeInlineLinkRanges(merged, block.text.length);
    if (!block.inlineLinks.length) delete block.inlineLinks;
    const mergedFormats = [
      ...formats.left,
      ...formats.right.map((format) => ({
        ...format,
        start: format.start + rightShift,
        end: format.end + rightShift,
      })),
    ];
    block.inlineFormats = runtime.normalizeInlineFormatRanges(mergedFormats, block.text.length);
    if (!block.inlineFormats.length) delete block.inlineFormats;
  }

  function normalizeListIndentation(blocks) {
    if (!Array.isArray(blocks)) return;
    let previous = null;
    for (const block of blocks) {
      if (!runtime.isListBlock(block)) {
        previous = block;
        continue;
      }
      let level = runtime.listIndentLevel(block);
      if (!runtime.isListBlock(previous)) level = 0;
      else level = Math.min(level, runtime.listIndentLevel(previous) + 1);
      runtime.setListIndentLevel(block, level);
      previous = block;
    }
  }

  function deleteMultiBlockSelection() {
    const segments = runtime.multiSelectionSegments();
    if (!segments.length) {
      runtime.clearMultiBlockSelection();
      return false;
    }
    const selectedTables = runtime
      .multiSelectionTables()
      .map((row) => row.dataset.blockId)
      .filter(Boolean);
    const first = segments[0],
      firstContainer = first.location.blocks,
      firstIndex = first.location.index;
    const affectedLists = new Set();
    let focusId = null,
      focusOffset = 0;

    for (let i = segments.length - 1; i >= 0; i--) {
      const { block, start, end } = segments[i],
        location = runtime.findBlockLocation(block.id);
      if (!location) continue;
      const textLength = String(block.text || '').length,
        fullBlock = start === 0 && end >= textLength;
      if (fullBlock) {
        affectedLists.add(location.blocks);
        location.blocks.splice(location.index, 1);
      } else {
        runtime.deleteBlockTextRange(block, start, end);
        if (i === 0) {
          focusId = block.id;
          focusOffset = start;
        }
      }
    }

    for (let i = selectedTables.length - 1; i >= 0; i--) {
      const location = runtime.findBlockLocation(selectedTables[i]);
      if (location) {
        affectedLists.add(location.blocks);
        location.blocks.splice(location.index, 1);
      }
    }
    for (const blocks of affectedLists) {
      runtime.normalizeListIndentation(blocks);
      runtime.ensureBlockList(blocks);
    }
    runtime.clearMultiBlockSelection();
    runtime.scheduleSave();
    runtime.renderBlocks(runtime.currentPage());

    if (focusId && runtime.findBlock(focusId)) {
      runtime.focusBlock(focusId, focusOffset);
      return true;
    }
    if (Array.isArray(firstContainer) && firstContainer.length) {
      const target =
        firstContainer[Math.min(firstIndex, firstContainer.length - 1)] || firstContainer.at(-1);
      if (target?.id) runtime.focusBlock(target.id, 0);
    }
    return true;
  }

  function onAuxClick(e) {
    if (e.button !== 1) return;
    const backlink = e.target.closest?.('[data-backlink-page]');
    if (backlink) {
      e.preventDefault();
      runtime.openPage(backlink.dataset.backlinkPage, { newTab: true });
      return;
    }
    const inlinePageLink = e.target.closest?.('[data-inline-page]');
    if (inlinePageLink) {
      const page = runtime.pageById(inlinePageLink.dataset.inlinePage);
      if (page) {
        e.preventDefault();
        runtime.openPage(page.id, { newTab: true });
      }
      return;
    }
    const wikiLink = e.target.closest?.('[data-wiki-page-title]');
    if (wikiLink) {
      e.preventDefault();
      runtime.openWikiLink(wikiLink.dataset.wikiPage, wikiLink.dataset.wikiPageTitle, {
        newTab: true,
      });
      return;
    }
    const tab = e.target.closest('.editor-tab[data-tab-id], .dock-tab[data-tab-id]');
    if (tab) {
      e.preventDefault();
      runtime.closeTab(tab.dataset.tabId);
      return;
    }
    const pageRow = e.target.closest('.page-tree-row');
    if (pageRow && e.target.closest('[data-action="open-page"]')) {
      e.preventDefault();
      runtime.openPage(pageRow.dataset.pageId, { newTab: true });
      return;
    }
    const folderRow = e.target.closest('.folder-tree-row[data-folder-path]');
    if (folderRow && e.target.closest('[data-action="select-folder"]')) {
      e.preventDefault();
      void runtime.selectMarkdownFolder(folderRow.dataset.folderPath, { newTab: true });
      return;
    }
    const pageBlockLink = e.target.closest('[data-page-block-open]');
    if (pageBlockLink) {
      e.preventDefault();
      runtime.openPage(pageBlockLink.dataset.pageBlockOpen, { newTab: true });
      return;
    }
    const pageLinkOpen = e.target.closest('[data-page-link-open]');
    if (pageLinkOpen) {
      e.preventDefault();
      runtime.openPage(pageLinkOpen.dataset.pageLinkOpen, { newTab: true });
      return;
    }
    const crumb = e.target.closest('[data-crumb-id]');
    if (crumb) {
      e.preventDefault();
      runtime.openPage(crumb.dataset.crumbId, { newTab: true });
      return;
    }
    const folderCrumb = e.target.closest('[data-crumb-folder-path]');
    if (folderCrumb) {
      e.preventDefault();
      runtime.openFolderBreadcrumb(folderCrumb.dataset.crumbFolderPath);
      return;
    }
    const homeCard = e.target.closest('[data-home-page]');
    if (homeCard) {
      e.preventDefault();
      runtime.openPage(homeCard.dataset.homePage, { newTab: true });
    }
  }

  function onInput(e) {
    if (e.target === runtime.els.treeIconSize) {
      runtime.state.treeIconSize = runtime.normalizeTreeIconSize(e.target.value);
      runtime.syncTreeIconSizeSettings();
      runtime.scheduleSave();
      return;
    }
    if (e.target.matches?.('[data-format-link-input]')) {
      runtime.renderInlineLinkResults(e.target.value);
      return;
    }
    if (e.target.matches?.('[data-graph-search]')) {
      runtime.applyGraphSearch(e.target.value);
      return;
    }
    if (e.target.matches?.('[data-page-link-search]')) {
      runtime.pageLinkPickerIndex = 0;
      runtime.renderPageLinkPickerResults(e.target.value);
      return;
    }
    if (e.target === runtime.els.pageTitle || e.target.matches?.('[data-dock-title]')) {
      const p = runtime.pageForTitleEditor(e.target),
        title = e.target.innerText.replace(/\n/g, ' ');
      if (!p) return;
      const validationError = runtime.validateFilesystemName(title, 3);
      if (validationError) {
        e.target.dataset.filenameError = validationError;
        return;
      }
      const conflict = runtime.pageTitleConflict(p, title);
      if (conflict) {
        e.target.dataset.filenameError = `A ${conflict.kind} named "${conflict.name}" already exists in this location.`;
        return;
      }
      delete e.target.dataset.filenameError;
      p.title = title;
      runtime.scheduleSave('merge');
      runtime.renderSidebar();
      runtime.renderTabs();
      if (p.id === runtime.state.currentPageId) {
        runtime.renderBreadcrumbs(p);
        runtime.renderRightSidebar();
      }
      if (runtime.els.editorDock && !runtime.els.editorDock.classList.contains('hidden'))
        runtime.els.editorDock.querySelectorAll(`.dock-tab[data-tab-id]`).forEach((tab) => {
          const item = runtime.state.openTabs.find((t) => t.id === tab.dataset.tabId);
          if (item?.pageId === p.id)
            tab.querySelector('.tab-title').textContent = p.title || 'Untitled';
        });
      return;
    }
    if (e.target === runtime.els.commandSearch) {
      runtime.commandIndex = 0;
      runtime.renderCommandResults(e.target.value);
      return;
    }
    if (e.target === runtime.els.slashSearch) {
      runtime.slashIndex = 0;
      runtime.renderSlashResults(e.target.value);
      return;
    }
    if (e.target.matches('[data-icon-search]')) {
      runtime.renderIconPickerResults(e.target.value);
      return;
    }
    if (e.target.matches('[data-code-editor]')) {
      const row = e.target.closest('.code-block'),
        b = runtime.findBlock(row?.dataset.blockId);
      if (b) {
        b.text = e.target.value;
        runtime.scheduleSave('merge');
        runtime.updateCodePreview(row, b, e.target);
      }
      return;
    }
    const content = e.target.closest('.block-content');
    if (content) {
      const row = content.closest('.block-row');
      const b = runtime.findBlock(row.dataset.blockId);
      if (!b) return;
      b.text = content.innerText.replace(/\n$/, '');
      delete b.wikiLinks;
      b.inlineLinks = runtime.inlineLinksFromContent(content, b.text);
      if (!b.inlineLinks.length) delete b.inlineLinks;
      b.inlineFormats = runtime.inlineFormatsFromContent(content, b.text);
      if (!b.inlineFormats.length) delete b.inlineFormats;
      content.dataset.empty = b.text.length ? 'false' : 'true';
      if (!e.isComposing && e.inputType?.startsWith('insert')) {
        if (
          runtime.applyMarkdownBlockShortcut(content) ||
          runtime.applyMarkdownInlineShortcut(content)
        )
          return;
      }
      runtime.scheduleSave('merge');
      if (['h1', 'h2', 'h3'].includes(b.type)) runtime.renderRightSidebar();
      if (b.text.startsWith('/') && !b.text.includes('\n')) {
        runtime.showSlashMenu(row, b);
        runtime.hideEmojiMenu();
      } else {
        if (runtime.activeSlashBlockId === b.id) runtime.hideSlashMenu();
        runtime.updateEmojiMenu(content, b);
      }
      runtime.els.emptyHint.style.display = 'none';
      return;
    }
    if (e.target.matches('[data-table-cell]')) {
      const row = e.target.closest('.simple-table-block'),
        b = runtime.findBlock(row?.dataset.blockId);
      if (!b) return;
      runtime.normalizeSimpleTableBlock(b);
      const [ri, ci] = e.target.dataset.tableCell.split(':').map(Number);
      if (b.tableRows[ri]) {
        const text = e.target.innerText.replace(/\n$/, '');
        b.tableRows[ri][ci] = text;
        runtime.syncTableCellInlineFromContent(b, ri, ci, e.target, text);
      }
      runtime.scheduleSave('merge');
      runtime.lifecycle.frame(() => runtime.syncSimpleTableHandles(row));
      return;
    }
    const imageCropInput = e.target.closest(
      '[data-image-crop-zoom],[data-image-crop-x],[data-image-crop-y]',
    );
    if (imageCropInput) {
      runtime.updateImageCropControl(imageCropInput);
      return;
    }
    const imageCaption = e.target.closest('[data-image-caption]');
    if (imageCaption) {
      const row = imageCaption.closest('.image-block');
      const b = runtime.findBlock(row.dataset.blockId);
      if (b) {
        b.caption = imageCaption.innerText.replace(/\n$/, '');
        b.showCaption = true;
        runtime.scheduleSave('merge');
      }
      return;
    }
  }

  function onChange(e) {
    if (e.target === runtime.els.pageFont) {
      runtime.state.pageFont = runtime.normalizePageFont(e.target.value);
      runtime.applyPageFont();
      runtime.scheduleSave();
      return;
    }
    if (e.target === runtime.els.spellcheckEnabled) {
      runtime.state.spellcheckEnabled = e.target.checked;
      runtime.scheduleSave();
      runtime.syncSpellcheckSettings();
      return;
    }
    if (e.target === runtime.els.showCustomPageIcons) {
      runtime.state.showCustomPageIcons = e.target.checked;
      runtime.scheduleSave();
      runtime.renderAll();
      return;
    }
    if (e.target === runtime.els.showFilesAndTabIcons) {
      runtime.state.showFilesAndTabIcons = e.target.checked;
      runtime.scheduleSave();
      runtime.renderAll();
      return;
    }
    if (e.target === runtime.els.showBreadcrumbIcons) {
      runtime.state.showBreadcrumbIcons = e.target.checked;
      runtime.scheduleSave();
      runtime.renderAll();
      return;
    }
    if (e.target === runtime.els.folderNotesEnabled) {
      runtime.state.folderNotesEnabled = e.target.checked;
      runtime.syncDefaultFolderNoteIcons(runtime.state.folderNotesEnabled);
      if (!runtime.state.folderNotesEnabled) {
        const folder = runtime.folderByPath(runtime.state.activeFolderPath);
        if (folder) folder.expanded = true;
      }
      runtime.scheduleSave();
      runtime.renderAll();
      return;
    }
    if (e.target.matches('[data-code-language]')) {
      const row = e.target.closest('.code-block'),
        b = runtime.findBlock(row?.dataset.blockId);
      if (b) {
        b.language = e.target.value;
        if (b.language === 'mermaid' && typeof b.mermaidPreview !== 'boolean')
          b.mermaidPreview = true;
        runtime.scheduleSave();
        runtime.renderBlocks(runtime.currentPage());
        runtime.focusCodeBlock(b.id);
      }
      return;
    }
    if (e.target === runtime.els.workspaceSelect) {
      void runtime.switchWorkspaceLocation(e.target.value);
      return;
    }
    if (e.target === runtime.els.vaultSelect) {
      runtime.switchVault(e.target.value);
      return;
    }
    if (e.target.matches('.todo-box')) {
      const row = e.target.closest('.block-row');
      const b = runtime.findBlock(row.dataset.blockId);
      b.checked = e.target.checked;
      row.classList.toggle('checked', b.checked);
      runtime.scheduleSave();
    }
    if (e.target === runtime.els.imageFileInput && e.target.files[0]) {
      const id = runtime.activeImageBlockId;
      const file = e.target.files[0];
      e.target.value = '';
      runtime.activeImageBlockId = null;
      if (id) runtime.loadImageFileIntoBlock(file, id);
    }
    if (e.target === runtime.els.pageIconFileInput && e.target.files[0]) {
      const file = e.target.files[0];
      e.target.value = '';
      runtime.loadPageIconFile(file);
    }
  }

  function onKeyDown(e) {
    if (runtime.gitOperationActive) return;
    const gitDiff = useWorkspaceStore.getState().gitDiff;
    if (gitDiff && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      useWorkspaceStore.getState().setGitDiff(null);
      return;
    }
    if (
      !['ArrowUp', 'ArrowDown'].includes(e.key) ||
      e.shiftKey ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey
    )
      verticalNavigation.reset();
    if (e.isComposing || e.keyCode === 229) return;
    if (
      runtime.els.deleteConfirmDialog &&
      !runtime.els.deleteConfirmDialog.classList.contains('hidden')
    ) {
      if (e.key === 'Escape') {
        e.preventDefault();
        runtime.settleDeleteConfirmation(false);
      }
      return;
    }
    if (runtime.shortcutCaptureAction) {
      if (e.key === 'Escape') {
        e.preventDefault();
        runtime.shortcutCaptureAction = null;
        runtime.renderShortcutSettings();
        return;
      }
      if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return;
      e.preventDefault();
      const action = runtime.shortcutCaptureAction;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        runtime.state.shortcuts[action] = '';
        runtime.shortcutCaptureAction = null;
        runtime.scheduleSave();
        runtime.renderShortcutSettings();
        return;
      }
      const shortcut = runtime.shortcutFromEvent(e);
      if (!shortcut) {
        runtime.toast('Use Ctrl/Cmd or Alt with another key');
        return;
      }
      if (
        runtime.RESERVED_SHORTCUTS.has(shortcut) ||
        (shortcut === 'Mod+K' && action !== 'search')
      ) {
        runtime.toast('That shortcut is reserved by the browser or editor');
        return;
      }
      const conflict = runtime.SHORTCUT_ACTIONS.find(
        (item) => item.id !== action && runtime.state.shortcuts[item.id] === shortcut,
      );
      if (conflict) {
        runtime.toast(`Already assigned to ${conflict.label}`);
        return;
      }
      runtime.state.shortcuts[action] = shortcut;
      runtime.shortcutCaptureAction = null;
      runtime.scheduleSave();
      runtime.renderShortcutSettings();
      return;
    }
    if (
      e.key === 'Escape' &&
      runtime.els.attachmentPreview &&
      !runtime.els.attachmentPreview.classList.contains('hidden')
    ) {
      runtime.closeAttachmentPreview();
      return;
    }
    if (
      e.key === 'Escape' &&
      runtime.els.workspaceCloseDialog &&
      !runtime.els.workspaceCloseDialog.classList.contains('hidden')
    ) {
      e.preventDefault();
      runtime.closeWorkspaceCloseDialog();
      return;
    }
    const focusedImageBlock = e.target.closest?.(
      '.image-block.image-block-selected[data-block-id]',
    );
    if (e.key === 'Delete' && focusedImageBlock) {
      e.preventDefault();
      runtime.deleteSelectedImageBlock?.(focusedImageBlock.dataset.blockId);
      return;
    }
    const shortcutAction = runtime.shortcutActionForEvent(e);
    if (
      gitDiff &&
      [
        'undo',
        'redo',
        'favorite',
        'comments',
        'share',
        'splitRight',
        'splitDown',
        'mergePanes',
      ].includes(shortcutAction)
    ) {
      e.preventDefault();
      return;
    }
    const inlineLinkShortcut =
      shortcutAction === 'search' &&
      runtime.shortcutFromEvent(e) === 'Mod+K' &&
      !!e.target.closest?.('.block-content[contenteditable="true"]') &&
      !!runtime.captureInlineSelection();
    if (shortcutAction && !inlineLinkShortcut && !e.repeat) {
      e.preventDefault();
      runtime.runShortcutAction(shortcutAction);
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (gitDiff && mod && e.key === 'Tab') {
      e.preventDefault();
      useWorkspaceStore.getState().setGitDiff(null);
      runtime.cycleTab(e.shiftKey ? -1 : 1);
      return;
    }
    if (
      mod &&
      e.key.toLowerCase() === 'y' &&
      runtime.state.shortcuts.redo === runtime.DEFAULT_SHORTCUTS.redo &&
      !e.repeat
    ) {
      e.preventDefault();
      if (!gitDiff) runtime.runShortcutAction('redo');
      return;
    }
    if (gitDiff && e.target.closest?.('#gitDiffEditor, [aria-controls="gitDiffEditor"]')) return;
    if (e.target.matches?.('[data-page-link-search]')) {
      const items = [...runtime.els.blockMenu.querySelectorAll('[data-page-link-pick]')];
      if (e.key === 'ArrowDown' && items.length) {
        e.preventDefault();
        runtime.pageLinkPickerIndex = Math.min(runtime.pageLinkPickerIndex + 1, items.length - 1);
        runtime.renderPageLinkPickerSelection();
        return;
      }
      if (e.key === 'ArrowUp' && items.length) {
        e.preventDefault();
        runtime.pageLinkPickerIndex = Math.max(runtime.pageLinkPickerIndex - 1, 0);
        runtime.renderPageLinkPickerSelection();
        return;
      }
      if (e.key === 'Enter' && items[runtime.pageLinkPickerIndex]) {
        e.preventDefault();
        items[runtime.pageLinkPickerIndex].click();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        runtime.hideFloatingMenus();
        return;
      }
    }
    if (e.target.matches?.('[data-format-link-input]')) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const q = e.target.value.trim(),
          external = runtime.normalizePastedLinkUrl(q);
        if (external) {
          runtime.applyInlineSelectionLink();
          return;
        }
        const key = q.toLocaleLowerCase(),
          page =
            runtime.state.pages.find(
              (p) => String(p.title || 'Untitled').toLocaleLowerCase() === key,
            ) ||
            runtime.state.pages.find((p) =>
              String(p.title || 'Untitled')
                .toLocaleLowerCase()
                .includes(key),
            );
        if (page) {
          runtime.applyInlineSelectionPageLink(page.id);
          return;
        }
        runtime.toast('Choose a page or enter a valid URL');
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (runtime.standaloneLinkEditorOpen) runtime.cancelStandaloneLinkEditor();
        else {
          runtime.closeTextFormatPopovers();
          runtime.restoreInlineSelection(runtime.inlineSelectionState);
        }
        return;
      }
    }
    if (e.target.matches?.('[data-format-link-title]')) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const target = runtime.selectionLinkTarget(runtime.inlineSelectionState);
        if (target?.pageId) runtime.applyInlineSelectionPageLink(target.pageId);
        else runtime.applyInlineSelectionLink();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (runtime.standaloneLinkEditorOpen) runtime.cancelStandaloneLinkEditor();
        else {
          runtime.closeTextFormatPopovers();
          runtime.restoreInlineSelection(runtime.inlineSelectionState);
        }
        return;
      }
    }
    if (runtime.tableCellSelection?.active) {
      if (e.key === 'Escape') {
        e.preventDefault();
        runtime.clearTableCellSelection();
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        runtime.clearSelectedTableCells();
        return;
      }
    }
    if (runtime.selectedTableBlockId && e.key === 'Delete') {
      e.preventDefault();
      runtime.deleteSelectedTable();
      return;
    }
    if (runtime.selectedTableBlockId && e.key === 'Escape') {
      e.preventDefault();
      runtime.clearSelectedTable();
      document.activeElement?.blur?.();
      return;
    }
    if (runtime.multiBlockSelection?.active) {
      if (e.key === 'Escape') {
        e.preventDefault();
        runtime.clearMultiBlockSelection();
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        runtime.deleteMultiBlockSelection();
        return;
      }
    }
    if (
      e.target.matches?.('[data-external-icon-dropzone]') &&
      (e.key === 'Enter' || e.key === ' ')
    ) {
      e.preventDefault();
      runtime.els.pageIconFileInput?.click();
      return;
    }
    if (runtime.els.vaultDialog && !runtime.els.vaultDialog.classList.contains('hidden')) {
      if (e.key === 'Enter' && e.target === runtime.els.vaultDialogInput) {
        e.preventDefault();
        runtime.submitVaultDialog();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        runtime.closeVaultDialog();
        return;
      }
    }
    if (runtime.els.newFolderDialog && !runtime.els.newFolderDialog.classList.contains('hidden')) {
      if (e.key === 'Enter' && e.target === runtime.els.newFolderNameInput) {
        e.preventDefault();
        void runtime.submitNewFolderDialog();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        runtime.closeNewFolderDialog();
        return;
      }
    }
    if (
      (e.target === runtime.els.pageTitle || e.target.matches?.('[data-dock-title]')) &&
      e.key === 'Enter'
    ) {
      e.preventDefault();
      const page = runtime.currentPage();
      if (!page) return;
      const block = runtime.newTextBlock();
      page.blocks.unshift(block);
      runtime.scheduleSave();
      runtime.renderBlocks(page);
      runtime.lifecycle.frame(() => runtime.focusBlock(block.id, 0));
      return;
    }
    if (mod && e.key === 'Tab') {
      e.preventDefault();
      runtime.cycleTab(e.shiftKey ? -1 : 1);
      return;
    }
    if (mod && e.key.toLowerCase() === 'w' && runtime.state.activeTabId) {
      e.preventDefault();
      runtime.closeTab(runtime.state.activeTabId);
      return;
    }
    const keyboardInlineSelection = runtime.captureInlineSelection();
    if (keyboardInlineSelection && mod) {
      runtime.inlineSelectionState = keyboardInlineSelection;
      const key = e.key.toLowerCase();
      if (!e.shiftKey && key === 'b') {
        e.preventDefault();
        runtime.applyInlineToolbarFormat('bold');
        return;
      }
      if (!e.shiftKey && key === 'i') {
        e.preventDefault();
        runtime.applyInlineToolbarFormat('italic');
        return;
      }
      if (!e.shiftKey && key === 'u') {
        e.preventDefault();
        runtime.applyInlineToolbarFormat('underline');
        return;
      }
      if (!e.shiftKey && key === 'e') {
        e.preventDefault();
        runtime.applyInlineToolbarFormat('code');
        return;
      }
      if (e.shiftKey && key === 's') {
        e.preventDefault();
        runtime.applyInlineToolbarFormat('strike');
        return;
      }
      if (!e.shiftKey && key === 'k') {
        e.preventDefault();
        runtime.showTextFormatToolbar(keyboardInlineSelection);
        runtime.openInlineLinkPopover();
        return;
      }
    }
    if (e.key === 'Escape') {
      runtime.hideFloatingMenus();
      runtime.hideTextFormatToolbar();
      document
        .querySelectorAll('.modal-backdrop, #settingsModal')
        .forEach((m) => m.classList.add('hidden'));
      return;
    }
    const keyboardGraphNode = e.target.closest?.('[data-graph-page]');
    if (keyboardGraphNode && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      runtime.openPage(keyboardGraphNode.dataset.graphPage, { newTab: true });
      return;
    }

    if (!runtime.els.commandPalette.classList.contains('hidden')) {
      const items = [...runtime.els.commandResults.querySelectorAll('[data-command]')];
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        runtime.commandIndex = Math.min(runtime.commandIndex + 1, items.length - 1);
        runtime.renderCommandSelection();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        runtime.commandIndex = Math.max(runtime.commandIndex - 1, 0);
        runtime.renderCommandSelection();
      }
      if (e.key === 'Enter' && items[runtime.commandIndex]) {
        e.preventDefault();
        items[runtime.commandIndex].click();
      }
      return;
    }
    if (runtime.els.emojiMenu && !runtime.els.emojiMenu.classList.contains('hidden')) {
      const items = [...runtime.els.emojiResults.querySelectorAll('[data-emoji-choice]')];
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        runtime.emojiIndex = Math.min(runtime.emojiIndex + 8, Math.max(0, items.length - 1));
        runtime.renderEmojiSelection();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        runtime.emojiIndex = Math.max(runtime.emojiIndex - 8, 0);
        runtime.renderEmojiSelection();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        runtime.emojiIndex = Math.min(runtime.emojiIndex + 1, Math.max(0, items.length - 1));
        runtime.renderEmojiSelection();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        runtime.emojiIndex = Math.max(runtime.emojiIndex - 1, 0);
        runtime.renderEmojiSelection();
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && items[runtime.emojiIndex]) {
        e.preventDefault();
        runtime.chooseEmoji(items[runtime.emojiIndex].dataset.emojiChoice);
        return;
      }
    }
    if (!runtime.els.slashMenu.classList.contains('hidden')) {
      const items = [...runtime.els.slashResults.querySelectorAll('[data-slash-type]')];
      if (items.length)
        runtime.slashIndex = Math.max(0, Math.min(runtime.slashIndex, items.length - 1));
      else runtime.slashIndex = 0;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        runtime.slashIndex = Math.min(runtime.slashIndex + 1, items.length - 1);
        runtime.renderSlashSelection();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        runtime.slashIndex = Math.max(runtime.slashIndex - 1, 0);
        runtime.renderSlashSelection();
        return;
      }
      if (e.key === 'Enter' && items[runtime.slashIndex]) {
        e.preventDefault();
        items[runtime.slashIndex].click();
        return;
      }
    }

    if (verticalNavigation.move(e)) return;

    if (e.target.matches('[data-table-cell]')) {
      const cell = e.target,
        row = cell.closest('.simple-table-block'),
        id = row?.dataset.blockId,
        b = runtime.findBlock(id);
      if (e.key === 'Tab' && b) {
        e.preventDefault();
        runtime.normalizeSimpleTableBlock(b);
        const cells = [...row.querySelectorAll('[data-table-cell]')],
          current = cells.indexOf(cell);
        if (!e.shiftKey && current === cells.length - 1) {
          b.tableRows.push(Array(b.tableRows[0].length).fill(''));
          runtime.scheduleSave();
          runtime.renderBlocks(runtime.currentPage());
          runtime.lifecycle.frame(() =>
            document
              .querySelector(
                `.simple-table-block[data-block-id="${id}"] [data-table-cell="${b.tableRows.length - 1}:0"]`,
              )
              ?.focus(),
          );
          return;
        }
        const next = cells[current + (e.shiftKey ? -1 : 1)];
        next?.focus();
        return;
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        runtime.addBlockAfter(id);
        return;
      }
      return;
    }

    if (e.target.matches('[data-code-editor]')) {
      const input = e.target,
        row = input.closest('.code-block'),
        id = row?.dataset.blockId;
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = input.selectionStart,
          end = input.selectionEnd,
          value = input.value;
        if (e.shiftKey) {
          const lineStart = value.lastIndexOf('\n', start - 1) + 1,
            removable = value.slice(lineStart, lineStart + 2).match(/^ {1,2}/)?.[0] || '';
          if (removable) {
            input.value = value.slice(0, lineStart) + value.slice(lineStart + removable.length);
            input.selectionStart = input.selectionEnd = Math.max(
              lineStart,
              start - removable.length,
            );
          }
        } else {
          input.value = value.slice(0, start) + '  ' + value.slice(end);
          input.selectionStart = input.selectionEnd = start + 2;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        runtime.addBlockAfter(id);
        return;
      }
      return;
    }

    if (e.target.matches('[data-image-url-input]')) {
      const row = e.target.closest('.block-row');
      if (e.key === 'Enter') {
        e.preventDefault();
        runtime.commitImageUrl(row.dataset.blockId, e.target);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        runtime.activeImageLinkBlockId = null;
        runtime.renderBlocks(runtime.currentPage());
      }
      return;
    }

    if (e.target.matches('[data-custom-icon-input]') && e.key === 'Enter') {
      e.preventDefault();
      const value = e.target.value.trim();
      if (value) runtime.setPageIcon(value.slice(0, 12));
      return;
    }
    if (e.target.matches('[data-external-icon-url]') && e.key === 'Enter') {
      e.preventDefault();
      runtime.applyExternalIconUrl(e.target.value);
      return;
    }
    if (e.target.matches('[data-comment-input]') && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runtime.addPageComment();
      return;
    }

    const togglePrefix = e.target.closest?.('.toggle-prefix');
    if (togglePrefix && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      const row = togglePrefix.closest('.block-row'),
        b = runtime.findBlock(row?.dataset.blockId);
      if (b?.type === 'toggle') {
        b.open = !b.open;
        runtime.scheduleSave();
        runtime.renderCurrentBlocksKeepFocus();
      }
      return;
    }

    const content = e.target.closest('.block-content');
    if (!content) return;
    const row = content.closest('.block-row'),
      id = row.dataset.blockId,
      location = runtime.findBlockLocation(id),
      b = location?.block,
      page = runtime.currentPage();
    if (!location || !b) return;
    const blocks = location.blocks,
      index = location.index;
    if (
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      ((e.key === ' ' && runtime.applyMarkdownBlockShortcut(content, 'space')) ||
        (e.key === 'Enter' && !e.shiftKey && runtime.applyMarkdownBlockShortcut(content, 'enter')))
    ) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter' && e.shiftKey && runtime.isListBlock(b)) {
      e.preventDefault();
      const selection = runtime.selectionOffsetsWithin(content);
      const caret = runtime.replaceBlockRangeWithInlineLink(
        b,
        selection.start,
        selection.end,
        '\n',
        null,
      );
      runtime.hideFloatingMenus();
      runtime.scheduleSave();
      runtime.renderBlocks(page);
      runtime.focusBlock(b.id, caret);
      return;
    }
    if (e.key === 'Tab' && runtime.isListBlock(b)) {
      e.preventDefault();
      const caret = runtime.getCaretOffset(content);
      const previous = blocks[index - 1];
      if (
        !e.shiftKey &&
        !(b.text || '').trim() &&
        previous?.type === b.type &&
        runtime.listIndentLevel(previous) === runtime.listIndentLevel(b) &&
        runtime.listSubtreeEnd(blocks, index) === index + 1
      ) {
        const end = (previous.text || '').length;
        runtime.replaceBlockRangeWithInlineLink(previous, end, end, '\n', null);
        blocks.splice(index, 1);
        runtime.hideFloatingMenus();
        runtime.scheduleSave();
        runtime.renderBlocks(page);
        runtime.focusBlock(previous.id, end + 1);
        return;
      }
      const lineStart = caret > 0 ? (b.text || '').lastIndexOf('\n', caret - 1) + 1 : 0;
      if (lineStart > 0) {
        const leading = (b.text || '').slice(lineStart).match(/^(?:\t| {1,4})/)?.[0] || '';
        const removed = e.shiftKey ? leading.length : 0;
        const inserted = e.shiftKey ? '' : '\t';
        runtime.replaceBlockRangeWithInlineLink(b, lineStart, lineStart + removed, inserted, null);
        runtime.hideFloatingMenus();
        runtime.scheduleSave();
        runtime.renderBlocks(page);
        runtime.focusBlock(b.id, Math.max(lineStart, caret + inserted.length - removed));
        return;
      }
      if (runtime.changeListIndent(blocks, index, e.shiftKey ? -1 : 1)) {
        runtime.hideFloatingMenus();
        runtime.scheduleSave();
        runtime.renderBlocks(page);
        runtime.focusBlock(b.id, caret);
      }
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (b.type === 'toggle' && b.open) {
        runtime.addToggleChild(b.id);
        return;
      }
      if (
        (b.type === 'bullet' || b.type === 'number' || b.type === 'todo' || b.type === 'toggle') &&
        !(b.text || '').trim()
      ) {
        b.type = 'text';
        b.text = '';
        delete b.checked;
        delete b.open;
        delete b.indent;
        delete b.inlineLinks;
        runtime.hideFloatingMenus();
        runtime.scheduleSave();
        runtime.renderBlocks(page);
        runtime.focusBlock(b.id, 0);
        return;
      }
      const sel = window.getSelection();
      const caret = runtime.getCaretOffset(content);
      const text = b.text || '',
        linkSplit = runtime.splitInlineLinksAt(b, caret),
        formatSplit = runtime.splitInlineFormatsAt(b, caret);
      const left = text.slice(0, caret),
        right = text.slice(caret);
      b.text = left;
      b.inlineLinks = runtime.normalizeInlineLinkRanges(linkSplit.left, left.length);
      if (!b.inlineLinks.length) delete b.inlineLinks;
      b.inlineFormats = runtime.normalizeInlineFormatRanges(formatSplit.left, left.length);
      if (!b.inlineFormats.length) delete b.inlineFormats;
      const nextType = ['bullet', 'number', 'todo', 'toggle'].includes(b.type) ? b.type : 'text';
      const nb = { id: runtime.uid('b'), type: nextType, text: right };
      if (runtime.isListBlock(nb)) runtime.setListIndentLevel(nb, runtime.listIndentLevel(b));
      const nextLinks = runtime.normalizeInlineLinkRanges(linkSplit.right, right.length);
      if (nextLinks.length) nb.inlineLinks = nextLinks;
      const nextFormats = runtime.normalizeInlineFormatRanges(formatSplit.right, right.length);
      if (nextFormats.length) nb.inlineFormats = nextFormats;
      if (nextType === 'todo') nb.checked = false;
      blocks.splice(index + 1, 0, nb);
      runtime.scheduleSave();
      runtime.renderBlocks(page);
      runtime.focusBlock(nb.id, 0);
      return;
    }
    if (e.key === 'Backspace' && (b.text || '') === '' && index === 0 && blocks === page.blocks) {
      e.preventDefault();
      blocks.splice(index, 1);
      runtime.scheduleSave();
      runtime.renderBlocks(page);
      runtime.lifecycle.frame(() => {
        runtime.els.pageTitle.focus();
        runtime.setCaretOffset(runtime.els.pageTitle, (page.title || '').length);
      });
      return;
    }
    if (
      e.key === 'Backspace' &&
      (b.text || '') === '' &&
      index === 0 &&
      location.parentBlock?.type === 'toggle' &&
      !(b.type === 'toggle' && b.children?.length)
    ) {
      e.preventDefault();
      blocks.splice(index, 1);
      runtime.scheduleSave();
      runtime.renderBlocks(page);
      runtime.focusBlock(location.parentBlock.id, (location.parentBlock.text || '').length);
      return;
    }
    if (e.key === 'Backspace' && (b.text || '') === '' && index > 0) {
      e.preventDefault();
      const prev = blocks[index - 1];
      blocks.splice(index, 1);
      runtime.scheduleSave();
      runtime.renderBlocks(page);
      if (runtime.isTextLikeBlock(prev)) runtime.focusBlock(prev.id, (prev.text || '').length);
      return;
    }
    if (e.key === 'Backspace' && (b.text || '') === '' && runtime.isListBlock(b)) {
      e.preventDefault();
      if (runtime.listIndentLevel(b) > 0) runtime.changeListIndent(blocks, index, -1);
      else {
        b.type = 'text';
        delete b.indent;
      }
      runtime.scheduleSave();
      runtime.renderBlocks(page);
      runtime.focusBlock(b.id, 0);
      return;
    }
    if (e.key === 'Backspace' && runtime.getCaretOffset(content) === 0 && index > 0) {
      const prev = blocks[index - 1];
      if (runtime.isTextLikeBlock(prev)) {
        e.preventDefault();
        const pos = (prev.text || '').length,
          mergedLinks = [
            ...runtime.inlineLinksForBlock(prev),
            ...runtime
              .inlineLinksForBlock(b)
              .map((link) => ({ start: link.start + pos, end: link.end + pos, url: link.url })),
          ],
          mergedFormats = [
            ...runtime.inlineFormatsForBlock(prev),
            ...runtime
              .inlineFormatsForBlock(b)
              .map((format) => ({ ...format, start: format.start + pos, end: format.end + pos })),
          ];
        prev.text = (prev.text || '') + (b.text || '');
        prev.inlineLinks = runtime.normalizeInlineLinkRanges(mergedLinks, prev.text.length);
        if (!prev.inlineLinks.length) delete prev.inlineLinks;
        prev.inlineFormats = runtime.normalizeInlineFormatRanges(mergedFormats, prev.text.length);
        if (!prev.inlineFormats.length) delete prev.inlineFormats;
        blocks.splice(index, 1);
        runtime.scheduleSave();
        runtime.renderBlocks(page);
        runtime.focusBlock(prev.id, pos);
      }
    }
    if (mod && e.shiftKey) {
      const map = { '1': 'h1', '2': 'h2', '3': 'h3', '7': 'number', '8': 'bullet', '9': 'todo' };
      if (map[e.key]) {
        e.preventDefault();
        const wasList = runtime.isListBlock(b);
        b.type = map[e.key];
        if (!runtime.isListBlock(b) || !wasList) delete b.indent;
        runtime.scheduleSave();
        runtime.renderBlocks(page);
        runtime.focusBlock(b.id, (b.text || '').length);
      }
    }
  }

  function onDragStart(e) {
    const tableHandle = e.target.closest?.('.table-axis-handle[draggable="true"]');
    if (tableHandle) {
      const tableBlock = tableHandle.closest('.simple-table-block[data-block-id]');
      const blockId = tableBlock?.dataset.blockId;
      const rowIndex = tableHandle.dataset.tableRowMenu;
      const colIndex = tableHandle.dataset.tableColMenu;
      const axis = rowIndex !== undefined ? 'row' : colIndex !== undefined ? 'col' : null;
      const index = Number(axis === 'row' ? rowIndex : colIndex);
      if (blockId && axis && Number.isInteger(index)) {
        runtime.tableAxisDrag = { blockId, axis, index, targetIndex: index, after: false };
        runtime.clearTableCellSelection();
        runtime.clearSelectedTable();
        if (axis === 'row')
          tableBlock
            .querySelector(`tr[data-table-row="${index}"]`)
            ?.classList.add('table-row-dragging');
        else runtime.markTableColumnDragState(tableBlock, index, 'table-col-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', `table-${axis}:${blockId}:${index}`);
        }
        return;
      }
    }
    const folderRow = e.target.closest('.folder-tree-row[data-folder-path][draggable="true"]');
    if (folderRow) {
      if (runtime.workspaceAccess !== 'writable') {
        e.preventDefault();
        return;
      }
      runtime.dragFolderPath = folderRow.dataset.folderPath;
      if (runtime.els.pageTree.contains(folderRow)) runtime.selectFilesTreeRow(folderRow);
      folderRow.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = runtime.folderNoteInFolder(runtime.dragFolderPath)
          ? 'all'
          : 'copyMove';
        e.dataTransfer.setData('text/plain', `folder:${runtime.dragFolderPath}`);
      }
      return;
    }
    const pageRow = e.target.closest('.page-tree-row[data-page-id]');
    if (pageRow) {
      if (runtime.workspaceAccess !== 'writable') {
        e.preventDefault();
        return;
      }
      runtime.dragPageId = pageRow.dataset.pageId;
      runtime.dragPageIds = [runtime.dragPageId];
      if (runtime.els.pageTree.contains(pageRow)) {
        runtime.syncFilesTreeSelection();
        const key = runtime.fileTreeRowKey(pageRow);
        if (!runtime.filesTreeSelection.has(key)) runtime.selectFilesTreeRow(pageRow);
        const selected = runtime.selectedFileTreeItems();
        if (selected.length > 1 && selected.every((item) => item.type === 'page'))
          runtime.dragPageIds = selected.map((item) => item.value.id);
        else if (selected.length > 1) runtime.resetFilesTreeSelection(key);
      }
      const draggedIds = new Set(runtime.dragPageIds);
      runtime.els.pageTree.querySelectorAll('.page-tree-row[data-page-id]').forEach((row) => {
        if (draggedIds.has(row.dataset.pageId)) row.classList.add('dragging');
      });
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'all';
        e.dataTransfer.setData(
          'text/plain',
          runtime.dragPageIds.length > 1
            ? `pages:${runtime.dragPageIds.join(':')}`
            : `page:${runtime.dragPageId}`,
        );
      }
      return;
    }
    const tab = e.target.closest('.editor-tab[data-tab-id], .dock-tab[data-tab-id]');
    if (tab && !e.target.closest('.tab-close')) {
      runtime.dragTabId = tab.dataset.tabId;
      tab.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `tab:${runtime.dragTabId}`);
      return;
    }
    const handle = e.target.closest('[data-block-action="drag"]');
    if (!handle) return;
    const row = handle.closest('.block-row');
    runtime.dragBlockId = row.dataset.blockId;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', runtime.dragBlockId);
  }

  function pageLinkDropEditorAt(target) {
    const dockPage = target.closest?.('.dock-page[data-page-id]');
    if (dockPage)
      return {
        page: runtime.pageById(dockPage.dataset.pageId),
        editor: dockPage.querySelector('[data-dock-blocks]'),
      };
    if (target.closest?.('#editorView:not(.hidden)'))
      return { page: runtime.currentPage(), editor: runtime.els.blockEditor };
    return null;
  }

  function draggedPageIdsFromTransfer(dataTransfer) {
    const payload = dataTransfer?.getData('text/plain') || '';
    if (payload.startsWith('pages:'))
      return payload.slice('pages:'.length).split(':').filter(Boolean);
    if (payload.startsWith('page:')) return [payload.slice('page:'.length)].filter(Boolean);
    return [];
  }

  function previewPageLinkDrop(e, sourcePageIds) {
    const target = pageLinkDropEditorAt(e.target);
    const hasLinkableSource = sourcePageIds.some((pageId) => {
      const page = runtime.pageById(pageId);
      return page && page.id !== target?.page?.id;
    });
    if (!target?.page || !target.editor || !hasLinkableSource) return false;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'link';
    const row = e.target.closest?.('.block-row[data-block-id]');
    if (row && target.editor.contains(row)) {
      const after = e.clientY >= row.getBoundingClientRect().top + row.offsetHeight / 2;
      runtime.pageDrop = {
        kind: 'link',
        targetPageId: target.page.id,
        blockId: row.dataset.blockId,
        after,
      };
      row.classList.add(after ? 'page-link-drop-after' : 'page-link-drop-before');
    } else {
      runtime.pageDrop = { kind: 'link', targetPageId: target.page.id };
      target.editor.classList.add('page-link-drop-target');
    }
    return true;
  }

  function insertPageLinksByDrop(e, sourcePageIds) {
    const drop = runtime.pageDrop?.kind === 'link' ? { ...runtime.pageDrop } : {};
    const editorTarget = pageLinkDropEditorAt(e.target);
    const target = drop.targetPageId ? runtime.pageById(drop.targetPageId) : editorTarget?.page;
    if (!target || !sourcePageIds.length) return false;
    e.preventDefault();
    if (!drop.blockId) {
      const row = e.target.closest?.('.block-row[data-block-id]');
      if (row && editorTarget?.editor?.contains(row)) {
        drop.blockId = row.dataset.blockId;
        drop.after = e.clientY >= row.getBoundingClientRect().top + row.offsetHeight / 2;
      }
    }
    const linkBlocks = sourcePageIds
      .map((pageId) => runtime.pageById(pageId))
      .filter(
        (source): source is NonNullable<typeof source> =>
          Boolean(source) && source.id !== target.id,
      )
      .map((source) => ({ id: runtime.uid('b'), type: 'page-link', pageId: source.id }));
    if (linkBlocks.length) {
      const location = drop.blockId ? runtime.findBlockLocation(drop.blockId, target.blocks) : null;
      const blocks = location?.blocks || target.blocks;
      if (blocks.length === 1 && blocks[0].type === 'text' && !(blocks[0].text || '').trim())
        blocks.splice(0, 1, ...linkBlocks);
      else if (location) blocks.splice(location.index + (drop.after ? 1 : 0), 0, ...linkBlocks);
      else blocks.push(...linkBlocks);
      runtime.scheduleSave();
      if (runtime.currentPage()?.id === target.id) runtime.renderBlocks(target);
      else runtime.refreshOtherDockPages(target.id);
    }
    return true;
  }

  function onDragOver(e) {
    if (runtime.tableAxisDrag) {
      const tableBlock = e.target.closest?.(
        `.simple-table-block[data-block-id="${runtime.tableAxisDrag.blockId}"]`,
      );
      if (!tableBlock) return;
      const target = runtime.tableAxisDropTarget(e, tableBlock, runtime.tableAxisDrag.axis);
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      runtime.tableAxisDrag.targetIndex = target.index;
      runtime.tableAxisDrag.after = target.after;
      runtime.renderTableAxisDropIndicator(
        tableBlock,
        runtime.tableAxisDrag.axis,
        target.index,
        target.after,
      );
      return;
    }
    if (runtime.dragFolderPath) {
      runtime.clearPageDropIndicators();
      const folderPage = runtime.folderNoteInFolder(runtime.dragFolderPath);
      if (folderPage && previewPageLinkDrop(e, [folderPage.id])) return;
      const folder = e.target.closest?.('.folder-tree-row[data-folder-path]');
      const pageRow = e.target.closest?.('.page-tree-row[data-page-id]');
      let targetPath = null,
        targetRow = folder;
      if (folder) {
        targetPath = folder.dataset.folderPath;
        if (!runtime.canDropFolder(runtime.dragFolderPath, targetPath)) return;
      } else if (pageRow) {
        return;
      } else {
        const childList = e.target.closest?.('.page-children');
        if (childList) {
          const parentRow = childList.previousElementSibling;
          if (!parentRow?.matches?.('.folder-tree-row[data-folder-path]')) return;
          targetRow = parentRow;
          targetPath = parentRow.dataset.folderPath;
          if (!runtime.canDropFolder(runtime.dragFolderPath, targetPath)) return;
        } else if (e.target.closest?.('.sidebar-scroll')) {
          targetPath = '';
        } else {
          return;
        }
      }
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? 'copy' : 'move';
      runtime.folderDrop = { targetPath };
      if (targetRow) targetRow.classList.add('page-drop-folder');
      else e.target.closest('.sidebar-scroll')?.classList.add('page-drop-root');
      return;
    }
    if (runtime.dragPageId) {
      runtime.clearPageDropIndicators();
      const draggedPageIds = runtime.dragPageIds?.length
        ? runtime.dragPageIds
        : [runtime.dragPageId];
      const multiPageDrag = draggedPageIds.length > 1;
      if (previewPageLinkDrop(e, draggedPageIds)) return;
      const folder = e.target.closest?.('.folder-tree-row[data-folder-path]');
      if (folder) {
        e.preventDefault();
        if (e.dataTransfer)
          e.dataTransfer.dropEffect = !multiPageDrag && (e.ctrlKey || e.metaKey) ? 'copy' : 'move';
        runtime.pageDrop = { folderPath: folder.dataset.folderPath };
        folder.classList.add('page-drop-folder');
        return;
      }
      const row = e.target.closest?.('.page-tree-row[data-page-id]');
      if (row) {
        if (multiPageDrag) return;
        const targetId = row.dataset.pageId;
        if (!runtime.canDropPage(runtime.dragPageId, targetId)) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? 'copy' : 'move';
        const mode = runtime.pageDropMode(e, row);
        runtime.pageDrop = { targetId, mode };
        row.classList.add(`page-drop-${mode}`);
        return;
      }
      const sidebar = e.target.closest?.('.sidebar-scroll');
      if (sidebar) {
        e.preventDefault();
        if (e.dataTransfer)
          e.dataTransfer.dropEffect = !multiPageDrag && (e.ctrlKey || e.metaKey) ? 'copy' : 'move';
        runtime.pageDrop = { targetId: null, mode: 'root' };
        sidebar.classList.add('page-drop-root');
      }
      return;
    }
    const iconDrop =
      !runtime.dragTabId && !runtime.dragBlockId
        ? e.target.closest?.('[data-external-icon-dropzone]')
        : null;
    if (iconDrop && runtime.externalIconPaneActive()) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      iconDrop.classList.add('drag-over');
      return;
    }
    runtime.clearExternalIconDropState();
    if (runtime.dragTabId) {
      const pane =
        e.target.closest?.('.dock-pane[data-editor-group]') ||
        e.target.closest?.('#editorView:not(.hidden)');
      if (pane) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        const target = runtime.dockTargetAt(e, pane);
        runtime.clearDockIndicators();
        runtime.dockDrop = {
          ...target,
          groupId:
            pane.dataset.editorGroup || runtime.editorGroups(runtime.state.editorLayout)[0].id,
        };
        pane.classList.add(`dock-drop-${target.edge || 'center'}`);
        return;
      }
      runtime.clearDockIndicators();
      const strip = e.target.closest('.tabs-scroll');
      if (!strip) return;
      e.preventDefault();
      document
        .querySelectorAll('.tab-drop-before,.tab-drop-after')
        .forEach((x) => x.classList.remove('tab-drop-before', 'tab-drop-after'));
      const tab = e.target.closest('.editor-tab[data-tab-id]');
      if (tab && tab.dataset.tabId !== runtime.dragTabId) {
        const r = tab.getBoundingClientRect();
        tab.classList.add(e.clientX < r.left + r.width / 2 ? 'tab-drop-before' : 'tab-drop-after');
      }
      return;
    }
    if (!runtime.dragBlockId) return;
    document
      .querySelectorAll('.drop-before,.drop-after')
      .forEach((x) => x.classList.remove('drop-before', 'drop-after'));
    const row = e.target.closest('.block-row');
    if (row && row.dataset.blockId !== runtime.dragBlockId) {
      e.preventDefault();
      const r = row.getBoundingClientRect();
      row.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
      return;
    }
  }

  function onDrop(e) {
    if (runtime.tableAxisDrag) {
      const drag = { ...runtime.tableAxisDrag };
      const tableBlock = e.target.closest?.(`.simple-table-block[data-block-id="${drag.blockId}"]`);
      if (!tableBlock) return runtime.clearDragState();
      const target = runtime.tableAxisDropTarget(e, tableBlock, drag.axis) || {
        index: drag.targetIndex,
        after: drag.after,
      };
      e.preventDefault();
      e.stopPropagation();
      const block = runtime.findBlock(drag.blockId);
      if (block?.type === 'table') {
        const finalIndex = runtime.reorderSimpleTableAxis(
          block,
          drag.axis,
          drag.index,
          target.index,
          target.after,
        );
        if (finalIndex !== null) {
          runtime.scheduleSave();
          runtime.renderBlocks(runtime.currentPage());
          runtime.lifecycle.frame(() => {
            const selector =
              drag.axis === 'row'
                ? `.simple-table-block[data-block-id="${drag.blockId}"] [data-table-row-menu="${finalIndex}"]`
                : `.simple-table-block[data-block-id="${drag.blockId}"] [data-table-col-menu="${finalIndex}"]`;
            document.querySelector(selector)?.focus();
          });
        }
      }
      runtime.clearDragState();
      return;
    }
    if (runtime.dragFolderPath) {
      e.preventDefault();
      if (runtime.workspaceAccess !== 'writable') return runtime.clearDragState();
      const folderPage = runtime.folderNoteInFolder(runtime.dragFolderPath);
      if (folderPage && insertPageLinksByDrop(e, [folderPage.id])) {
        runtime.clearDragState();
        return;
      }
      if (runtime.folderDrop)
        void runtime.moveFolderByDrop(runtime.dragFolderPath, runtime.folderDrop.targetPath, {
          copy: e.ctrlKey || e.metaKey,
        });
      runtime.clearDragState();
      return;
    }
    if (!runtime.dragPageId) {
      const draggedPageIds = runtime.dragPageIds?.length
        ? runtime.dragPageIds
        : draggedPageIdsFromTransfer(e.dataTransfer);
      if (draggedPageIds.length) {
        runtime.dragPageIds = draggedPageIds;
        runtime.dragPageId = draggedPageIds[0];
      }
    }
    if (runtime.dragPageId) {
      e.preventDefault();
      if (runtime.workspaceAccess !== 'writable') return runtime.clearDragState();
      const transferPageIds = runtime.dragPageIds?.length
        ? runtime.dragPageIds
        : draggedPageIdsFromTransfer(e.dataTransfer);
      if (insertPageLinksByDrop(e, transferPageIds)) {
        runtime.clearDragState();
        return;
      }
      if (runtime.dragPageIds?.length > 1) {
        if (runtime.pageDrop) {
          const folderPath = Object.prototype.hasOwnProperty.call(runtime.pageDrop, 'folderPath')
            ? runtime.pageDrop.folderPath
            : runtime.pageDrop.mode === 'root' && !runtime.pageDrop.targetId
              ? ''
              : null;
          if (folderPath !== null) runtime.movePagesToFolder(runtime.dragPageIds, folderPath);
        }
        runtime.clearDragState();
        return;
      }
      let sourceId = runtime.dragPageId,
        copy = null;
      if (runtime.pageDrop && (e.ctrlKey || e.metaKey)) {
        const source = runtime.pageById(sourceId);
        if (!source) return runtime.clearDragState();
        copy = runtime.clone(source);
        copy.id = runtime.uid('page');
        delete copy.filePath;
        copy.blocks = copy.blocks.map(runtime.cloneBlockWithNewIds);
        copy.favorite = false;
        copy.folderNote = false;
        runtime.state.pages.push(copy);
        sourceId = copy.id;
      }
      const moved =
        runtime.pageDrop &&
        (Object.prototype.hasOwnProperty.call(runtime.pageDrop, 'folderPath')
          ? runtime.movePageToFolder(sourceId, runtime.pageDrop.folderPath)
          : runtime.movePageByDrop(
              sourceId,
              runtime.pageDrop.targetId || null,
              runtime.pageDrop.mode || 'root',
            ));
      if (copy && !moved)
        runtime.state.pages = runtime.state.pages.filter((page) => page.id !== copy.id);
      runtime.clearDragState();
      return;
    }
    const iconDrop =
      !runtime.dragTabId && !runtime.dragBlockId
        ? e.target.closest?.('[data-external-icon-dropzone]')
        : null;
    if (iconDrop && runtime.externalIconPaneActive()) {
      e.preventDefault();
      e.stopPropagation();
      runtime.clearExternalIconDropState();
      if (!runtime.applyExternalIconTransfer(e.dataTransfer))
        runtime.toast('Drop an image file or image URL');
      return;
    }
    runtime.clearExternalIconDropState();
    if (runtime.dragTabId) {
      const pane =
        e.target.closest?.('.dock-pane[data-editor-group]') ||
        e.target.closest?.('#editorView:not(.hidden)');
      if (pane) {
        e.preventDefault();
        const target = runtime.dockTargetAt(e, pane),
          groupId =
            pane.dataset.editorGroup || runtime.editorGroups(runtime.state.editorLayout)[0].id;
        if (target.edge) runtime.splitTab(runtime.dragTabId, groupId, target.edge);
        else runtime.moveTabToGroup(runtime.dragTabId, groupId, target.beforeTabId);
        runtime.clearDragState();
        return;
      }
      const strip = e.target.closest('.tabs-scroll');
      if (!strip) return runtime.clearDragState();
      e.preventDefault();
      const tabs = runtime.state.openTabs || [],
        from = tabs.findIndex((t) => t.id === runtime.dragTabId);
      if (from < 0) return runtime.clearDragState();
      const target = e.target.closest('.editor-tab[data-tab-id]');
      let to = tabs.length;
      if (target) {
        const targetIndex = tabs.findIndex((t) => t.id === target.dataset.tabId);
        const r = target.getBoundingClientRect();
        to = targetIndex + (e.clientX >= r.left + r.width / 2 ? 1 : 0);
      }
      const [moved] = tabs.splice(from, 1);
      if (from < to) to--;
      tabs.splice(Math.max(0, Math.min(to, tabs.length)), 0, moved);
      runtime.scheduleSave();
      runtime.renderAll();
      runtime.clearDragState();
      return;
    }
    if (!runtime.dragBlockId) return;
    e.preventDefault();

    const page = runtime.currentPage();
    if (!page) return runtime.clearDragState();
    const movedId = runtime.dragBlockId;
    const fromLoc = runtime.findBlockLocation(movedId);
    if (!fromLoc) return runtime.clearDragState();

    const targetRow = e.target.closest('.block-row');
    if (targetRow?.dataset.blockId === movedId) return runtime.clearDragState();

    const targetId = targetRow?.dataset.blockId || null;
    if (!targetId) return runtime.clearDragState();
    if (targetId && runtime.blockContainsId(fromLoc.block, targetId))
      return runtime.clearDragState();
    const insertAfter =
      !!targetRow &&
      e.clientY >=
        targetRow.getBoundingClientRect().top + targetRow.getBoundingClientRect().height / 2;
    const emptiedLists = new Set();
    const holder = { block: null };
    runtime.removeBlockOccurrences(movedId, page.blocks, holder, emptiedLists);
    const moved = holder.block || fromLoc.block;
    if (!moved) return runtime.clearDragState();

    const toLoc = runtime.findBlockLocation(targetId);
    if (!toLoc) {
      // Restore the block if the target disappeared.
      fromLoc.blocks.splice(Math.min(fromLoc.index, fromLoc.blocks.length), 0, moved);
      runtime.clearDragState();
      return;
    }
    const destination = toLoc.blocks;
    let to = toLoc.index + (insertAfter ? 1 : 0);

    // removeBlockOccurrences() above already detached every stale copy of this id,
    // so the block is inserted exactly once at its destination.
    to = Math.max(0, Math.min(to, destination.length));
    destination.splice(to, 0, moved);
    for (const list of emptiedLists) {
      if (list !== destination && !list.length) list.push(runtime.newTextBlock());
    }
    if (!page.blocks.length) page.blocks.push(runtime.newTextBlock());

    runtime.scheduleSave();
    runtime.renderBlocks(page);
    runtime.clearDragState();
  }

  function clearTableAxisDropIndicators() {
    document
      .querySelectorAll(
        '.table-row-dragging,.table-row-drop-before,.table-row-drop-after,.table-col-dragging,.table-col-drop-before,.table-col-drop-after',
      )
      .forEach((el) =>
        el.classList.remove(
          'table-row-dragging',
          'table-row-drop-before',
          'table-row-drop-after',
          'table-col-dragging',
          'table-col-drop-before',
          'table-col-drop-after',
        ),
      );
  }

  function markTableColumnDragState(tableBlock, index, className) {
    tableBlock
      ?.querySelectorAll?.(`[data-table-column="${index}"]`)
      .forEach((cell) => cell.classList.add(className));
  }

  function renderTableAxisDropIndicator(tableBlock, axis, index, after) {
    runtime.clearTableAxisDropIndicators();
    if (!runtime.tableAxisDrag) return;
    if (axis === 'row') {
      tableBlock
        .querySelector(`tr[data-table-row="${index}"]`)
        ?.classList.add(after ? 'table-row-drop-after' : 'table-row-drop-before');
      tableBlock
        .querySelector(`tr[data-table-row="${runtime.tableAxisDrag.index}"]`)
        ?.classList.add('table-row-dragging');
    } else {
      runtime.markTableColumnDragState(
        tableBlock,
        index,
        after ? 'table-col-drop-after' : 'table-col-drop-before',
      );
      runtime.markTableColumnDragState(
        tableBlock,
        runtime.tableAxisDrag.index,
        'table-col-dragging',
      );
    }
  }

  function tableAxisDropTarget(e, tableBlock, axis) {
    if (axis === 'row') {
      const rows = [...tableBlock.querySelectorAll('tr[data-table-row]')];
      if (!rows.length) return null;
      let best = null,
        bestDistance = Infinity;
      for (const row of rows) {
        const rect = row.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const distance = Math.abs(e.clientY - center);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { index: Number(row.dataset.tableRow), rect };
        }
      }
      if (!best || !Number.isInteger(best.index)) return null;
      return { index: best.index, after: e.clientY >= best.rect.top + best.rect.height / 2 };
    }
    const firstRow = tableBlock.querySelector('tr[data-table-row="0"]');
    const cells = firstRow ? [...firstRow.querySelectorAll('[data-table-column]')] : [];
    if (!cells.length) return null;
    let best = null,
      bestDistance = Infinity;
    for (const cell of cells) {
      const rect = cell.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const distance = Math.abs(e.clientX - center);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { index: Number(cell.dataset.tableColumn), rect };
      }
    }
    if (!best || !Number.isInteger(best.index)) return null;
    return { index: best.index, after: e.clientX >= best.rect.left + best.rect.width / 2 };
  }

  function dockTargetAt(e, pane) {
    const tab = e.target.closest?.('.dock-tab[data-tab-id]');
    if (e.target.closest?.('.dock-tabs') && pane.contains(e.target)) {
      const rect = tab?.getBoundingClientRect();
      return {
        edge: null,
        beforeTabId:
          tab && e.clientX < rect.left + rect.width / 2
            ? tab.dataset.tabId
            : tab?.nextElementSibling?.dataset.tabId || null,
      };
    }
    const rect = pane.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width,
      y = (e.clientY - rect.top) / rect.height;
    const distances = [
      ['left', x],
      ['right', 1 - x],
      ['top', y],
      ['bottom', 1 - y],
    ].sort((a, b) => a[1] - b[1]);
    const draggedTab = runtime.state.openTabs.find((tab) => tab.id === runtime.dragTabId);
    return {
      edge: draggedTab?.kind === 'page' && distances[0][1] < 0.23 ? distances[0][0] : null,
      beforeTabId: null,
    };
  }

  function clearDockIndicators() {
    document
      .querySelectorAll(
        '.dock-drop-left,.dock-drop-right,.dock-drop-top,.dock-drop-bottom,.dock-drop-center',
      )
      .forEach((node) =>
        node.classList.remove(
          'dock-drop-left',
          'dock-drop-right',
          'dock-drop-top',
          'dock-drop-bottom',
          'dock-drop-center',
        ),
      );
    runtime.dockDrop = null;
  }

  function clearDragState() {
    runtime.dragBlockId = null;
    runtime.dragTabId = null;
    runtime.dragPageId = null;
    runtime.dragPageIds = null;
    runtime.dragFolderPath = null;
    runtime.tableAxisDrag = null;
    runtime.clearPageDropIndicators();
    runtime.clearDockIndicators();
    runtime.clearTableAxisDropIndicators();
    document
      .querySelectorAll('.dragging,.drop-before,.drop-after,.tab-drop-before,.tab-drop-after')
      .forEach((x) =>
        x.classList.remove(
          'dragging',
          'drop-before',
          'drop-after',
          'tab-drop-before',
          'tab-drop-after',
        ),
      );
  }

  function createPageForBlock(currentPageId) {
    const currentPage = runtime.pageById(currentPageId);
    let parentId = currentPage?.parentId || null,
      folderId = currentPage?.folderId || null;
    const folderNote = currentPage ? runtime.representedFolderForPage(currentPage) : null;
    if (folderNote) {
      parentId = null;
      folderId = folderNote.id;
    }
    const title = runtime.uniqueNoteTitle('Untitled', parentId, folderId);
    const page = {
      id: runtime.uid('page'),
      parentId,
      folderId,
      title,
      favorite: false,
      expanded: true,
      folderNote: false,
      blocks: [runtime.newTextBlock()],
    };
    runtime.state.pages.push(page);
    const parent = runtime.pageById(parentId);
    if (parent) parent.expanded = true;
    return page;
  }

  function uniqueNoteTitle(baseTitle, parentId, folderId) {
    const directory = parentId
      ? runtime.implicitPageFolderPath(runtime.pageById(parentId))
      : runtime.folderPathForId(folderId);
    return runtime.uniqueDirectoryName(baseTitle, directory, { checkFolders: false }, 3, 'suffix');
  }

  function directoryNameConflict(
    title,
    directory,
    {
      pageId = null,
      folderId = null,
      ownedFolderPath = null,
      reservedNames = [],
      excludedPageIds = [],
      checkPages = true,
      checkFolders = true,
    } = {},
  ) {
    const key = String(title || '').toLocaleLowerCase(),
      path = runtime.normalizeFolderPath(directory).toLocaleLowerCase();
    const excludedIds = new Set(excludedPageIds);
    if (checkPages && reservedNames.some((name) => String(name).toLocaleLowerCase() === key))
      return { kind: 'note', name: title };
    const note =
      checkPages &&
      runtime.state.pages.find(
        (page) =>
          page.id !== pageId &&
          !excludedIds.has(page.id) &&
          runtime.pageFolderPath(page).toLocaleLowerCase() === path &&
          String(page.title || 'Untitled').toLocaleLowerCase() === key,
      );
    if (note) return { kind: 'note', name: note.title };
    const folder =
      checkFolders &&
      runtime.state.folders.find(
        (folder) =>
          folder.id !== folderId &&
          (!ownedFolderPath ||
            runtime.normalizeFolderPath(folder.path).toLocaleLowerCase() !==
              runtime.normalizeFolderPath(ownedFolderPath).toLocaleLowerCase()) &&
          runtime.folderParentPath(folder.path).toLocaleLowerCase() === path &&
          folder.name.toLocaleLowerCase() === key,
      );
    if (folder) return { kind: 'folder', name: folder.name };
    if (
      checkFolders &&
      !path &&
      [
        runtime.STORAGE_CONFIG.indexeddb.attachmentsDirectory,
        runtime.STORAGE_CONFIG.indexeddb.appDirectory,
        'attachments',
      ].some((name) => name.toLocaleLowerCase() === key)
    )
      return { kind: 'folder', name: title };
    return null;
  }

  function uniqueDirectoryName(
    baseTitle,
    directory,
    options = {},
    extensionBytes = 3,
    counterPlacement = 'suffix',
  ) {
    const base = String(baseTitle || 'Untitled');
    let candidate = base,
      counter = 1;
    while (runtime.directoryNameConflict(candidate, directory, options)) {
      candidate =
        counterPlacement === 'suffix'
          ? runtime.counterNameSuffix(base, counter++, extensionBytes)
          : runtime.counterName(base, counter++, extensionBytes);
    }
    const error = runtime.validateFilesystemName(candidate, extensionBytes);
    if (error) {
      runtime.toast(error);
      return null;
    }
    return candidate;
  }

  function counterName(base, counter, extensionBytes = 3) {
    const prefix = `${counter} `,
      characters = Array.from(base),
      encoder = new TextEncoder();
    while (
      characters.length &&
      encoder.encode(prefix + characters.join('')).length > 255 - extensionBytes
    )
      characters.pop();
    return prefix + characters.join('').replace(/[. ]+$/, '');
  }

  function counterNameSuffix(base, counter, extensionBytes = 3) {
    const suffix = ` ${counter}`,
      characters = Array.from(base),
      encoder = new TextEncoder();
    while (
      characters.length &&
      encoder.encode(characters.join('') + suffix).length > 255 - extensionBytes
    )
      characters.pop();
    const name = characters.join('').replace(/[. ]+$/, '');
    return `${name ? `${name} ` : ''}${counter}`;
  }

  function titleForPageDestination(page, parentId, folderId) {
    const directory = parentId
      ? runtime.implicitPageFolderPath(runtime.pageById(parentId))
      : runtime.folderPathForId(folderId);
    // Reordering a note must not conflict with the directory holding its own children.
    const ownedFolderPath =
      runtime.childrenOf(page.id).length &&
      directory.toLocaleLowerCase() === runtime.pageFolderPath(page).toLocaleLowerCase()
        ? runtime.implicitPageFolderPath(page)
        : null;
    return runtime.uniqueDirectoryName(
      page.title,
      directory,
      { pageId: page.id, ownedFolderPath, checkFolders: false },
      3,
      'suffix',
    );
  }

  function uniqueFolderName(folder, parentPath, { copy = false } = {}) {
    const rootNote = runtime.state.pages.find(
      (page) =>
        !page.parentId &&
        page.folderId === folder.id &&
        String(page.title || '').toLocaleLowerCase() === folder.name.toLocaleLowerCase(),
    );
    let name = folder.name,
      counter = 1;
    while (
      runtime.directoryNameConflict(name, parentPath, {
        folderId: copy ? null : folder.id,
        checkPages: false,
      }) ||
      (rootNote &&
        runtime.directoryNameConflict(name, folder.path, {
          pageId: rootNote.id,
          checkFolders: false,
        }))
    )
      name = runtime.counterNameSuffix(folder.name, counter++, rootNote ? 3 : 0);
    const error = runtime.validateFilesystemName(name, rootNote ? 3 : 0);
    if (error) {
      runtime.toast(error);
      return null;
    }
    return name;
  }

  function pageTitleConflict(page, title) {
    if (!page) return null;
    const key = String(title || '').toLocaleLowerCase();
    if (!key) return null;
    const folderNote = runtime.state.folderNotesEnabled
      ? runtime.folderNoteFolderForPage(page)
      : null;
    if (folderNote) {
      // The folder lives in its parent; the Markdown note lives inside the folder.
      const folderConflict = runtime.directoryNameConflict(
        title,
        runtime.folderParentPath(folderNote.path),
        { folderId: folderNote.id, checkPages: false },
      );
      if (folderConflict) return folderConflict;
      return runtime.directoryNameConflict(title, folderNote.path, {
        pageId: page.id,
        checkFolders: false,
      });
    }
    const ownedFolderPath =
      runtime.childrenOf(page.id).length && String(page.title).toLocaleLowerCase() === key
        ? runtime.implicitPageFolderPath(page)
        : null;
    return runtime.directoryNameConflict(title, runtime.pageFolderPath(page), {
      pageId: page.id,
      ownedFolderPath,
      checkFolders: false,
    });
  }

  function uniquePageTitle(page, baseTitle) {
    const base = String(baseTitle || 'Untitled');
    if (!runtime.pageTitleConflict(page, base)) return base;
    let counter = 1,
      candidate = '';
    do {
      candidate = runtime.counterNameSuffix(base, counter++);
      if (runtime.validateFilesystemName(candidate, 3)) return null;
    } while (runtime.pageTitleConflict(page, candidate));
    return candidate;
  }

  function focusNewPageTitle(pageId) {
    runtime.lifecycle.frame(() => {
      if (
        runtime.workspaceAccess !== 'writable' ||
        runtime.state.mainView !== 'page' ||
        runtime.state.currentPageId !== pageId
      )
        return;
      const title = runtime.els.pageTitle;
      const dockedPageId = title?.closest('[data-page-id]')?.dataset.pageId;
      if (
        !title?.isConnected ||
        !title.isContentEditable ||
        (dockedPageId && dockedPageId !== pageId)
      )
        return;
      title.focus({ preventScroll: true });
      if (document.activeElement === title) runtime.selectAllContent(title);
    });
  }

  function createPage(
    parentId = null,
    groupId = runtime.state.activeEditorGroupId,
    title = 'Untitled',
    folderNote = false,
  ) {
    if (runtime.workspaceAccess !== 'writable') {
      const message =
        runtime.workspaceAccess === 'readonly'
          ? 'El workspace está en solo lectura. Pulsa “Conceder escritura” para solicitar permiso y crear una página.'
          : runtime.workspaceAccess === 'blocked'
            ? 'El workspace está desconectado. Selecciónalo de nuevo y concede permisos de escritura.'
            : 'Espera a que se verifiquen los permisos del workspace para crear una página.';
      runtime.toast(message);
      return null;
    }
    runtime.state.mainView = 'page';
    runtime.state.leftPanelMode = 'files';
    runtime.state.sidebarOpen = true;
    let effectiveParentId = parentId || null;
    const parentFolderNote = effectiveParentId
      ? runtime.representedFolderForPage(runtime.pageById(effectiveParentId))
      : null;
    if (parentFolderNote) effectiveParentId = null;
    const pageFolderId =
      parentFolderNote?.id ||
      (effectiveParentId
        ? runtime.pageById(effectiveParentId)?.folderId || null
        : runtime.folderByPath(runtime.state.activeFolderPath)?.id || null);
    const pageTitle = folderNote
      ? title
      : runtime.uniqueNoteTitle(title, effectiveParentId, pageFolderId);
    if (!pageTitle) return null;
    const page = {
      id: runtime.uid('page'),
      parentId: effectiveParentId,
      folderId: pageFolderId,
      title: pageTitle,
      favorite: false,
      expanded: true,
      folderNote,
      blocks: [runtime.newTextBlock()],
    };
    if (!folderNote) runtime.resetFilesTreeSelection('page:' + page.id);
    if (!folderNote) runtime.state.activeFolderPath = '';
    runtime.state.pages.push(page);
    if (effectiveParentId) {
      const parent = runtime.pageById(effectiveParentId);
      if (parent) parent.expanded = true;
    }
    runtime.createTab(page.id, true, groupId);
    runtime.scheduleSave();
    runtime.renderAll();
    runtime.focusNewPageTitle(page.id);
    return page;
  }

  Object.assign(runtime, {
    bindEvents,
    onGraphWheel,
    graphPointerPosition,
    onGraphPointerDown,
    onGraphPointerMove,
    onGraphPointerUp,
    onGraphPointerCancel,
    onPaneResizeStart,
    onClick,
    onImageBlockDoubleClick,
    onTreeContextMenu,
    onTreeContextMenuOutside,
    contextMenuItemContent,
    treeContextActionIcon,
    treeContextMenuButton,
    showTreeContextMenu,
    treeSelectionMenuHTML,
    treeSelectionDeletion,
    runSelectedTreeAction,
    runTreeContextAction,
    onMouseDown,
    selectableBlockContents,
    contentBoundaryPoint,
    caretPointInContent,
    nearestSelectableContent,
    pointOrder,
    orderedMultiSelectionPoints,
    multiSelectionRanges,
    multiSelectionTables,
    multiSelectionCodeBlocks,
    compareNodesInDocument,
    multiSelectionLayer,
    renderMultiBlockSelection,
    clearMultiBlockSelection,
    beginMultiBlockSelection,
    onMultiBlockSelectionMove,
    onMultiBlockSelectionEnd,
    multiSelectionSegments,
    markdownEscapeLinkLabel,
    markdownEscapeLinkUrl,
    markdownInlineSlice,
    markdownPrefixForBlock,
    markdownCodeBlock,
    selectedMultiBlockMarkdown,
    copyMultiBlockSelectionToClipboard,
    onCopy,
    onCut,
    localTextOffset,
    deleteBlockTextRange,
    normalizeListIndentation,
    deleteMultiBlockSelection,
    onAuxClick,
    onInput,
    onChange,
    onKeyDown,
    onDragStart,
    onDragOver,
    onDrop,
    clearTableAxisDropIndicators,
    markTableColumnDragState,
    renderTableAxisDropIndicator,
    tableAxisDropTarget,
    dockTargetAt,
    clearDockIndicators,
    clearDragState,
    createPageForBlock,
    uniqueNoteTitle,
    directoryNameConflict,
    uniqueDirectoryName,
    counterName,
    counterNameSuffix,
    titleForPageDestination,
    uniqueFolderName,
    pageTitleConflict,
    uniquePageTitle,
    focusNewPageTitle,
    createPage,
  });
}

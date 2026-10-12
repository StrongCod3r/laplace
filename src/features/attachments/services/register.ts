// @ts-nocheck
// Existing editor algorithms, isolated behind the typed controller boundary.
import type { EditorRuntime } from '@/features/editor/types';
import { attachmentReferenceSources, findUnusedAttachments } from './unused-attachments';

export function registerAttachments(runtime: EditorRuntime) {
  let imageViewerZoom = 1;
  let imageViewerPanX = 0;
  let imageViewerPanY = 0;
  let imageViewerDrag = null;
  let imageViewerSuppressClick = false;
  let imageViewerOpenGeneration = 0;
  let selectedImageBlockId = null;
  let imageBlockClipboard = null;
  let imageBlockClipboardToken = null;
  const imageBlockClipboardType = 'application/x-laplace-image-block';
  let attachmentCleanupRunning = false;

  function clearSelectedImageBlock() {
    if (selectedImageBlockId) {
      const row = runtime.els.blockEditor?.querySelector?.(
        `.image-block[data-block-id="${CSS.escape(selectedImageBlockId)}"]`,
      );
      row?.classList.remove('image-block-selected');
    }
    selectedImageBlockId = null;
  }

  function selectImageBlock(id) {
    const location = runtime.findBlockLocation(id);
    if (location?.block?.type !== 'image') return false;
    clearSelectedImageBlock();
    runtime.clearMultiBlockSelection?.();
    runtime.clearTableCellSelection?.();
    runtime.clearSelectedTable?.();
    try {
      window.getSelection()?.removeAllRanges();
    } catch {}
    const row = runtime.els.blockEditor?.querySelector?.(
      `.image-block[data-block-id="${CSS.escape(id)}"]`,
    );
    if (!row) return false;
    selectedImageBlockId = id;
    row.classList.add('image-block-selected');
    row.setAttribute('tabindex', '-1');
    row.focus({ preventScroll: true });
    return true;
  }

  function selectedImageBlock() {
    if (!selectedImageBlockId) return null;
    const location = runtime.findBlockLocation(selectedImageBlockId);
    if (location?.block?.type === 'image') return location.block;
    clearSelectedImageBlock();
    return null;
  }

  function setImageBlockClipboardData(event, block) {
    imageBlockClipboard = runtime.clone(block);
    imageBlockClipboardToken = runtime.uid('clipboard');
    event?.preventDefault?.();
    const alt = String(block.alt || block.caption || 'Image');
    const source = String(block.src || '');
    try {
      event?.clipboardData?.setData?.(imageBlockClipboardType, imageBlockClipboardToken);
    } catch {}
    try {
      event?.clipboardData?.setData?.('text/plain', source ? `![${alt}](${source})` : alt);
    } catch {}
    if (source) {
      try {
        event?.clipboardData?.setData?.(
          'text/html',
          `<img src="${runtime.escapeHtml(source)}" alt="${runtime.escapeHtml(alt)}">`,
        );
      } catch {}
    }
    return true;
  }

  function copySelectedImageBlockToClipboard(event) {
    const block = selectedImageBlock();
    return block ? setImageBlockClipboardData(event, block) : false;
  }

  function cutSelectedImageBlock(event) {
    const block = selectedImageBlock();
    if (!block || runtime.workspaceAccess !== 'writable') return false;
    const location = runtime.findBlockLocation(block.id);
    const page = runtime.currentPage();
    if (!location || !page) return false;
    setImageBlockClipboardData(event, block);
    location.blocks.splice(location.index, 1);
    runtime.ensureBlockList(location.blocks);
    clearSelectedImageBlock();
    runtime.scheduleSave();
    runtime.renderBlocks(page);
    return true;
  }

  function deleteSelectedImageBlock(id) {
    if (id !== selectedImageBlockId || runtime.workspaceAccess !== 'writable') return false;
    const block = selectedImageBlock();
    if (!block) return false;
    const location = runtime.findBlockLocation(block.id);
    const page = runtime.currentPage();
    if (!location || !page) return false;
    location.blocks.splice(location.index, 1);
    runtime.ensureBlockList(location.blocks);
    clearSelectedImageBlock();
    runtime.scheduleSave();
    runtime.renderBlocks(page);
    return true;
  }

  function pasteCopiedImageBlock(event) {
    const editor = runtime.els.blockEditor;
    if (
      !imageBlockClipboard ||
      !imageBlockClipboardToken ||
      event.clipboardData?.getData(imageBlockClipboardType) !== imageBlockClipboardToken ||
      runtime.workspaceAccess !== 'writable' ||
      !editor?.contains?.(event.target)
    )
      return false;
    const page = runtime.currentPage();
    if (!page) return false;
    const row = event.target.closest?.('.block-row[data-block-id]');
    const location = row ? runtime.findBlockLocation(row.dataset.blockId) : null;
    const blocks = location?.blocks || page.blocks;
    const index = location ? location.index + 1 : blocks.length;
    const copy = runtime.cloneBlockWithNewIds(imageBlockClipboard);
    event.preventDefault();
    blocks.splice(index, 0, copy);
    clearSelectedImageBlock();
    runtime.clearMultiBlockSelection?.();
    runtime.scheduleSave();
    runtime.renderBlocks(page);
    runtime.lifecycle.frame(() => runtime.selectImageBlock(copy.id));
    return true;
  }

  function attachmentIcon(item) {
    const extension = String(item.name || '')
      .split('.')
      .at(-1)
      ?.toLocaleLowerCase();
    if (
      String(item.type || '').startsWith('image/') ||
      ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'].includes(extension)
    )
      return runtime.iconMarkup('image', '16px');
    if (item.type === 'application/pdf' || extension === 'pdf')
      return runtime.iconMarkup('file-text', '16px');
    if (String(item.type || '').startsWith('audio/')) return runtime.iconMarkup('music', '16px');
    if (String(item.type || '').startsWith('video/')) return runtime.iconMarkup('video', '16px');
    return runtime.iconMarkup('paperclip', '16px');
  }

  function formatAttachmentSize(size) {
    const bytes = Math.max(0, Number(size) || 0);
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024,
      index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index++;
    }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
  }

  function attachmentRelativePath(path) {
    const prefix = `${runtime.STORAGE_CONFIG.indexeddb.attachmentsDirectory}/`,
      value = String(path || '');
    return value.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase())
      ? value.slice(prefix.length)
      : value;
  }

  function isImageAttachment(item) {
    const extension = String(item?.name || '')
      .split('.')
      .at(-1)
      ?.toLocaleLowerCase();
    return (
      String(item?.type || '').startsWith('image/') ||
      ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'].includes(extension)
    );
  }

  function renderAttachmentsGallery() {
    const root = runtime.els.attachmentsView;
    if (!root) return;
    const summary = runtime.attachmentListLoading
      ? 'Loading files…'
      : runtime.attachmentListError
        ? 'Folder unavailable'
        : `${runtime.attachmentListItems.length} file${runtime.attachmentListItems.length === 1 ? '' : 's'} · .attachments`;
    const header = runtime.htmlWithStyles(
      `<header class="graph-toolbar attachments-gallery-header"><div class="graph-title"><b>Attachments</b><span>${runtime.escapeHtml(summary)}</span></div><div class="graph-controls"><button type="button" class="graph-control-btn" data-attachments-refresh title="Refresh attachments" aria-label="Refresh attachments">${runtime.iconMarkup('refresh-cw', '16px')}</button></div></header>`,
    );
    if (!runtime.attachmentListLoaded && !runtime.attachmentListLoading) {
      void runtime.refreshAttachmentList();
      return;
    }
    if (runtime.attachmentListLoading) {
      runtime.publish();
      return;
    }
    if (runtime.attachmentListError) {
      runtime.publish();
      return;
    }
    if (!runtime.attachmentListItems.length) {
      runtime.publish();
      return;
    }

    const pageCount = Math.max(
      1,
      Math.ceil(runtime.attachmentListItems.length / runtime.ATTACHMENT_GALLERY_PAGE_SIZE),
    );
    runtime.attachmentGalleryPage = Math.max(
      0,
      Math.min(runtime.attachmentGalleryPage, pageCount - 1),
    );
    const start = runtime.attachmentGalleryPage * runtime.ATTACHMENT_GALLERY_PAGE_SIZE;
    const visible = runtime.attachmentListItems.slice(
      start,
      start + runtime.ATTACHMENT_GALLERY_PAGE_SIZE,
    );
    const cards = visible
      .map((item) => {
        const relative = runtime.attachmentRelativePath(item.path),
          image = runtime.isImageAttachment(item);
        const preview = image
          ? runtime.htmlWithStyles(
              `<button type="button" class="attachment-gallery-thumb" data-attachment-preview="${runtime.escapeHtml(item.path)}" title="Preview ${runtime.escapeHtml(item.name)}" aria-label="Preview image ${runtime.escapeHtml(item.name)}"><img ${runtime.imageSourceAttributes(item.path)} alt="${runtime.escapeHtml(item.name)}" loading="lazy" decoding="async"></button>`,
            )
          : runtime.htmlWithStyles(
              `<div class="attachment-gallery-thumb attachment-gallery-file" aria-hidden="true">${runtime.attachmentIcon(item)}</div>`,
            );
        return runtime.htmlWithStyles(
          `<article class="attachment-gallery-card" role="listitem" title="${runtime.escapeHtml(item.path)}">${preview}<div class="attachment-gallery-copy"><b>${runtime.escapeHtml(item.name)}</b><small title="${runtime.escapeHtml(relative)}">${runtime.escapeHtml(relative)} · ${runtime.formatAttachmentSize(item.size)}</small></div></article>`,
        );
      })
      .join('');
    const rangeEnd = Math.min(start + visible.length, runtime.attachmentListItems.length);
    const pagination =
      pageCount > 1
        ? runtime.htmlWithStyles(
            `<nav class="attachments-pagination" aria-label="Attachment pages"><button type="button" data-attachment-page="${runtime.attachmentGalleryPage - 1}" ${runtime.attachmentGalleryPage === 0 ? 'disabled' : ''}>${runtime.iconMarkup('chevron-left', '15px')}<span>Previous</span></button><span>Showing ${start + 1}–${rangeEnd} of ${runtime.attachmentListItems.length} · Page ${runtime.attachmentGalleryPage + 1} of ${pageCount}</span><button type="button" data-attachment-page="${runtime.attachmentGalleryPage + 1}" ${runtime.attachmentGalleryPage >= pageCount - 1 ? 'disabled' : ''}><span>Next</span>${runtime.iconMarkup('chevron-right', '15px')}</button></nav>`,
          )
        : '';
    runtime.publish();
    runtime.hydrateAttachmentImages(root);

    runtime.publish();
  }

  function openAttachmentPreview(path) {
    const item = runtime.attachmentListItems.find((entry) => entry.path === path);
    if (!item || !runtime.isImageAttachment(item) || !runtime.els.attachmentPreview) return;
    resetImageViewerState();
    runtime.els.attachmentPreview.removeAttribute('data-image-block-fullscreen');
    delete runtime.els.attachmentPreview.dataset.imageViewerBlockId;
    const image = runtime.els.attachmentPreviewImage;
    image.removeAttribute('src');
    image.removeAttribute('data-attachment-path');
    image.dataset.attachmentPath = runtime.normalizeVaultAssetPath(item.path);
    image.alt = item.name;
    runtime.els.attachmentPreviewTitle.textContent = item.name;
    runtime.els.attachmentPreviewPath.textContent = runtime.attachmentRelativePath(item.path);
    runtime.els.attachmentPreview.classList.remove('hidden');
    runtime.els.attachmentPreview.setAttribute('aria-hidden', 'false');
    runtime.hydrateAttachmentImages(runtime.els.attachmentPreview);
  }

  function resetImageViewerState() {
    imageViewerOpenGeneration++;
    imageViewerZoom = 1;
    imageViewerPanX = 0;
    imageViewerPanY = 0;
    imageViewerDrag = null;
    imageViewerSuppressClick = false;
    const image = runtime.els.attachmentPreviewImage;
    const stage = image?.closest('.attachment-preview-image-wrap');
    if (image) {
      image.onload = null;
      image.style.removeProperty('width');
      image.style.removeProperty('height');
      image.style.removeProperty('transform');
    }
    stage?.classList.remove('is-zoomed');
    stage?.classList.remove('is-panning');
    stage?.classList.remove('is-ready');
    const value = runtime.els.attachmentPreview?.querySelector('[data-image-viewer-zoom-value]');
    if (value) value.textContent = '100%';
  }

  function updateImageViewerTransform() {
    const image = runtime.els.attachmentPreviewImage;
    if (!image) return;
    image.style.transform = `translate(calc(-50% + ${imageViewerPanX}px), calc(-50% + ${imageViewerPanY}px)) scale(${imageViewerZoom})`;
    const value = runtime.els.attachmentPreview?.querySelector('[data-image-viewer-zoom-value]');
    if (value) value.textContent = `${Math.round(imageViewerZoom * 100)}%`;
    image
      .closest('.attachment-preview-image-wrap')
      ?.classList.toggle('is-zoomed', imageViewerZoom > 1);
  }

  function fitImageBlockViewer() {
    const preview = runtime.els.attachmentPreview;
    const image = runtime.els.attachmentPreviewImage;
    const stage = image?.closest('.attachment-preview-image-wrap');
    if (!preview?.hasAttribute('data-image-block-fullscreen') || !image || !stage) return;
    if (!image.complete || !image.naturalWidth || !image.naturalHeight) return;
    const availableWidth = Math.max(1, stage.clientWidth - 48);
    const availableHeight = Math.max(1, stage.clientHeight - 72);
    const scale = Math.min(
      availableWidth / image.naturalWidth,
      availableHeight / image.naturalHeight,
    );
    image.style.width = `${Math.round(image.naturalWidth * scale)}px`;
    image.style.height = `${Math.round(image.naturalHeight * scale)}px`;
    imageViewerZoom = 1;
    imageViewerPanX = 0;
    imageViewerPanY = 0;
    updateImageViewerTransform();
    if (!stage.classList.contains('is-ready')) {
      image.getBoundingClientRect();
      const generation = imageViewerOpenGeneration;
      runtime.lifecycle.frame(() => {
        if (generation === imageViewerOpenGeneration && isImageBlockPreviewOpen())
          stage.classList.add('is-ready');
      });
    }
  }

  function openImageBlockPreview(id) {
    const block = runtime.findBlock(id);
    const preview = runtime.els.attachmentPreview;
    const image = runtime.els.attachmentPreviewImage;
    if (!block?.src || !preview || !image) return;
    resetImageViewerState();
    image.removeAttribute('src');
    image.removeAttribute('data-attachment-path');
    image.onload = () => fitImageBlockViewer();
    image.alt = block.alt || block.caption || 'Image';
    const path = runtime.normalizeAttachmentPath(block.src);
    if (path) image.dataset.attachmentPath = path;
    else image.src = block.src;
    runtime.els.attachmentPreviewTitle.textContent = image.alt;
    runtime.els.attachmentPreviewPath.textContent = '';
    preview.dataset.imageBlockFullscreen = 'true';
    preview.dataset.imageViewerBlockId = id;
    preview.classList.remove('hidden');
    preview.setAttribute('aria-hidden', 'false');
    runtime.hydrateAttachmentImages(preview);
    if (image.complete && image.naturalWidth) fitImageBlockViewer();
  }

  function closeAttachmentPreview() {
    const preview = runtime.els.attachmentPreview;
    if (!preview) return;
    preview.classList.add('hidden');
    preview.setAttribute('aria-hidden', 'true');
    preview.removeAttribute('data-image-block-fullscreen');
    delete preview.dataset.imageViewerBlockId;
    resetImageViewerState();
  }

  function isImageBlockPreviewOpen() {
    const preview = runtime.els.attachmentPreview;
    return (
      !!preview?.hasAttribute('data-image-block-fullscreen') &&
      !preview.classList.contains('hidden')
    );
  }

  function setImageBlockViewerZoom(next, event = null) {
    if (!isImageBlockPreviewOpen()) return;
    const previous = imageViewerZoom;
    next = Math.max(0.1, Math.min(8, Number(next) || 1));
    if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      const stage = runtime.els.attachmentPreviewImage?.closest('.attachment-preview-image-wrap');
      const rect = stage?.getBoundingClientRect();
      if (rect) {
        const x = event.clientX - rect.left - rect.width / 2;
        const y = event.clientY - rect.top - rect.height / 2;
        imageViewerPanX = x - ((x - imageViewerPanX) * next) / previous;
        imageViewerPanY = y - ((y - imageViewerPanY) * next) / previous;
      }
    }
    imageViewerZoom = next;
    if (next <= 1) {
      imageViewerPanX = 0;
      imageViewerPanY = 0;
    }
    updateImageViewerTransform();
  }

  function zoomImageBlockViewer(direction, event = null) {
    const next = imageViewerZoom * (direction === 'in' ? 1.25 : 0.8);
    setImageBlockViewerZoom(next, event);
  }

  function toggleImageBlockViewerZoom(event) {
    setImageBlockViewerZoom(Math.abs(imageViewerZoom - 1) > 0.01 ? 1 : 1.5, event);
  }

  function onImageBlockViewerWheel(event) {
    if (!isImageBlockPreviewOpen() || !event.ctrlKey) return;
    event.preventDefault();
    zoomImageBlockViewer(event.deltaY < 0 ? 'in' : 'out', event);
  }

  function startImageBlockViewerPan(event) {
    if (!isImageBlockPreviewOpen()) return;
    imageViewerSuppressClick = false;
    if (
      event.button !== 0 ||
      imageViewerZoom <= 1 ||
      event.target.closest?.('[data-image-viewer-controls], [data-image-viewer-close]')
    )
      return;
    const stage = runtime.els.attachmentPreviewImage?.closest('.attachment-preview-image-wrap');
    if (!stage) return;
    imageViewerDrag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX: imageViewerPanX,
      panY: imageViewerPanY,
      moved: false,
      captured: false,
    };
  }

  function moveImageBlockViewerPan(event) {
    if (!imageViewerDrag || event.pointerId !== imageViewerDrag.pointerId) return;
    const deltaX = event.clientX - imageViewerDrag.x;
    const deltaY = event.clientY - imageViewerDrag.y;
    if (!imageViewerDrag.moved) {
      if (Math.hypot(deltaX, deltaY) <= 4) return;
      event.preventDefault();
      imageViewerDrag.moved = true;
      const stage = runtime.els.attachmentPreviewImage?.closest('.attachment-preview-image-wrap');
      stage?.classList.add('is-panning');
      try {
        stage?.setPointerCapture(event.pointerId);
        imageViewerDrag.captured = !!stage?.hasPointerCapture(event.pointerId);
      } catch {}
    }
    imageViewerPanX = imageViewerDrag.panX + deltaX;
    imageViewerPanY = imageViewerDrag.panY + deltaY;
    updateImageViewerTransform();
  }

  function endImageBlockViewerPan(event) {
    if (imageViewerDrag && event && event.pointerId !== imageViewerDrag.pointerId) return;
    if (imageViewerDrag?.moved) imageViewerSuppressClick = true;
    const stage = runtime.els.attachmentPreviewImage?.closest('.attachment-preview-image-wrap');
    if (stage && imageViewerDrag?.captured) {
      try {
        if (stage.hasPointerCapture(imageViewerDrag.pointerId))
          stage.releasePointerCapture(imageViewerDrag.pointerId);
      } catch {}
    }
    imageViewerDrag = null;
    stage?.classList.remove('is-panning');
  }

  function consumeImageBlockViewerDragClick(event) {
    if (
      !imageViewerSuppressClick ||
      !isImageBlockPreviewOpen() ||
      !runtime.els.attachmentPreview.contains(event.target)
    )
      return false;
    imageViewerSuppressClick = false;
    return true;
  }

  function invalidateAttachmentList() {
    runtime.attachmentListRequest++;
    runtime.attachmentListItems = [];
    runtime.selectedAttachmentPath = null;
    runtime.attachmentListLoaded = false;
    runtime.attachmentListLoading = false;
    runtime.attachmentListError = '';
    runtime.attachmentGalleryPage = 0;
    runtime.closeAttachmentPreview();
  }

  async function refreshAttachmentList() {
    const request = ++runtime.attachmentListRequest;
    runtime.attachmentListLoading = true;
    runtime.attachmentListError = '';
    runtime.renderAttachmentsGallery();
    try {
      const items = await runtime.localStorageGateway.listAttachments();
      if (request !== runtime.attachmentListRequest) return;
      runtime.attachmentListItems = items;
      if (
        runtime.selectedAttachmentPath &&
        !items.some(
          (item) =>
            runtime.normalizeAttachmentPath(item.path) ===
            runtime.normalizeAttachmentPath(runtime.selectedAttachmentPath),
        )
      )
        runtime.selectedAttachmentPath = null;
    } catch (error) {
      if (request !== runtime.attachmentListRequest) return;
      runtime.attachmentListError = error?.message || 'Could not read the .attachments folder.';
    }
    runtime.attachmentListLoaded = true;
    runtime.attachmentListLoading = false;
    runtime.renderAttachmentsGallery();
    if (runtime.state.mainView === 'attachments') runtime.renderRightSidebar();
  }

  function selectAttachmentForBacklinks(path) {
    const attachment = runtime.attachmentListItems.find((item) => item.path === path);
    if (!attachment) return false;
    runtime.selectedAttachmentPath = attachment.path;
    runtime.state.rightPanelMode = 'backlinks';
    if (!runtime.state.rightSidebarOpen) {
      runtime.state.rightSidebarOpen = true;
      runtime.updateWorkspaceChrome();
    }
    runtime.scheduleSave();
    runtime.renderRightSidebar();
    return true;
  }

  function copyAttachmentToClipboard(path) {
    const attachment = runtime.attachmentListItems.find((item) => item.path === path);
    if (!attachment || !runtime.isImageAttachment(attachment)) return false;

    const source = runtime.normalizeAttachmentPath(attachment.path);
    const alt = attachment.name.replace(/\.[^.]+$/, '') || 'Image';
    try {
      const escapedPath = runtime.markdownEscapeLinkUrl(runtime.markdownAssetPath(source));
      const markdown = `![${runtime.markdownEscapeLinkLabel(alt)}](${escapedPath})`;
      const write = navigator.clipboard?.writeText?.(markdown);
      write?.catch(() => {});
    } catch {}
    runtime.toast('Image copied. Paste it into a page.');
    return true;
  }

  async function deleteAttachmentFromGallery(path) {
    const attachment = runtime.attachmentListItems.find((item) => item.path === path);
    if (!attachment) return;

    const normalizedPath = runtime.normalizeAttachmentPath(attachment.path);
    let referenceCount = 0;
    let referencingPageCount = 0;
    for (const page of runtime.state.pages || []) {
      const pageReferenceCount = runtime
        .flattenBlocks(page.blocks || [])
        .filter(
          (block) =>
            block.type === 'image' &&
            runtime.normalizeAttachmentPath(String(block.src || '')) === normalizedPath,
        ).length;
      if (pageReferenceCount) {
        referenceCount += pageReferenceCount;
        referencingPageCount++;
      }
    }

    const usageWarning = referenceCount
      ? `It is referenced by ${referenceCount} image${referenceCount === 1 ? '' : 's'} on ${referencingPageCount} ${referencingPageCount === 1 ? 'page' : 'pages'}. Those image blocks will remain but the file will be missing.`
      : 'This permanently removes the file from the current workspace.';
    if (
      !(await runtime.askDeleteConfirmation(
        'Delete attachment?',
        `Delete “${attachment.name}”? ${usageWarning}`,
      ))
    )
      return;

    try {
      await runtime.localStorageGateway.deleteAttachment(attachment.path);
      if (
        imageBlockClipboard &&
        runtime.normalizeAttachmentPath(imageBlockClipboard.src || '') === normalizedPath
      )
        imageBlockClipboard = null;
      runtime.clearAttachmentObjectUrls();
      runtime.attachmentListItems = runtime.attachmentListItems.filter(
        (item) => runtime.normalizeAttachmentPath(item.path) !== normalizedPath,
      );
      const pageCount = Math.ceil(
        runtime.attachmentListItems.length / runtime.ATTACHMENT_GALLERY_PAGE_SIZE,
      );
      runtime.attachmentGalleryPage = Math.max(
        0,
        Math.min(runtime.attachmentGalleryPage, pageCount - 1),
      );
      if (runtime.normalizeAttachmentPath(runtime.selectedAttachmentPath || '') === normalizedPath)
        runtime.selectedAttachmentPath = null;
      runtime.scheduleSave();
      runtime.renderAttachmentsGallery();
      runtime.renderRightSidebar();
      runtime.toast('Attachment deleted');
    } catch (error) {
      runtime.toast(error?.message || 'Could not delete that attachment.');
    }
  }

  async function cleanupUnusedAttachments() {
    if (
      attachmentCleanupRunning ||
      runtime.workspaceAccess !== 'writable' ||
      runtime.workspaceLocationSwitching ||
      runtime.gitOperationActive
    )
      return;
    attachmentCleanupRunning = true;
    const workspace = runtime.state;
    const vaultId = runtime.activeVaultId;
    const active = () => runtime.state === workspace && runtime.activeVaultId === vaultId;
    let locked = false;
    let deleted = 0;
    try {
      if (runtime.saveTimer && !(await runtime.persistStateNow()))
        throw new Error('Could not save notes before cleaning attachments.');
      await runtime.storageWriteChain;
      const scan = async () => {
        const items = await runtime.localStorageGateway.listAttachments();
        const sources = attachmentReferenceSources(workspace);
        if (runtime.localStorageGateway.hasDirectory?.()) {
          const disk = await runtime.localStorageGateway.readMarkdownFiles({ trackFiles: false });
          sources.push(...disk.files.map((file) => file.content));
        }
        return findUnusedAttachments(items, sources, async (item) => {
          if (
            !/\.(svg|css|html?|md|txt|json|m?js)$/i.test(item.name) &&
            !String(item.type).startsWith('text/')
          )
            return null;
          const blob = await runtime.localStorageGateway.readAttachment(item.path);
          if (!blob) throw new Error(`Could not check references in ${item.name}.`);
          return blob.text();
        });
      };
      const unused = await scan();
      if (!active()) return;
      if (!unused.length) {
        runtime.toast('No unused attachments found.');
        return;
      }
      const size = unused.reduce((total, item) => total + item.size, 0);
      const names = unused
        .slice(0, 8)
        .map((item) => item.name)
        .join(', ');
      if (
        !(await runtime.askDeleteConfirmation(
          'Delete unused attachments?',
          `Delete ${unused.length} unused file${unused.length === 1 ? '' : 's'} (${runtime.formatAttachmentSize(size)})? ${names}${unused.length > 8 ? ', …' : ''}. This permanently removes these files from the current workspace.`,
          'Delete unused files',
        ))
      )
        return;
      if (
        !active() ||
        runtime.workspaceAccess !== 'writable' ||
        runtime.workspaceLocationSwitching ||
        runtime.gitOperationActive
      )
        return;
      runtime.workspaceLocationSwitching = true;
      locked = true;
      runtime.syncWorkspaceLocationActions();
      if (runtime.saveTimer && !(await runtime.persistStateNow()))
        throw new Error('Could not save notes before cleaning attachments.');
      await runtime.storageWriteChain;
      runtime.setWorkspaceAccess('checking');
      const stillUnused = new Set((await scan()).map((item) => item.path));
      for (const item of unused) {
        if (!active()) break;
        if (!stillUnused.has(item.path)) continue;
        await runtime.localStorageGateway.deleteAttachment(item.path);
        if (
          imageBlockClipboard &&
          runtime.normalizeAttachmentPath(imageBlockClipboard.src || '') ===
            runtime.normalizeAttachmentPath(item.path)
        )
          imageBlockClipboard = null;
        deleted++;
      }
      runtime.toast(
        deleted
          ? `${deleted} unused attachment${deleted === 1 ? '' : 's'} deleted.`
          : 'No unused attachments remain.',
      );
    } catch (error) {
      runtime.toast(
        `${deleted ? `${deleted} attachment${deleted === 1 ? '' : 's'} deleted. ` : ''}${error?.message || 'Could not clean unused attachments.'}`,
      );
    } finally {
      if (locked) {
        runtime.workspaceLocationSwitching = false;
        if (active()) {
          const permission = await runtime.localStorageGateway
            .getDirectoryPermission?.()
            .catch(() => 'denied');
          runtime.setWorkspaceAccess(runtime.accessModeForPermission(permission));
        }
        runtime.syncWorkspaceLocationActions();
      }
      attachmentCleanupRunning = false;
      if (active()) {
        runtime.clearAttachmentObjectUrls();
        runtime.closeAttachmentPreview();
        await runtime.refreshAttachmentList();
      }
    }
  }

  function renderAttachmentsView() {
    runtime.els.editorDock?.classList.add('hidden');
    runtime.bindEditorElements(null);
    runtime.els.graphView?.classList.add('hidden');
    runtime.els.homeView.classList.add('hidden');
    runtime.els.editorView.classList.remove('hidden');
    runtime.els.pageEditor?.classList.add('hidden');
    runtime.els.attachmentsView?.classList.remove('hidden');
    runtime.els.breadcrumbs.innerHTML = runtime.htmlWithStyles(
      `${runtime.navigationHistoryButtonsMarkup()}<span class="crumb">Attachments</span>`,
    );
    runtime.closeAttachmentPreview();
    runtime.renderAttachmentsGallery();
  }

  function imageLinkEditorHTML(block) {
    if (runtime.activeImageLinkBlockId !== block.id) return '';
    const current = block.src && !block.src.startsWith('data:') ? block.src : '';
    return runtime.htmlWithStyles(
      `<div class="image-url-editor" data-image-url-editor><div class="image-url-row"><input class="image-url-input" data-image-url-input type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://example.com/image.jpg" value="${runtime.escapeHtml(current)}"><button class="image-url-submit" data-image-url-submit>Embed</button><button class="image-url-cancel" data-image-url-cancel>Cancel</button></div><div class="image-url-help">Paste a direct, public image URL. The image is tested before it is saved.</div><div class="image-url-error" data-image-url-error></div></div>`,
    );
  }

  function imageToolIcon(type) {
    const names = {
      align: 'align-left',
      caption: 'captions',
      crop: 'crop',
      download: 'download',
      left: 'align-left',
      right: 'align-right',
      center: 'align-center',
    };
    return runtime.iconMarkup(names[type] || 'align-center', '16px');
  }

  function imageDisplayWidth(block) {
    const value = Number(block.imageWidth);
    return Number.isFinite(value) && value > 80 ? Math.round(value) : null;
  }

  function imageAlignment(block) {
    return ['left', 'center', 'right'].includes(block.imageAlign) ? block.imageAlign : 'center';
  }

  function normalizedImageCrop(block) {
    const raw = block.imageCrop && typeof block.imageCrop === 'object' ? block.imageCrop : {};
    const originalAspect = Math.max(0.2, Math.min(5, Number(raw.originalAspect) || 1));
    const shape = raw.shape === 'circle' ? 'circle' : 'rect';
    const aspectRaw = shape === 'circle' ? 1 : Number(raw.aspect) || originalAspect;
    return {
      enabled: !!raw.enabled,
      shape,
      aspect: Math.max(0.2, Math.min(5, aspectRaw)),
      originalAspect,
      zoom: Math.max(1, Math.min(3, Number(raw.zoom) || 1)),
      x: Math.max(0, Math.min(100, Number.isFinite(Number(raw.x)) ? Number(raw.x) : 50)),
      y: Math.max(0, Math.min(100, Number.isFinite(Number(raw.y)) ? Number(raw.y) : 50)),
    };
  }

  async function downloadImageBlock(id) {
    const b = runtime.findBlock(id);
    if (!b?.src) return;
    const fallback = () => {
      const a = document.createElement('a');
      a.href = b.src;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.download = 'image';
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
    try {
      let blob;
      const path = runtime.normalizeAttachmentPath(b.src);
      if (path) {
        blob = await runtime.localStorageGateway.readAttachment(path);
        if (!blob) throw new Error('Attachment not found');
      } else {
        const response = await fetch(b.src);
        if (!response.ok) throw new Error('download');
        blob = await response.blob();
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg').split('+')[0];
      a.href = url;
      a.download = path?.split('/').at(-1) || `image.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      runtime.lifecycle.timeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (runtime.isVaultAssetPath(b.src)) {
        runtime.toast(error?.message || 'Could not read that attachment.');
        return;
      }
      fallback();
    }
  }

  function startImageResize(handle, id, side, event) {
    const block = runtime.findBlock(id);
    const shell = handle.closest('.image-preview-shell');
    const figure = shell?.closest('.image-figure');
    if (!block || !shell || !figure || runtime.workspaceAccess !== 'writable') return;
    event.preventDefault();
    event.stopPropagation();

    const pageId = runtime.currentPage()?.id;
    const startX = event.clientX;
    const startWidth = shell.getBoundingClientRect().width;
    const maxWidth = Math.floor(figure.getBoundingClientRect().width);
    if (maxWidth <= 0) return;
    const minWidth = Math.min(100, maxWidth);
    const direction = side === 'left' ? -1 : 1;
    // A centered image changes on both sides while the dragged edge follows the pointer.
    const multiplier = runtime.imageAlignment(block) === 'center' ? 2 : 1;
    let width = startWidth;
    let changed = false;
    shell.classList.add('resizing');
    document.body.classList.add('image-resizing');

    const move = (ev) => {
      if (!shell.isConnected) {
        stop();
        return;
      }
      const nextWidth = Math.round(
        Math.max(
          minWidth,
          Math.min(maxWidth, startWidth + (ev.clientX - startX) * direction * multiplier),
        ),
      );
      if (nextWidth === width) return;
      width = nextWidth;
      changed = true;
      block.imageWidth = width;
      shell.style.width = `${width}px`;
    };
    const stop = () => {
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('mouseup', stop, true);
      window.removeEventListener('blur', stop);
      shell.classList.remove('resizing');
      document.body.classList.remove('image-resizing');
      if (!changed) return;
      runtime.scheduleSave();
      if (pageId && runtime.els.editorDock && !runtime.els.editorDock.classList.contains('hidden'))
        runtime.refreshOtherDockPages(pageId);
    };
    runtime.lifecycle.listen(window, 'mousemove', move, true);
    runtime.lifecycle.listen(window, 'mouseup', stop, true);
    runtime.lifecycle.listen(window, 'blur', stop);
  }

  function setImageAlignment(id, align) {
    if (!['left', 'center', 'right'].includes(align)) return;
    const b = runtime.findBlock(id);
    if (!b) return;
    b.imageAlign = align;
    runtime.scheduleSave();
    const row = document.querySelector(`.block-row[data-block-id="${id}"]`);
    const figure = row?.querySelector('.image-figure');
    if (figure) {
      figure.classList.remove('align-left', 'align-center', 'align-right');
      figure.classList.add(`align-${align}`);
    }
    row?.querySelector('[data-image-align-menu]')?.classList.add('hidden');
    row
      ?.querySelectorAll('[data-image-align-choice]')
      .forEach((btn) => btn.classList.toggle('active', btn.dataset.imageAlignChoice === align));
  }

  function toggleImageCaption(id) {
    const b = runtime.findBlock(id);
    if (!b) return;
    const wasVisible =
      b.showCaption !== false && (b.showCaption === true || !!String(b.caption || ''));
    b.showCaption = !wasVisible;
    runtime.scheduleSave();
    runtime.renderBlocks(runtime.currentPage());
    if (!wasVisible)
      runtime.lifecycle.frame(() => {
        const cap = document.querySelector(
          `.block-row[data-block-id="${id}"] [data-image-caption]`,
        );
        cap?.focus();
      });
  }

  function openImageCrop(id) {
    const b = runtime.findBlock(id);
    if (!b) return;
    const row = document.querySelector(`.block-row[data-block-id="${id}"]`);
    const source = row?.querySelector('.image-preview img');
    const rect = source?.getBoundingClientRect();
    const current =
      b.imageCrop && typeof b.imageCrop === 'object'
        ? JSON.parse(JSON.stringify(b.imageCrop))
        : null;
    const naturalAspect =
      source?.naturalWidth && source?.naturalHeight
        ? source.naturalWidth / source.naturalHeight
        : 0;
    const derivedAspect = naturalAspect || (rect?.height > 0 ? rect.width / rect.height : 1);
    runtime.imageCropSession = { id, original: current };
    const crop = runtime.normalizedImageCrop(b);
    if (!crop.enabled)
      b.imageCrop = {
        enabled: true,
        originalAspect: derivedAspect,
        aspect: derivedAspect,
        zoom: 1,
        x: 50,
        y: 50,
      };
    else
      b.imageCrop = {
        ...crop,
        originalAspect: crop.originalAspect || derivedAspect,
        enabled: true,
      };
    runtime.activeImageCropBlockId = id;
    runtime.renderBlocks(runtime.currentPage());
    runtime.scheduleImageCropDialogLayout(id);
  }

  function applyImageCropPreview(row, block) {
    const crop = runtime.normalizedImageCrop(block),
      preview = row?.querySelector('.image-preview'),
      img = preview?.querySelector('img');
    if (!preview || !img) return;
    preview.classList.toggle('crop-active', crop.enabled);
    preview.classList.toggle('crop-circle', crop.enabled && crop.shape === 'circle');
    if (crop.enabled) {
      preview.style.aspectRatio = String(crop.aspect);
      preview.style.borderRadius = crop.shape === 'circle' ? '50%' : '4px';
      preview.style.clipPath = crop.shape === 'circle' ? 'circle(50% at 50% 50%)' : 'none';
      preview.style.webkitClipPath = crop.shape === 'circle' ? 'circle(50% at 50% 50%)' : 'none';
      img.style.borderRadius = crop.shape === 'circle' ? '50%' : '4px';
      img.style.objectPosition = `${crop.x}% ${crop.y}%`;
      img.style.transform = `scale(${crop.zoom})`;
    } else {
      preview.style.removeProperty('aspect-ratio');
      preview.style.removeProperty('border-radius');
      preview.style.removeProperty('clip-path');
      preview.style.removeProperty('-webkit-clip-path');
      img.style.removeProperty('border-radius');
      img.style.removeProperty('object-position');
      img.style.removeProperty('transform');
    }
    row
      .querySelector('[data-image-crop-zoom-value]')
      ?.replaceChildren(document.createTextNode(`${crop.zoom.toFixed(1)}×`));
    row
      .querySelector('[data-image-crop-x-value]')
      ?.replaceChildren(document.createTextNode(`${Math.round(crop.x)}%`));
    row
      .querySelector('[data-image-crop-y-value]')
      ?.replaceChildren(document.createTextNode(`${Math.round(crop.y)}%`));
  }

  function updateImageCropControl(input) {
    const row = input.closest('.image-block'),
      b = runtime.findBlock(row?.dataset.blockId);
    if (!b) return;
    const crop = runtime.normalizedImageCrop(b);
    if (input.matches('[data-image-crop-zoom]')) crop.zoom = Number(input.value);
    if (input.matches('[data-image-crop-x]')) crop.x = Number(input.value);
    if (input.matches('[data-image-crop-y]')) crop.y = Number(input.value);
    b.imageCrop = { ...crop, enabled: true };
    runtime.applyImageCropPreview(row, b);
  }

  function setImageCropAspect(id, ratio) {
    const b = runtime.findBlock(id);
    if (!b) return;
    const crop = runtime.normalizedImageCrop(b);
    let next = crop.aspect,
      shape = 'rect';
    if (ratio === 'original') next = crop.originalAspect;
    else if (ratio === 'circle') {
      next = 1;
      shape = 'circle';
    } else next = Number(ratio);
    if (!Number.isFinite(next) || next <= 0) return;
    b.imageCrop = { ...crop, enabled: true, shape, aspect: next };
    const row = document.querySelector(`.block-row[data-block-id="${id}"]`);
    runtime.applyImageCropPreview(row, b);
    row?.querySelectorAll('[data-image-crop-aspect]').forEach((btn) => {
      const value = btn.dataset.imageCropAspect;
      const isActive =
        value === 'circle'
          ? shape === 'circle'
          : shape !== 'circle' &&
            Math.abs((value === 'original' ? crop.originalAspect : Number(value)) - next) < 0.01;
      btn.classList.toggle('active', isActive);
    });
    runtime.syncImageCropAspectChecks(row);
    row?.querySelector('[data-image-crop-aspect-menu]')?.classList.add('hidden');
    runtime.scheduleImageCropDialogLayout(id);
  }

  function scheduleImageCropDialogLayout(id) {
    runtime.lifecycle.frame(() => {
      const row = document.querySelector(`.block-row[data-block-id="${id}"]`);
      const img = row?.querySelector('[data-image-crop-source]');
      if (!img) return;
      const draw = () => runtime.layoutImageCropDialog(id);
      if (img.complete && img.naturalWidth) draw();
      else runtime.lifecycle.listen(img, 'load', draw, { once: true });
    });
  }

  function cropDialogGeometry(id) {
    const row = document.querySelector(`.block-row[data-block-id="${id}"]`);
    const stage = row?.querySelector('[data-image-crop-stage]'),
      img = row?.querySelector('[data-image-crop-source]'),
      frame = row?.querySelector('[data-image-crop-frame]');
    if (!stage || !img || !frame) return null;
    const sr = stage.getBoundingClientRect(),
      ir = img.getBoundingClientRect(),
      fr = frame.getBoundingClientRect();
    return {
      row,
      stage,
      img,
      frame,
      sr,
      ir,
      fr,
      imgLeft: ir.left - sr.left,
      imgTop: ir.top - sr.top,
    };
  }

  function cropMaxFit(imageWidth, imageHeight, aspect) {
    let width = imageWidth,
      height = width / aspect;
    if (height > imageHeight) {
      height = imageHeight;
      width = height * aspect;
    }
    return { width, height };
  }

  function layoutImageCropDialog(id) {
    const b = runtime.findBlock(id),
      g = runtime.cropDialogGeometry(id);
    if (!b || !g) return;
    const crop = runtime.normalizedImageCrop(b),
      max = runtime.cropMaxFit(g.ir.width, g.ir.height, crop.aspect);
    const width = Math.max(56, max.width / crop.zoom),
      height = Math.max(56, max.height / crop.zoom);
    const travelX = Math.max(0, g.ir.width - width),
      travelY = Math.max(0, g.ir.height - height);
    const left = g.imgLeft + travelX * (crop.x / 100),
      top = g.imgTop + travelY * (crop.y / 100);
    Object.assign(g.frame.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${Math.min(width, g.ir.width)}px`,
      height: `${Math.min(height, g.ir.height)}px`,
    });
    g.frame.classList.toggle('circle', crop.shape === 'circle');
  }

  function updateCropFromDialogFrame(id, left, top, width, height, g) {
    const b = runtime.findBlock(id);
    if (!b) return;
    const aspect = Math.max(0.2, Math.min(5, width / Math.max(1, height)));
    const max = runtime.cropMaxFit(g.ir.width, g.ir.height, aspect);
    const zoom = Math.max(1, Math.min(3, max.width / Math.max(1, width)));
    const actualWidth = max.width / zoom,
      actualHeight = max.height / zoom;
    const travelX = Math.max(0, g.ir.width - actualWidth),
      travelY = Math.max(0, g.ir.height - actualHeight);
    const x = travelX ? ((left - g.imgLeft) / travelX) * 100 : 50;
    const y = travelY ? ((top - g.imgTop) / travelY) * 100 : 50;
    const base = runtime.normalizedImageCrop(b);
    b.imageCrop = {
      ...base,
      enabled: true,
      aspect,
      zoom,
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };
    runtime.layoutImageCropDialog(id);
  }

  function startImageCropFrameMove(frame, id, event) {
    const g = runtime.cropDialogGeometry(id);
    if (!g) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX,
      startY = event.clientY;
    const startLeft = g.fr.left - g.sr.left,
      startTop = g.fr.top - g.sr.top,
      width = g.fr.width,
      height = g.fr.height;
    const minLeft = g.imgLeft,
      maxLeft = g.imgLeft + g.ir.width - width,
      minTop = g.imgTop,
      maxTop = g.imgTop + g.ir.height - height;
    const move = (ev) => {
      const left = Math.max(minLeft, Math.min(maxLeft, startLeft + ev.clientX - startX));
      const top = Math.max(minTop, Math.min(maxTop, startTop + ev.clientY - startY));
      g.frame.style.left = `${left}px`;
      g.frame.style.top = `${top}px`;
      runtime.updateCropFromDialogFrame(id, left, top, width, height, g);
    };
    const up = () => {
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('mouseup', up, true);
    };
    runtime.lifecycle.listen(window, 'mousemove', move, true);
    runtime.lifecycle.listen(window, 'mouseup', up, true);
  }

  function startImageCropFrameResize(handle, id, event) {
    const g = runtime.cropDialogGeometry(id);
    if (!g) return;
    event.preventDefault();
    event.stopPropagation();
    const dir = handle.dataset.imageCropHandle || '',
      startX = event.clientX,
      startY = event.clientY;
    const base = {
      left: g.fr.left - g.sr.left,
      top: g.fr.top - g.sr.top,
      right: g.fr.right - g.sr.left,
      bottom: g.fr.bottom - g.sr.top,
    };
    const bounds = {
      left: g.imgLeft,
      top: g.imgTop,
      right: g.imgLeft + g.ir.width,
      bottom: g.imgTop + g.ir.height,
    };
    const minSize = 56;
    const move = (ev) => {
      const dx = ev.clientX - startX,
        dy = ev.clientY - startY;
      let { left, top, right, bottom } = base;
      if (dir.includes('w'))
        left = Math.max(bounds.left, Math.min(right - minSize, base.left + dx));
      if (dir.includes('e'))
        right = Math.min(bounds.right, Math.max(left + minSize, base.right + dx));
      if (dir.includes('n')) top = Math.max(bounds.top, Math.min(bottom - minSize, base.top + dy));
      if (dir.includes('s'))
        bottom = Math.min(bounds.bottom, Math.max(top + minSize, base.bottom + dy));
      runtime.updateCropFromDialogFrame(id, left, top, right - left, bottom - top, g);
    };
    const up = () => {
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('mouseup', up, true);
    };
    runtime.lifecycle.listen(window, 'mousemove', move, true);
    runtime.lifecycle.listen(window, 'mouseup', up, true);
  }

  function resetImageCrop(id) {
    const b = runtime.findBlock(id);
    if (!b) return;
    const crop = runtime.normalizedImageCrop(b);
    b.imageCrop = { ...crop, enabled: true, aspect: crop.originalAspect, zoom: 1, x: 50, y: 50 };
    runtime.renderBlocks(runtime.currentPage());
  }

  function applyImageCrop(id) {
    if (runtime.activeImageCropBlockId !== id) return;
    runtime.activeImageCropBlockId = null;
    runtime.imageCropSession = null;
    runtime.scheduleSave();
    runtime.renderBlocks(runtime.currentPage());
  }

  function cancelImageCrop(id) {
    const b = runtime.findBlock(id);
    if (!b) return;
    if (runtime.imageCropSession?.id === id) {
      if (runtime.imageCropSession.original) b.imageCrop = runtime.imageCropSession.original;
      else delete b.imageCrop;
    }
    runtime.activeImageCropBlockId = null;
    runtime.imageCropSession = null;
    runtime.renderBlocks(runtime.currentPage());
  }

  function imageSourceAttributes(source) {
    const path = runtime.normalizeAttachmentPath(source);
    if (!path) return `src="${runtime.escapeHtml(source || '')}"`;
    const objectUrl = runtime.attachmentObjectUrls.get(path);
    return `${objectUrl ? `src="${runtime.escapeHtml(objectUrl)}"` : ''} data-attachment-path="${runtime.escapeHtml(path)}"`;
  }

  function clearAttachmentObjectUrls() {
    runtime.attachmentCacheGeneration++;
    for (const url of runtime.attachmentObjectUrls.values()) URL.revokeObjectURL(url);
    runtime.attachmentObjectUrls.clear();
    runtime.pendingAttachmentLoads.clear();
  }

  function hydrateAttachmentImages(root) {
    if (!root?.querySelectorAll) return;
    const generation = runtime.attachmentCacheGeneration;
    root.querySelectorAll('img[data-attachment-path]').forEach((image) => {
      const path = runtime.normalizeVaultAssetPath(image.dataset.attachmentPath);
      if (!path) return;
      const cachedUrl = runtime.attachmentObjectUrls.get(path);
      if (cachedUrl) {
        if (image.getAttribute('src') !== cachedUrl) image.setAttribute('src', cachedUrl);
        return;
      }
      const key = `${generation}:${path}`;
      let loading = runtime.pendingAttachmentLoads.get(key);
      if (!loading) {
        loading = runtime.localStorageGateway
          .readAttachment(path)
          .then((blob) => {
            if (!blob || generation !== runtime.attachmentCacheGeneration) return null;
            const url = URL.createObjectURL(blob);
            runtime.attachmentObjectUrls.set(path, url);
            return url;
          })
          .catch((error) => {
            console.warn(`Could not read attachment ${path}`, error);
            return null;
          })
          .finally(() => runtime.pendingAttachmentLoads.delete(key));
        runtime.pendingAttachmentLoads.set(key, loading);
      }
      void loading.then((url) => {
        if (
          url &&
          generation === runtime.attachmentCacheGeneration &&
          image.isConnected &&
          image.dataset.attachmentPath === path
        )
          image.src = url;
      });
    });
  }

  function imageCropPanelHTML(block) {
    if (runtime.activeImageCropBlockId !== block.id) return '';
    const crop = runtime.normalizedImageCrop(block);
    const active = (ratio) => (Math.abs(crop.aspect - ratio) < 0.01 ? ' active' : '');
    return runtime.htmlWithStyles(
      `<div class="image-crop-backdrop" data-image-crop-backdrop><div class="image-crop-dialog" data-image-crop-dialog><div class="image-crop-header"><div class="image-crop-header-left"><button class="image-crop-aspect-trigger" data-image-crop-aspect-toggle title="Aspect ratio">${runtime.iconMarkup('ratio', '16px')}${runtime.chevronSvg()}</button><div class="image-crop-aspect-menu hidden" data-image-crop-aspect-menu><button data-image-crop-aspect="original" class="${crop.shape !== 'circle' && Math.abs(crop.aspect - crop.originalAspect) < 0.01 ? 'active' : ''}">Original</button><button data-image-crop-aspect="1" class="${crop.shape !== 'circle' ? active(1) : ''}">Square</button><button data-image-crop-aspect="circle" class="${crop.shape === 'circle' ? 'active' : ''}">Circle</button><button data-image-crop-aspect="1.333333" class="${crop.shape !== 'circle' ? active(1.333333) : ''}">4:3</button><button data-image-crop-aspect="1.777778" class="${crop.shape !== 'circle' ? active(1.777778) : ''}">16:9</button></div></div><div class="image-crop-header-title">Crop image</div><div class="image-crop-header-right"><button data-image-crop-cancel>Cancel</button><button class="image-crop-save" data-image-crop-apply>Save</button></div></div><div class="image-crop-stage-wrap"><div class="image-crop-stage" data-image-crop-stage><img class="image-crop-stage-image" data-image-crop-source ${runtime.imageSourceAttributes(block.src)} alt=""><div class="image-crop-frame" data-image-crop-frame><button class="image-crop-handle corner nw" data-image-crop-handle="nw" aria-label="Resize crop"></button><button class="image-crop-handle edge n" data-image-crop-handle="n" aria-label="Resize crop"></button><button class="image-crop-handle corner ne" data-image-crop-handle="ne" aria-label="Resize crop"></button><button class="image-crop-handle edge e" data-image-crop-handle="e" aria-label="Resize crop"></button><button class="image-crop-handle corner se" data-image-crop-handle="se" aria-label="Resize crop"></button><button class="image-crop-handle edge s" data-image-crop-handle="s" aria-label="Resize crop"></button><button class="image-crop-handle corner sw" data-image-crop-handle="sw" aria-label="Resize crop"></button><button class="image-crop-handle edge w" data-image-crop-handle="w" aria-label="Resize crop"></button></div><div class="image-crop-stage-hint">Drag to reposition</div></div></div></div></div>`,
    );
  }

  function imageHTML(block, gutter) {
    const caption = runtime.escapeHtml(block.caption || '');
    const linkEditor = runtime.imageLinkEditorHTML(block);
    if (!block.src) {
      return runtime.htmlWithStyles(
        `<div class="block-row image-block" data-block-id="${block.id}" data-type="image">${gutter}<div class="image-block-body"><div class="image-empty"><div class="image-empty-icon">${runtime.iconMarkup('image', '24px')}</div><div class="image-empty-copy"><div class="image-empty-title">Add an image</div><div class="image-empty-sub">Upload from your device or embed with a link.</div></div><div class="image-buttons"><button class="image-action-btn" data-image-upload>Upload</button><button class="image-action-btn" data-image-url>Embed link</button></div></div>${linkEditor}</div></div>`,
      );
    }
    const width = runtime.imageDisplayWidth(block),
      align = runtime.imageAlignment(block),
      crop = runtime.normalizedImageCrop(block);
    const widthStyle = width ? ` style="width:${width}px"` : '';
    const cropClass = crop.enabled
      ? ` crop-active${crop.shape === 'circle' ? ' crop-circle' : ''}`
      : '';
    const previewStyle = crop.enabled
      ? ` style="aspect-ratio:${crop.aspect};${crop.shape === 'circle' ? 'border-radius:50%;clip-path:circle(50% at 50% 50%);-webkit-clip-path:circle(50% at 50% 50%);' : ''}"`
      : '';
    const imgStyle = crop.enabled
      ? ` style="object-position:${crop.x}% ${crop.y}%;transform:scale(${crop.zoom});${crop.shape === 'circle' ? 'border-radius:50%;' : ''}"`
      : '';
    const captionVisible =
      block.showCaption !== false && (block.showCaption === true || !!String(block.caption || ''));
    const cropOpen = runtime.activeImageCropBlockId === block.id;
    return runtime.htmlWithStyles(
      `<div class="block-row image-block" data-block-id="${block.id}" data-type="image">${gutter}<div class="image-block-body"><figure class="image-figure align-${align}"><div class="image-preview-shell${cropOpen ? ' image-ui-open' : ''}"${widthStyle}><div class="image-toolbar"><button class="image-tool-btn" data-image-align title="Alignment">${runtime.imageToolIcon('align')}</button><button class="image-tool-btn${captionVisible ? ' active' : ''}" data-image-caption-toggle title="Caption">${runtime.imageToolIcon('caption')}</button><button class="image-tool-btn${crop.enabled ? ' active' : ''}" data-image-crop title="Crop">${runtime.imageToolIcon('crop')}</button><div class="image-toolbar-sep"></div><button class="image-tool-btn" data-image-download title="Download">${runtime.imageToolIcon('download')}</button></div><div class="image-align-toolbar hidden" data-image-align-menu><button class="image-tool-btn${align === 'left' ? ' active' : ''}" data-image-align-choice="left" title="Align left">${runtime.imageToolIcon('left')}</button><button class="image-tool-btn${align === 'center' ? ' active' : ''}" data-image-align-choice="center" title="Align center">${runtime.imageToolIcon('center')}</button><button class="image-tool-btn${align === 'right' ? ' active' : ''}" data-image-align-choice="right" title="Align right">${runtime.imageToolIcon('right')}</button></div>${runtime.imageCropPanelHTML(block)}<button class="image-resize-handle left" data-image-resize="left" aria-label="Resize image"></button><div class="image-preview${cropClass}"${previewStyle}><img ${runtime.imageSourceAttributes(block.src)} alt="${runtime.escapeHtml(block.alt || block.caption || 'Image')}" loading="lazy" decoding="async"${imgStyle}></div><button class="image-resize-handle right" data-image-resize="right" aria-label="Resize image"></button>${captionVisible ? `<figcaption class="image-caption" contenteditable="true" data-image-caption data-placeholder="Write a caption…">${caption}</figcaption>` : ''}</div>${linkEditor}</figure></div></div>`,
    );
  }

  Object.assign(runtime, {
    attachmentIcon,
    formatAttachmentSize,
    attachmentRelativePath,
    isImageAttachment,
    renderAttachmentsGallery,
    openAttachmentPreview,
    closeAttachmentPreview,
    invalidateAttachmentList,
    refreshAttachmentList,
    renderAttachmentsView,
    selectAttachmentForBacklinks,
    copyAttachmentToClipboard,
    deleteAttachmentFromGallery,
    cleanupUnusedAttachments,
    imageLinkEditorHTML,
    openImageBlockPreview,
    fitImageBlockViewer,
    toggleImageBlockViewerZoom,
    zoomImageBlockViewer,
    onImageBlockViewerWheel,
    startImageBlockViewerPan,
    moveImageBlockViewerPan,
    endImageBlockViewerPan,
    consumeImageBlockViewerDragClick,
    imageToolIcon,
    imageDisplayWidth,
    imageAlignment,
    normalizedImageCrop,
    downloadImageBlock,
    startImageResize,
    setImageAlignment,
    toggleImageCaption,
    openImageCrop,
    applyImageCropPreview,
    updateImageCropControl,
    setImageCropAspect,
    scheduleImageCropDialogLayout,
    cropDialogGeometry,
    cropMaxFit,
    layoutImageCropDialog,
    updateCropFromDialogFrame,
    startImageCropFrameMove,
    startImageCropFrameResize,
    resetImageCrop,
    applyImageCrop,
    cancelImageCrop,
    imageSourceAttributes,
    clearAttachmentObjectUrls,
    hydrateAttachmentImages,
    imageCropPanelHTML,
    imageHTML,
    selectImageBlock,
    clearSelectedImageBlock,
    copySelectedImageBlockToClipboard,
    cutSelectedImageBlock,
    deleteSelectedImageBlock,
    pasteCopiedImageBlock,
  });
}

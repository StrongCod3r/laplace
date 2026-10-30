import type { ControllerLifecycle } from '@/shared/lib/controller-lifecycle';
import type { StorageGateway } from '@/storage';
import type { Block, Note, WorkspaceAccess, WorkspaceDocument } from '@/features/workspace/types';
import type { FileBlock } from './file-markdown';

interface FileBlockRuntime {
  lifecycle: ControllerLifecycle;
  state: WorkspaceDocument;
  workspaceAccess: WorkspaceAccess;
  activeVaultId: string | null;
  lastSyncedWorkspace: unknown;
  gitOperationActive: boolean;
  attachmentCacheGeneration: number;
  pageOperationEpoch: number;
  attachmentListLoaded: boolean;
  localStorageGateway: StorageGateway;
  els: { blockEditor: HTMLElement };
  workspaceLocationKey(): string;
  queueStorageWrite<T>(write: () => Promise<T>): Promise<T>;
  currentPage(): Note | null;
  findBlock(id: string): Block | null;
  findBlockLocation(id: string): { block: Block; blocks: Block[]; index: number } | null;
  uid(prefix: string): string;
  safeFileSegment(name: string): string;
  escapeHtml(value: string): string;
  iconMarkup(name: string, size: string): string;
  htmlWithStyles(html: string): string;
  scheduleSave(): void;
  renderBlocks(page: Note): void;
  toast(message: string): void;
}

export function createFileBlocks(runtime: FileBlockRuntime) {
  const busy = new Set<string>();
  const context = (id: string) => ({
    workspace: runtime.state,
    vault: runtime.activeVaultId,
    location: runtime.workspaceLocationKey(),
    group: runtime.state.activeEditorGroupId,
    page: runtime.currentPage(),
    epoch: runtime.pageOperationEpoch,
    block: runtime.findBlock(id),
    original: JSON.stringify(runtime.findBlock(id)),
  });
  const valid = (target: ReturnType<typeof context>, writable = true) =>
    !runtime.lifecycle.disposed &&
    runtime.state === target.workspace &&
    runtime.activeVaultId === target.vault &&
    runtime.workspaceLocationKey() === target.location &&
    runtime.state.activeEditorGroupId === target.group &&
    runtime.currentPage() === target.page &&
    runtime.pageOperationEpoch === target.epoch &&
    !!target.block &&
    runtime.findBlock(target.block.id) === target.block &&
    JSON.stringify(target.block) === target.original &&
    (!writable ||
      (runtime.workspaceAccess === 'writable' &&
        !!runtime.lastSyncedWorkspace &&
        !!runtime.activeVaultId &&
        !runtime.gitOperationActive));

  const html = (block: FileBlock, gutter: string) => {
    const escape = runtime.escapeHtml;
    const disabled =
      runtime.workspaceAccess !== 'writable' || runtime.gitOperationActive || busy.has(block.id);
    const input = `<input type="file" data-file-input multiple hidden ${disabled ? 'disabled' : ''}>`;
    const button = (action: string, label: string) =>
      `<button type="button" data-file-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`;
    const body = block.src
      ? `<div class="file-copy"><div class="file-name">${escape(block.fileLabel || block.fileName || 'File')}</div><div class="file-meta" data-file-meta role="status">Loading file…</div></div><button type="button" data-file-action="download" aria-label="Download file">${runtime.iconMarkup('download', '16px')}<span>Download</span></button><details class="file-menu"><summary aria-label="File options">${runtime.iconMarkup('ellipsis', '16px')}</summary><div class="file-menu-body"><label>Display name<input data-file-label aria-label="File display name" value="${escape(block.fileLabel || block.fileName || '')}" ${disabled ? 'disabled' : ''}></label>${button('rename', 'Save name')}${button('upload', 'Replace file')}${button('remove', 'Remove block')}</div></details>`
      : `<div class="file-copy"><div class="file-name">${busy.has(block.id) ? 'Saving files…' : 'Add a file'}</div><div class="file-meta">Drop files here or upload from your device.</div></div>${button('upload', 'Upload file')}`;
    return runtime.htmlWithStyles(
      `<div class="block-row file-block" data-block-id="${escape(block.id)}" data-type="file">${gutter}<div class="file-card${block.src ? '' : ' file-empty'}" data-file-card data-file-source="${escape(block.src || '')}" ${busy.has(block.id) ? 'aria-busy="true"' : ''}><span class="file-icon" aria-hidden="true">${runtime.iconMarkup('file', '24px')}</span>${body}${input}</div></div>`,
    );
  };

  const hydrate = (root: HTMLElement) => {
    const generation = runtime.attachmentCacheGeneration;
    const workspace = runtime.state;
    const location = runtime.workspaceLocationKey();
    root.querySelectorAll<HTMLElement>('[data-file-card][data-file-source]').forEach((card) => {
      const src = card.dataset.fileSource;
      if (!src) return;
      const meta = card.querySelector<HTMLElement>('[data-file-meta]');
      const download = card.querySelector<HTMLButtonElement>('[data-file-action="download"]');
      void runtime.localStorageGateway
        .readAttachment(src)
        .then((blob) => {
          if (
            !card.isConnected ||
            runtime.lifecycle.disposed ||
            runtime.state !== workspace ||
            runtime.workspaceLocationKey() !== location ||
            generation !== runtime.attachmentCacheGeneration
          )
            return;
          if (download) download.disabled = !blob;
          if (!meta) return;
          if (!blob) {
            meta.textContent = 'File not found';
            return;
          }
          const extension = src.split('.').at(-1)?.toUpperCase() || 'FILE';
          const size =
            blob.size < 1024
              ? `${blob.size} B`
              : blob.size < 1024 ** 2
                ? `${(blob.size / 1024).toFixed(1)} KB`
                : `${(blob.size / 1024 ** 2).toFixed(1)} MB`;
          meta.textContent = `${extension} · ${size}`;
        })
        .catch(() => {
          if (card.isConnected && runtime.state === workspace && meta)
            meta.textContent = 'Could not read file';
        });
    });
  };

  const upload = async (files: File[], id: string, target = context(id)) => {
    if (!files.length || !valid(target) || target.block?.type !== 'file' || busy.has(id)) return;
    busy.add(id);
    runtime.renderBlocks(target.page!);
    try {
      const saved: FileBlock[] = [];
      await runtime.queueStorageWrite(async () => {
        for (const file of files) {
          if (!valid(target)) return;
          const name = runtime.safeFileSegment(file.name || 'file');
          // A fresh ID keeps replacements and duplicate filenames from overwriting earlier assets.
          const path = `.attachments/${runtime.uid('asset')}-${name}`;
          const src = await runtime.localStorageGateway.writeAttachment(path, file);
          if (!valid(target)) return;
          saved.push({
            id: runtime.uid('b'),
            type: 'file',
            src,
            fileName: file.name || 'file',
            fileLabel: file.name || 'file',
          });
        }
        if (!valid(target) || saved.length !== files.length) return;
        const location = runtime.findBlockLocation(id);
        if (!location) return;
        const first = saved.shift()!;
        const old = target.block as FileBlock;
        if (old.fileLabel && old.fileLabel !== old.fileName) first.fileLabel = old.fileLabel;
        Object.assign(old, first, { id });
        location.blocks.splice(location.index + 1, 0, ...saved);
        runtime.attachmentListLoaded = false;
        runtime.scheduleSave();
      });
    } catch (error) {
      if (valid(target))
        runtime.toast(error instanceof Error ? error.message : 'Could not save those files.');
    } finally {
      busy.delete(id);
      if (
        !runtime.lifecycle.disposed &&
        runtime.state === target.workspace &&
        runtime.currentPage() === target.page
      )
        runtime.renderBlocks(target.page!);
    }
  };

  const openPicker = (id: string, row: HTMLElement) => {
    const target = context(id);
    if (!valid(target) || busy.has(id)) return;
    const input = row.querySelector<HTMLInputElement>('[data-file-input]');
    if (!input) return;
    input.value = '';
    input.onchange = () => {
      void upload(Array.from(input.files || []), id, target);
    };
    input.click();
  };

  const download = async (id: string) => {
    const target = context(id);
    const block = target.block as FileBlock | null;
    if (block?.type !== 'file' || !block.src) return;
    try {
      const blob = await runtime.localStorageGateway.readAttachment(block.src);
      if (!valid(target, false)) return;
      if (!blob) {
        runtime.toast('File not found');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = block.fileName || block.src.split('/').at(-1) || 'file';
      document.body.append(link);
      link.click();
      link.remove();
      // Revoke even when the controller is disposed immediately after starting the download.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (valid(target, false))
        runtime.toast(error instanceof Error ? error.message : 'Could not download that file.');
    }
  };

  const action = (id: string, action: string, row: HTMLElement) => {
    if (action === 'download') {
      void download(id);
      return;
    }
    if (action === 'upload') {
      openPicker(id, row);
      return;
    }
    const target = context(id);
    if (!valid(target) || busy.has(id)) return;
    if (action === 'rename') {
      const input = row.querySelector<HTMLInputElement>('[data-file-label]');
      if (!input) return;
      (target.block as FileBlock).fileLabel =
        input.value.trim() || (target.block as FileBlock).fileName;
    } else if (action === 'remove') {
      const location = runtime.findBlockLocation(id);
      if (!location) return;
      location.blocks.splice(location.index, 1);
    } else return;
    runtime.scheduleSave();
    runtime.renderBlocks(target.page!);
  };

  return { html, hydrate, upload, action };
}

import type { Block } from '@/features/workspace/types';

export interface FileBlock extends Block {
  type: 'file';
  src: string;
  fileName: string;
  fileLabel: string;
}

/** Only an adjacent, supported marker turns an ordinary local link into a File block. */
export function parseFileMarkdown(
  line: string,
  comment: string,
  normalizePath: (value: string) => string,
): Omit<FileBlock, 'id'> | null {
  const marker = comment.trim().match(/^<!--\s*laplace:file:\s*(\{.*\})\s*-->$/);
  const link = line.trim().match(/^\[((?:\\.|[^\]\\])*)\]\(([^\s]*)\)$/);
  if (!marker || !link) return null;
  try {
    const metadata = JSON.parse(marker[1]);
    if (
      metadata.version !== 1 ||
      Object.keys(metadata).some((key) => !['version', 'name'].includes(key)) ||
      (metadata.name !== undefined && typeof metadata.name !== 'string')
    )
      return null;
    const raw = link[2].replace(/\\([\\()])/g, '$1');
    const src = raw ? normalizePath(raw) : '';
    if (raw && !src.startsWith('.attachments/')) return null;
    const label = link[1].replace(/\\([\\\[\]`*_<>])/g, '$1').replace(/&amp;/g, '&');
    return {
      type: 'file',
      src,
      fileName: metadata.name || label || src.split('/').at(-1) || '',
      fileLabel: label || '',
    };
  } catch {
    return null;
  }
}

export function fileBlockMarkdown(block: FileBlock): string {
  const label = String(block.fileLabel || block.fileName || 'File')
    .replace(/&/g, '&amp;')
    .replace(/[\\\[\]`*_<>]/g, (value) => `\\${value}`)
    .replace(/[\r\n]/g, ' ');
  const path = String(block.src || '')
    .split('/')
    .map(encodeURIComponent)
    .join('/')
    .replace(/[()]/g, (value) => `\\${value}`);
  const metadata = {
    version: 1,
    ...(block.fileName && block.fileName !== (block.fileLabel || block.fileName)
      ? { name: block.fileName }
      : {}),
  };
  // A filename containing a comment terminator must not terminate the metadata early.
  const json = JSON.stringify(metadata).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  return `[${label}](${path})\n<!-- laplace:file: ${json} -->`;
}

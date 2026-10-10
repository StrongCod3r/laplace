import type { Note } from '@/features/workspace/types';
import type { AttachmentReference } from '@/features/attachments/types';
import { attachmentReferenceSources } from './unused-attachments';

/** Resolve stored sources, Markdown links and HTML media against actual vault assets. */
export function attachmentReferences(
  pages: Note[],
  assets: { path: string }[],
  normalize: (path: string) => string,
): Map<string, Map<string, AttachmentReference>> {
  const references = new Map<string, Map<string, AttachmentReference>>();
  const paths = new Set(assets.map((asset) => normalize(asset.path)));
  const byName = new Map<string, string[]>();
  for (const path of paths) {
    const name = path.split('/').at(-1)!;
    byName.set(name, [...(byName.get(name) || []), path]);
  }
  for (const page of pages) {
    const resolve = (value: string): string | undefined => {
      let target = value
        .trim()
        .replace(/^<|>$/g, '')
        .replace(/\\([\\()[\] "'])/g, '$1');
      // Older imports incorrectly added https:// to these vault-local links.
      target = target.replace(/^https?:\/\/(\.attachments|attachments)\//i, '$1/');
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) return;
      target = target.split(/[?#]/)[0];
      try {
        target = decodeURIComponent(target);
      } catch {
        /* Keep literal filenames. */
      }
      target = target.replace(/&amp;/g, '&').replace(/\\/g, '/');
      const direct = normalize(target);
      if (paths.has(direct)) return direct;
      const parts = (page.filePath || '').split('/').slice(0, -1);
      for (const part of target.split('/')) {
        if (part === '..') parts.pop();
        else if (part && part !== '.') parts.push(part);
      }
      const relative = normalize(parts.join('/'));
      if (paths.has(relative)) return relative;
      const matches = !target.includes('/') ? byName.get(target) : undefined;
      if (matches?.length === 1) return matches[0];
    };
    const add = (target: string) => {
      const path = resolve(target);
      if (!path) return;
      let pageReferences = references.get(path);
      if (!pageReferences) references.set(path, (pageReferences = new Map()));
      const existing = pageReferences.get(page.id);
      if (existing) existing.count++;
      else
        pageReferences.set(page.id, { pageId: page.id, title: page.title || 'Untitled', count: 1 });
    };
    for (const source of attachmentReferenceSources({ blocks: page.blocks, icon: page.icon })) {
      if (resolve(source)) {
        add(source);
        continue;
      }
      for (const match of source.matchAll(
        /!?\[\[([^\]\n]+)\]\]|!?\[[^\]\n]*\]\(\s*(<[^>]+>|(?:\\.|[^\s)])+)\s*(?:["'][^\n]*?["']\s*)?\)|\b(?:src|href)\s*=\s*["']([^"']+)["']/g,
      )) {
        add(match[1]?.split('|')[0] || match[2] || match[3]);
      }
    }
  }
  return references;
}

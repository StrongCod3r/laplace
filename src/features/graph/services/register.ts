// @ts-nocheck
// Existing editor algorithms, isolated behind the typed controller boundary.
import type { EditorRuntime } from '@/features/editor/types';
import { createPageGraph } from './model';

export function registerGraph(runtime: EditorRuntime) {
  function wikiTitleKey(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase();
  }

  function blockSearchKey(value) {
    return String(value ?? '')
      .normalize('NFKC')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase()
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function blockTypeMatchesQuery(blockType, query) {
    const key = runtime.blockSearchKey(query);
    if (!key) return true;
    const words = runtime
      .blockSearchKey([blockType.name, blockType.desc, blockType.type].filter(Boolean).join(' '))
      .split(' ')
      .filter(Boolean);
    return key.split(' ').every((token) => words.some((word) => word.startsWith(token)));
  }

  function blockTypeSearchRank(blockType, query) {
    const key = runtime.blockSearchKey(query),
      name = runtime.blockSearchKey(blockType.name),
      type = runtime.blockSearchKey(blockType.type);
    if (!key) return 0;
    if (name === key) return 0;
    if (name.startsWith(key)) return 1;
    if (type === key || type.startsWith(key)) return 2;
    return 3;
  }

  function pageByTitle(title) {
    const key = runtime.wikiTitleKey(title);
    if (!key) return null;
    if (key.includes('/')) {
      const targetPath = runtime
          .normalizeFolderPath(title)
          .replace(/\.md$/i, '')
          .toLocaleLowerCase(),
        paths = new Map(),
        used = new Set();
      for (const page of runtime.state.pages)
        runtime.filePathForWorkspacePage(page, runtime.state, paths, new Set(), used);
      const matched = runtime.state.pages.find(
        (page) =>
          String(paths.get(page.id) || '')
            .replace(/\.md$/i, '')
            .toLocaleLowerCase() === targetPath,
      );
      if (matched) return matched;
    }
    return (
      runtime.state.pages.find((page) => runtime.wikiTitleKey(page.title || 'Untitled') === key) ||
      null
    );
  }

  function wikiLinksInText(text) {
    const source = String(text || ''),
      links = [];
    const re = /\[\[([^\]\n]+?)\]\]/g;
    let match;
    while ((match = re.exec(source))) {
      const body = String(match[1] || '');
      const pipe = body.indexOf('|');
      const targetSpec = (pipe >= 0 ? body.slice(0, pipe) : body).trim();
      const label = (pipe >= 0 ? body.slice(pipe + 1) : targetSpec).trim();
      const hash = targetSpec.indexOf('#');
      const title = (hash >= 0 ? targetSpec.slice(0, hash) : targetSpec).trim();
      if (!title) continue;
      const target = runtime.pageByTitle(title);
      links.push({
        start: match.index,
        end: match.index + match[0].length,
        raw: match[0],
        title,
        label: label || title,
        pageId: target?.id || null,
      });
    }
    return links;
  }

  function linkedPageIdsFromPage(page) {
    const ids = [];
    for (const block of runtime.flattenBlocks(page?.blocks || [])) {
      if ((block?.type === 'page' || block?.type === 'page-link') && runtime.pageById(block.pageId))
        ids.push(block.pageId);
      for (const link of runtime.inlineLinksForBlock(block))
        if (link.pageId && runtime.pageById(link.pageId)) ids.push(link.pageId);
      for (const link of runtime.wikiLinksInText(`${block?.text || ''}\n${block?.caption || ''}`))
        if (link.pageId) ids.push(link.pageId);
    }
    return ids;
  }

  function pageLinkCountTo(page, targetId) {
    return runtime.linkedPageIdsFromPage(page).filter((id) => id === targetId).length;
  }

  function pagesLinkingTo(targetId) {
    return runtime.state.pages.filter(
      (page) => page.id !== targetId && runtime.pageLinkCountTo(page, targetId) > 0,
    );
  }

  function buildPageGraph() {
    const folderNotes = new Map();
    if (runtime.state.folderNotesEnabled) {
      for (const page of runtime.state.pages) {
        const folder = runtime.representedFolderForPage(page);
        if (folder) folderNotes.set(folder.path, page.id);
      }
    }
    const pageIds = new Set(runtime.state.pages.map((page) => page.id));
    const parentFor = (page) => {
      if (page.parentId && pageIds.has(page.parentId)) return page.parentId;
      let path = runtime.pageFolderPath(page);
      while (path) {
        const parentId = folderNotes.get(path);
        if (parentId && parentId !== page.id) return parentId;
        path = runtime.folderParentPath(path);
      }
      return null;
    };
    const nodes = runtime.state.pages.map((page) => ({
      id: page.id,
      title: page.title || 'Untitled',
      current: page.id === runtime.state.currentPageId,
      parentId: parentFor(page),
    }));
    const nodeIds = new Set(nodes.map((node) => node.id)),
      seen = new Set(),
      edges = [];
    for (const page of runtime.state.pages) {
      for (const targetId of runtime.linkedPageIdsFromPage(page)) {
        if (!nodeIds.has(targetId) || targetId === page.id) continue;
        const key = `${page.id}>${targetId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ source: page.id, target: targetId });
      }
    }
    return createPageGraph(nodes, edges);
  }

  function renderGraphView() {
    runtime.els.editorDock?.classList.add('hidden');
    runtime.bindEditorElements(null);
    runtime.els.editorView.classList.add('hidden');
    runtime.els.homeView.classList.add('hidden');
    runtime.els.graphView?.classList.remove('hidden');
    runtime.els.attachmentsView?.classList.add('hidden');
    runtime.closeAttachmentPreview();
    runtime.els.breadcrumbs.innerHTML = runtime.htmlWithStyles(
      `${runtime.navigationHistoryButtonsMarkup()}<span class="crumb">Graph view</span>`,
    );
    runtime.publish();
  }

  function openWikiLink(pageId, title, { newTab = false } = {}) {
    let target = pageId ? runtime.pageById(pageId) : runtime.pageByTitle(title);
    if (!target) {
      const clean = String(title || '').trim();
      if (!clean) return;
      target = {
        id: runtime.uid('page'),
        parentId: null,
        title: clean,
        favorite: false,
        expanded: true,
        blocks: [runtime.newTextBlock()],
      };
      runtime.state.pages.push(target);
      runtime.toast(`Created ${clean}`);
    }
    runtime.state.mainView = 'page';
    runtime.openPage(target.id, { newTab });
  }

  Object.assign(runtime, {
    wikiTitleKey,
    blockSearchKey,
    blockTypeMatchesQuery,
    blockTypeSearchRank,
    pageByTitle,
    wikiLinksInText,
    linkedPageIdsFromPage,
    pageLinkCountTo,
    pagesLinkingTo,
    buildPageGraph,
    renderGraphView,
    openWikiLink,
  });
}

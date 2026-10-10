// @ts-nocheck
// Existing editor algorithms, isolated behind the typed controller boundary.
import type { EditorRuntime } from '@/features/editor/types';

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
    const nodes = runtime.state.pages.map((page) => ({
      id: page.id,
      title: page.title || 'Untitled',
      icon: runtime.pageIconFor(page),
      current: page.id === runtime.state.currentPageId,
      degree: 0,
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
    const degree = new Map(nodes.map((node) => [node.id, 0]));
    for (const edge of edges) {
      degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
    }
    for (const node of nodes) node.degree = degree.get(node.id) || 0;
    return { nodes, edges };
  }

  function graphLayout(graph) {
    const W = 1000,
      H = 700,
      cx = W / 2,
      cy = H / 2,
      n = graph.nodes.length;
    const positions = new Map();
    if (!n) return positions;
    const radius = Math.min(280, 95 + Math.sqrt(n) * 29);
    graph.nodes.forEach((node, index) => {
      const angle = (index / n) * Math.PI * 2 - Math.PI / 2;
      const ring = radius * (0.7 + 0.3 * ((index % 5) / 4));
      positions.set(node.id, {
        x: cx + Math.cos(angle) * ring,
        y: cy + Math.sin(angle) * ring,
        vx: 0,
        vy: 0,
      });
    });
    const byId = new Map(graph.nodes.map((node, index) => [node.id, index]));
    const iterations = n > 250 ? 24 : n > 120 ? 48 : 110;
    for (let step = 0; step < iterations; step++) {
      const force = graph.nodes.map(() => ({ x: 0, y: 0 }));
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const a = positions.get(graph.nodes[i].id),
            b = positions.get(graph.nodes[j].id);
          let dx = a.x - b.x,
            dy = a.y - b.y,
            d2 = dx * dx + dy * dy;
          if (d2 < 4) {
            dx = (i - j) * 0.7;
            dy = (j - i) * 0.55;
            d2 = dx * dx + dy * dy;
          }
          const dist = Math.sqrt(d2),
            strength = Math.min(4.5, 5200 / d2);
          const fx = (dx / dist) * strength,
            fy = (dy / dist) * strength;
          force[i].x += fx;
          force[i].y += fy;
          force[j].x -= fx;
          force[j].y -= fy;
        }
      for (const edge of graph.edges) {
        const ai = byId.get(edge.source),
          bi = byId.get(edge.target);
        if (ai == null || bi == null) continue;
        const a = positions.get(edge.source),
          b = positions.get(edge.target),
          dx = b.x - a.x,
          dy = b.y - a.y,
          dist = Math.max(1, Math.hypot(dx, dy));
        const spring = (dist - 145) * 0.012,
          fx = (dx / dist) * spring,
          fy = (dy / dist) * spring;
        force[ai].x += fx;
        force[ai].y += fy;
        force[bi].x -= fx;
        force[bi].y -= fy;
      }
      graph.nodes.forEach((node, i) => {
        const p = positions.get(node.id),
          f = force[i];
        f.x += (cx - p.x) * 0.004;
        f.y += (cy - p.y) * 0.004;
        p.vx = (p.vx + f.x) * 0.82;
        p.vy = (p.vy + f.y) * 0.82;
        p.x = Math.max(35, Math.min(W - 35, p.x + p.vx));
        p.y = Math.max(30, Math.min(H - 30, p.y + p.vy));
      });
    }
    return positions;
  }

  function graphTransform() {
    const { scale, panX, panY } = runtime.graphViewRuntime;
    return `translate(${500 * (1 - scale) + panX} ${350 * (1 - scale) + panY}) scale(${scale})`;
  }

  function applyGraphTransform() {
    const viewport = runtime.els.graphView?.querySelector('[data-graph-viewport]');
    if (viewport) viewport.setAttribute('transform', runtime.graphTransform());
  }

  function setGraphZoom(next) {
    runtime.graphViewRuntime.scale = Math.max(0.55, Math.min(2.4, Number(next) || 1));
    runtime.applyGraphTransform();
  }

  function setGraphPan(x, y) {
    runtime.graphViewRuntime.panX = x;
    runtime.graphViewRuntime.panY = y;
    runtime.applyGraphTransform();
  }

  function applyGraphSearch(value) {
    const query = runtime.wikiTitleKey(value),
      root = runtime.els.graphView;
    if (!root) return;
    const matches = new Set();
    root.querySelectorAll('[data-graph-page]').forEach((node) => {
      const match = !query || runtime.wikiTitleKey(node.dataset.graphTitle).includes(query);
      node.classList.toggle('dim', !match);
      if (match) matches.add(node.dataset.graphPage);
    });
    root.querySelectorAll('[data-graph-edge]').forEach((edge) => {
      const dim =
        !!query && !matches.has(edge.dataset.graphSource) && !matches.has(edge.dataset.graphTarget);
      edge.classList.toggle('dim', dim);
    });
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
    const graph = runtime.buildPageGraph(),
      positions = runtime.graphLayout(graph);
    const pos = (id) => positions.get(id) || { x: 500, y: 350 };
    const edges = graph.edges
      .map((edge) => {
        const a = pos(edge.source),
          b = pos(edge.target);
        return runtime.htmlWithStyles(
          `<line class="graph-edge" data-graph-edge data-graph-source="${edge.source}" data-graph-target="${edge.target}" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"></line>`,
        );
      })
      .join('');
    const nodes = graph.nodes
      .map((node) => {
        const p = pos(node.id),
          r = Math.min(15, 6 + Math.sqrt(node.degree) * 2.1);
        return runtime.htmlWithStyles(
          `<g class="graph-node ${node.current ? 'current' : ''}" data-graph-page="${node.id}" data-graph-title="${runtime.escapeHtml(node.title)}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})" tabindex="0" role="button" aria-label="Open ${runtime.escapeHtml(node.title)}"><circle r="${r.toFixed(1)}"></circle><text x="${(r + 6).toFixed(1)}" y="4">${runtime.escapeHtml(node.title)}</text></g>`,
        );
      })
      .join('');
    runtime.publish();

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
    graphLayout,
    graphTransform,
    applyGraphTransform,
    setGraphZoom,
    setGraphPan,
    applyGraphSearch,
    renderGraphView,
    openWikiLink,
  });
}

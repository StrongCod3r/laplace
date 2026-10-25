import ForceGraph, { type NodeObject, type LinkObject } from 'force-graph';
import { forceCollide, forceLink, forceManyBody } from 'd3-force';
import type { GraphModel, GraphNode } from '../types';
import { GraphFamilyColors } from './family-colors';
import { createFamilyRegions, graphNodeRadius as radius } from './family-regions';
import { separateGraphFamilies } from './family-collision';

type SceneNode = GraphNode & NodeObject;
type SceneLink = LinkObject<SceneNode> & {
  source: string | number | SceneNode;
  target: string | number | SceneNode;
  kind: 'link' | 'hierarchy';
};

/** Keeps mutable library data and canvas state outside the workspace document. */
export class GraphScene {
  private graph: ForceGraph<SceneNode, SceneLink>;
  private resizeObserver: ResizeObserver;
  private themeObserver: MutationObserver;
  private active = false;
  private disposed = false;
  private initialCamera = true;
  private topology = '';
  private familyColors = new GraphFamilyColors();
  private query = '';
  private selected: SceneNode | null = null;
  private hovered: SceneNode | null = null;
  private text = '#888';
  private background = '#222';
  private muted = '#777';
  private accent = '#789';
  private middleDown: { node: SceneNode; x: number; y: number } | null = null;

  constructor(
    private host: HTMLElement,
    private openPage: (id: string) => void,
    zoomLabel: HTMLOutputElement | null,
  ) {
    this.graph = new ForceGraph<SceneNode, SceneLink>(host)
      .width(1)
      .height(1)
      .minZoom(0.05)
      .maxZoom(8)
      .nodeRelSize(1)
      .nodeVal((node) => radius(node) ** 2)
      .nodeLabel((node) => {
        const label = document.createElement('span');
        label.textContent = node.title || 'Untitled';
        return label;
      })
      .nodeCanvasObjectMode(() => 'after')
      .nodeCanvasObject(this.paintLabel)
      .nodeColor(this.nodeColor)
      .onRenderFramePre(this.paintFamilies)
      .linkColor(this.linkColor)
      .linkWidth((link) => (link.kind === 'hierarchy' ? 1.5 : 0.8))
      .linkLineDash((link) => (link.kind === 'link' ? [4, 4] : null))
      .onNodeHover((node) => {
        this.hovered = node;
        this.refresh();
      })
      .onNodeClick((node, event) => {
        this.selected = node;
        this.refresh();
        if (event.ctrlKey || event.metaKey) this.openPage(node.id);
      })
      .onNodeDrag(() => separateGraphFamilies(this.graph.graphData().nodes))
      .onZoom(({ k }) => {
        if (zoomLabel) zoomLabel.textContent = `${Math.round(k * 100)}%`;
      })
      .warmupTicks(100)
      .cooldownTicks(220)
      .onEngineTick(() => {
        separateGraphFamilies(this.graph.graphData().nodes);
        // Fit the warmed layout before its first paint, then preserve the user's camera.
        if (
          this.initialCamera &&
          this.active &&
          this.host.clientWidth &&
          this.host.clientHeight &&
          this.graph.graphData().nodes.length
        ) {
          this.fit();
        }
      });
    this.graph.d3Force('center', null);
    this.graph.d3Force('charge', forceManyBody<SceneNode>().strength(-140).distanceMax(650));
    this.graph.d3Force(
      'link',
      forceLink<SceneNode, SceneLink>()
        .id((node) => node.id)
        .distance((link) => (link.kind === 'hierarchy' ? 95 : 140)),
    );
    this.graph.d3Force(
      'collide',
      forceCollide<SceneNode>((node) => radius(node) + 14).iterations(3),
    );
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(host);
    this.themeObserver = new MutationObserver(this.updateTheme);
    for (const target of [document.documentElement, document.body]) {
      this.themeObserver.observe(target, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-theme'],
      });
    }
    this.updateTheme();
    host.addEventListener('keydown', this.onKeyDown);
    host.addEventListener('mousedown', this.onMouseDown, true);
    host.addEventListener('auxclick', this.onAuxClick);
    document.addEventListener('visibilitychange', this.updateActivity);
    this.updateActivity();
  }

  setGraph(model: GraphModel) {
    this.familyColors.update(model.nodes.filter((node) => node.degree).map((node) => node.rootId));
    const previous = new Map(this.graph.graphData().nodes.map((node) => [node.id, node]));
    // D3 adds coordinates and replaces link IDs with node objects, so always copy inputs.
    const nodes = model.nodes.map(
      (node) => Object.assign(previous.get(node.id) || {}, node) as SceneNode,
    );
    const topology = JSON.stringify([nodes.map((node) => node.id), model.edges]);
    if (topology !== this.topology) {
      this.topology = topology;
      this.graph.graphData({ nodes, links: model.edges.map((edge) => ({ ...edge })) });
      if (this.selected)
        this.selected = nodes.find((node) => node.id === this.selected?.id) || null;
      this.hovered = null;
    }
    this.refresh();
    this.resize();
  }
  setActive(active: boolean) {
    this.active = active;
    this.updateActivity();
    if (active) this.resize();
  }
  search(query: string) {
    this.query = query.trim().toLocaleLowerCase();
    this.refresh();
  }
  zoom(factor: number) {
    this.initialCamera = false;
    this.graph.zoom(Math.max(0.05, Math.min(8, this.graph.zoom() * factor)), 0);
  }
  fit() {
    this.initialCamera = false;
    if (this.graph.graphData().nodes.length) {
      const nodes = this.graph.graphData().nodes;
      const bounds = this.graph.getGraphBbox();
      if (!bounds) return;
      for (const region of createFamilyRegions(nodes)) {
        bounds.x[0] = Math.min(bounds.x[0], region.x - region.radius);
        bounds.x[1] = Math.max(bounds.x[1], region.x + region.radius);
        bounds.y[0] = Math.min(bounds.y[0], region.y - region.radius);
        bounds.y[1] = Math.max(bounds.y[1], region.y + region.radius);
      }
      this.graph.centerAt((bounds.x[0] + bounds.x[1]) / 2, (bounds.y[0] + bounds.y[1]) / 2, 0);
      this.graph.zoom(
        Math.max(
          0.05,
          Math.min(
            8,
            (this.host.clientWidth - 120) / Math.max(1, bounds.x[1] - bounds.x[0]),
            (this.host.clientHeight - 120) / Math.max(1, bounds.y[1] - bounds.y[0]),
          ),
        ),
        0,
      );
    }
  }
  dispose() {
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.themeObserver.disconnect();
    this.host.removeEventListener('keydown', this.onKeyDown);
    this.host.removeEventListener('mousedown', this.onMouseDown, true);
    this.host.removeEventListener('auxclick', this.onAuxClick);
    document.removeEventListener('visibilitychange', this.updateActivity);
    this.graph._destructor();
    this.host.replaceChildren();
  }
  private updateActivity = () => {
    if (this.active && !document.hidden) this.graph.resumeAnimation();
    else this.graph.pauseAnimation();
  };
  private resize = () => {
    if (this.disposed) return;
    const { width, height } = this.host.getBoundingClientRect();
    if (width > 0 && height > 0) this.graph.width(width).height(height);
  };
  private updateTheme = () => {
    const style = getComputedStyle(this.host);
    this.text = style.getPropertyValue('--text').trim() || '#888';
    this.background = style.getPropertyValue('--workspace').trim() || '#222';
    this.muted = style.getPropertyValue('--muted').trim() || '#777';
    this.accent = style.getPropertyValue('--obsidian-accent').trim() || '#789';
    this.refresh();
  };
  private matches = (node: SceneNode) =>
    !this.query || node.title.toLocaleLowerCase().includes(this.query);
  private nodeColor = (node: SceneNode) => {
    if (!this.matches(node)) return `color-mix(in srgb, ${this.muted} 15%, transparent)`;
    if (node.current || node === this.selected || node === this.hovered) return this.accent;
    if (!node.degree) return this.muted;
    return this.familyColors.color(node.rootId) || this.muted;
  };
  private linkColor = (link: SceneLink) => {
    const visible = [link.source, link.target].some(
      (node) => typeof node === 'object' && this.matches(node),
    );
    return `color-mix(in srgb, ${link.kind === 'hierarchy' ? this.accent : this.muted} ${visible ? 45 : 8}%, transparent)`;
  };
  private paintFamilies = (ctx: CanvasRenderingContext2D, scale: number) => {
    ctx.save();
    for (const region of createFamilyRegions(this.graph.graphData().nodes)) {
      const color = this.familyColors.color(region.rootId) || this.muted;
      const matches = region.nodes.some((node) => this.matches(node));
      ctx.beginPath();
      ctx.arc(region.x, region.y, region.radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = matches ? 0.045 : 0.012;
      ctx.fill();
      ctx.globalAlpha = matches ? 0.55 : 0.1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.25 / scale;
      ctx.setLineDash([5 / scale, 5 / scale]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (scale < 0.25 || !matches) continue;
      ctx.globalAlpha = 1;
      ctx.font = `600 ${11 / scale}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3 / scale;
      ctx.strokeStyle = this.background;
      const title = region.title.length > 36 ? `${region.title.slice(0, 35)}…` : region.title;
      const y = region.y - region.radius + 10 / scale;
      ctx.strokeText(title, region.x, y);
      ctx.fillText(title, region.x, y);
    }
    ctx.restore();
  };
  private paintLabel = (node: SceneNode, ctx: CanvasRenderingContext2D, scale: number) => {
    if (!this.matches(node)) return;
    const focused = node === this.selected || node.current || !!this.query;
    if (!focused && (scale < 0.25 || (scale < 1 && !node.childCount))) return;
    // The library tooltip provides the hovered node's name without a second canvas label.
    if (node !== this.hovered) {
      ctx.font = `${node.childCount ? 600 : 400} ${11 / scale}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3 / scale;
      ctx.strokeStyle = this.background;
      ctx.fillStyle = this.text;
      const title = node.title.length > 36 ? `${node.title.slice(0, 35)}…` : node.title;
      ctx.strokeText(title, node.x!, node.y! + radius(node) + 4 / scale);
      ctx.fillText(title, node.x!, node.y! + radius(node) + 4 / scale);
    }
    if (node === this.selected) {
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, radius(node) + 4 / scale, 0, Math.PI * 2);
      ctx.strokeStyle = this.accent;
      ctx.lineWidth = 1.5 / scale;
      ctx.stroke();
    }
  };
  private refresh() {
    // New accessors invalidate the library's cooled canvas without reheating physics.
    this.graph
      .nodeColor((node) => this.nodeColor(node))
      .linkColor((link) => this.linkColor(link))
      .nodeCanvasObject((node, context, scale) => this.paintLabel(node, context, scale));
  }
  private nodeAt(event: MouseEvent) {
    const bounds = this.host.getBoundingClientRect();
    const point = this.graph.screen2GraphCoords(
      event.clientX - bounds.left,
      event.clientY - bounds.top,
    );
    return this.graph
      .graphData()
      .nodes.find(
        (node) =>
          Math.hypot(node.x! - point.x, node.y! - point.y) <= radius(node) + 2 / this.graph.zoom(),
      );
  }
  private onMouseDown = (event: MouseEvent) => {
    this.middleDown = null;
    if (event.button !== 1) return;
    const node = this.nodeAt(event);
    if (node) {
      event.preventDefault();
      this.middleDown = { node, x: event.clientX, y: event.clientY };
    }
  };
  private onAuxClick = (event: MouseEvent) => {
    const down = this.middleDown;
    this.middleDown = null;
    if (event.button !== 1 || !down) return;
    event.preventDefault();
    if (
      this.nodeAt(event) === down.node &&
      Math.hypot(event.clientX - down.x, event.clientY - down.y) < 5
    )
      this.openPage(down.node.id);
  };
  private onKeyDown = (event: KeyboardEvent) => {
    const nodes = this.graph.graphData().nodes.filter(this.matches);
    if (event.key.startsWith('Arrow') && nodes.length) {
      const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
      const index = this.selected ? nodes.indexOf(this.selected) : direction > 0 ? -1 : 0;
      this.selected = nodes[(index + direction + nodes.length) % nodes.length];
      this.graph.centerAt(this.selected.x, this.selected.y, 0);
      this.host.setAttribute(
        'aria-label',
        `Note graph. Selected: ${this.selected.title}. Press Enter to open.`,
      );
      this.refresh();
    } else if (['Enter', ' '].includes(event.key) && this.selected) this.openPage(this.selected.id);
    else if (['+', '='].includes(event.key)) this.zoom(1.2);
    else if (event.key === '-') this.zoom(1 / 1.2);
    else if (event.key === '0') this.fit();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
}

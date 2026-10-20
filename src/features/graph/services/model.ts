import type { GraphEdge, GraphModel, GraphNode } from '../types';

type PageNode = Pick<GraphNode, 'id' | 'title' | 'current' | 'parentId'>;

/** Keep actual ownership distinct from references, including unlinked child pages. */
export function createPageGraph(
  pages: PageNode[],
  references: Pick<GraphEdge, 'source' | 'target'>[],
): GraphModel {
  const nodes = pages.map((page): GraphNode => ({
    ...page,
    childCount: 0,
    degree: 0,
    depth: 0,
    rootId: page.id,
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const resolved = new Set<string>();
  for (const node of nodes) {
    if (resolved.has(node.id)) continue;
    const path: GraphNode[] = [];
    const visiting = new Set<string>();
    let current: GraphNode | undefined = node;
    while (current && !resolved.has(current.id)) {
      visiting.add(current.id);
      path.push(current);
      const parent: GraphNode | undefined = current.parentId
        ? byId.get(current.parentId)
        : undefined;
      if (!parent || visiting.has(parent.id)) {
        current.parentId = null;
        break;
      }
      current = parent;
    }
    for (const item of path.reverse()) {
      const parent = item.parentId ? byId.get(item.parentId) : undefined;
      item.depth = parent ? parent.depth + 1 : 0;
      item.rootId = parent?.rootId || item.id;
      resolved.add(item.id);
    }
  }
  const hierarchyPairs = new Set<string>();
  const pairKey = (a: string, b: string) => JSON.stringify([a, b].sort());
  const edges: GraphEdge[] = [];
  for (const node of nodes) {
    if (!node.parentId) continue;
    byId.get(node.parentId)!.childCount++;
    hierarchyPairs.add(pairKey(node.parentId, node.id));
    edges.push({ source: node.parentId, target: node.id, kind: 'hierarchy' });
  }
  for (const edge of references) {
    if (
      edge.source === edge.target ||
      !byId.has(edge.source) ||
      !byId.has(edge.target) ||
      hierarchyPairs.has(pairKey(edge.source, edge.target))
    )
      continue;
    edges.push({ ...edge, kind: 'link' });
  }
  for (const edge of edges) {
    byId.get(edge.source)!.degree++;
    byId.get(edge.target)!.degree++;
  }
  return { nodes, edges };
}

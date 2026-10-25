import type { GraphNode } from '../types';

type PositionedNode = GraphNode & { x?: number; y?: number };

export const graphNodeRadius = (node: GraphNode) =>
  5 + Math.min(12, Math.sqrt(node.childCount) * 3);

export interface FamilyRegion {
  rootId: string;
  title: string;
  nodes: PositionedNode[];
  x: number;
  y: number;
  radius: number;
}

/** Enclose ownership families without treating cross-note references as ownership. */
export function createFamilyRegions(nodes: PositionedNode[]): FamilyRegion[] {
  const families = new Map<string, PositionedNode[]>();
  for (const node of nodes) {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) continue;
    const family = families.get(node.rootId);
    if (family) family.push(node);
    else families.set(node.rootId, [node]);
  }
  const regions: FamilyRegion[] = [];
  for (const [rootId, members] of families) {
    if (members.length < 2) continue;
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (const node of members) {
      left = Math.min(left, node.x!);
      right = Math.max(right, node.x!);
      top = Math.min(top, node.y!);
      bottom = Math.max(bottom, node.y!);
    }
    const x = (left + right) / 2;
    const y = (top + bottom) / 2;
    let radius = 0;
    for (const node of members)
      radius = Math.max(radius, Math.hypot(node.x! - x, node.y! - y) + graphNodeRadius(node));
    regions.push({
      rootId,
      title: members.find((node) => node.id === rootId)?.title || 'Untitled',
      nodes: members,
      x,
      y,
      radius: radius + 36,
    });
  }
  return regions;
}

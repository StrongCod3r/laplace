import { forceCollide, type SimulationNodeDatum } from 'd3-force';
import { createFamilyRegions } from './family-regions';
import type { GraphNode } from '../types';

type LayoutNode = GraphNode & SimulationNodeDatum;

/** Resolve family collisions with D3, translating each family as a rigid group. */
export function separateGraphFamilies(nodes: LayoutNode[]) {
  const bodies = createFamilyRegions(nodes).map((region, index) => ({
    ...region,
    index,
    vx: 0,
    vy: 0,
  }));
  if (bodies.length < 2) return;
  const pinned = bodies.find((body) =>
    body.nodes.some((node) => (node as LayoutNode).fx != null || (node as LayoutNode).fy != null),
  );
  const collision = forceCollide<(typeof bodies)[number]>()
    .radius((body) => body.radius + 12)
    .strength(1)
    .iterations(3);
  collision.initialize(bodies, Math.random);
  for (let pass = 0; pass < 32; pass++) {
    collision(1);
    // Keep the dragged node under the pointer while its neighbors make room.
    const anchorX = pinned?.vx || 0;
    const anchorY = pinned?.vy || 0;
    let movement = 0;
    for (const body of bodies) {
      const dx = body.vx - anchorX;
      const dy = body.vy - anchorY;
      body.x += dx;
      body.y += dy;
      for (const node of body.nodes) {
        node.x! += dx;
        node.y! += dy;
      }
      movement = Math.max(movement, Math.hypot(dx, dy));
      body.vx = 0;
      body.vy = 0;
    }
    if (movement < 0.01) break;
  }
}

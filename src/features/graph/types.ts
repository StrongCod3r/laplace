export interface GraphNode {
  id: string;
  title: string;
  current: boolean;
  degree: number;
  parentId: string | null;
  childCount: number;
  depth: number;
  rootId: string;
}
export interface GraphEdge {
  source: string;
  target: string;
  kind: 'link' | 'hierarchy';
}
export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

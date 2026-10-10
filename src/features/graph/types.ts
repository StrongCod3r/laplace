export interface GraphNode {
  id: string;
  title: string;
  current: boolean;
  degree: number;
  x: number;
  y: number;
}
export interface GraphEdge {
  source: string;
  target: string;
}
export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
  scale: number;
  panX: number;
  panY: number;
}

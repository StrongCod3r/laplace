interface DockNode {
  type: string;
  direction?: string;
  first?: DockNode;
  second?: DockNode;
}

export const MIN_EDITOR_PANE_WIDTH = 280;

export function dockMinimumWidth(node: DockNode): number {
  if (node.type === 'group' || !node.first || !node.second) return MIN_EDITOR_PANE_WIDTH;
  const first = dockMinimumWidth(node.first);
  const second = dockMinimumWidth(node.second);
  return node.direction === 'row' ? first + second + 6 : Math.max(first, second);
}

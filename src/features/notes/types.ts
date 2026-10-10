export interface TreeItem {
  id: string;
  kind: 'note' | 'folder';
  title: string;
  iconHTML: string;
  path?: string;
  expanded: boolean;
  active: boolean;
  selected: boolean;
  children: TreeItem[];
}

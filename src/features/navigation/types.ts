export interface TabSummary {
  id: string;
  kind: 'page' | 'graph' | 'attachments';
  pageId?: string;
  title: string;
  iconHTML: string;
  active: boolean;
}

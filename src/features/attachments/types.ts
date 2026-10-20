export interface AttachmentCard {
  path: string;
  name: string;
  image: boolean;
  iconHTML: string;
  source?: string;
  references: AttachmentReference[];
}
export interface AttachmentReference {
  pageId: string;
  title: string;
  count: number;
}
export interface GalleryModel {
  items: AttachmentCard[];
  count: number;
  totalCount: number;
  filter: string;
  filterError: string;
  page: number;
  pageCount: number;
  selectedPath: string | null;
  loading: boolean;
  error: string;
}

export interface ImageCrop {
  enabled: boolean;
  shape: 'circle' | 'rect';
  aspect: number;
  originalAspect: number;
  zoom: number;
  x: number;
  y: number;
}

export interface ImagePresentation {
  width?: number;
  align?: 'left' | 'center' | 'right';
  crop?: ImageCrop;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}

export function normalizeImageCrop(value: unknown): ImageCrop {
  const raw = record(value) || {};
  const originalAspect = bounded(raw.originalAspect, 1, 0.2, 5);
  const shape = raw.shape === 'circle' ? 'circle' : 'rect';
  return {
    enabled: raw.enabled === true,
    shape,
    aspect: shape === 'circle' ? 1 : bounded(raw.aspect, originalAspect, 0.2, 5),
    originalAspect,
    zoom: bounded(raw.zoom, 1, 1, 3),
    x: bounded(raw.x, 50, 0, 100),
    y: bounded(raw.y, 50, 0, 100),
  };
}

export function normalizeImagePresentation(value: unknown): ImagePresentation | null {
  const raw = record(value);
  if (!raw || Object.keys(raw).some((key) => !['width', 'align', 'crop'].includes(key)))
    return null;
  const result: ImagePresentation = {};
  if (typeof raw.width === 'number' && Number.isFinite(raw.width) && raw.width > 80)
    result.width = Math.round(raw.width);
  if (raw.align === 'left' || raw.align === 'right') result.align = raw.align;
  if (record(raw.crop)) result.crop = normalizeImageCrop(raw.crop);
  return result;
}

export function filterAttachments<T extends { path: string }>(items: T[], pattern: string) {
  if (!pattern) return { items, error: '' };
  try {
    const expression = new RegExp(pattern, 'i');
    return { items: items.filter((item) => expression.test(item.path)), error: '' };
  } catch {
    return { items: [] as T[], error: 'Invalid regular expression' };
  }
}

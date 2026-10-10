interface Asset {
  path: string;
  name: string;
}

export function attachmentReferenceSources(value: unknown): string[] {
  const sources: string[] = [];
  const stack = [value];
  while (stack.length) {
    const item = stack.pop();
    if (typeof item === 'string') sources.push(item);
    else if (item && typeof item === 'object') stack.push(...Object.values(item));
  }
  return sources;
}

/** Conservative filename matching also protects relative links and wiki attachment aliases. */
export async function findUnusedAttachments<T extends Asset>(
  assets: T[],
  sources: string[],
  readText: (asset: T) => Promise<string | null>,
): Promise<T[]> {
  const decode = (text: string) =>
    text
      .replace(/(?:%[\da-f]{2})+/gi, (value) => {
        try {
          return decodeURIComponent(value);
        } catch {
          return value;
        }
      })
      .replace(/\\([\\()[\] "'])/g, '$1')
      .replace(
        /&(amp|quot|apos|lt|gt);/gi,
        (_, name: string) =>
          (({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }) as Record<string, string>)[
            name.toLowerCase()
          ] || '',
      );
  const matchers = assets.map(
    (asset) =>
      new RegExp(
        `(^|[^\\p{L}\\p{N}_.%-])${asset.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}_.%-])`,
        'iu',
      ),
  );
  const used = new Set<number>();
  let batch = sources.map(decode);
  while (batch.length) {
    const discovered: number[] = [];
    for (let index = 0; index < assets.length; index++) {
      if (!used.has(index) && batch.some((source) => matchers[index].test(source))) {
        used.add(index);
        discovered.push(index);
      }
      if (index && index % 50 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    batch = [];
    for (const index of discovered) {
      const text = await readText(assets[index]);
      if (text) batch.push(decode(text));
    }
  }
  return assets.filter((_, index) => !used.has(index));
}

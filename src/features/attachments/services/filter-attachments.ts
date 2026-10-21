export function filterAttachments<T extends { path: string }>(items: T[], pattern: string) {
  const patterns = pattern
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!patterns.length) return { items, error: '' };
  const source = patterns.map(filePatternSource).join('|');
  const expression = new RegExp(`(?:^|/)(?:${source})$`, 'i');
  return { items: items.filter((item) => expression.test(item.path)), error: '' };
}

function filePatternSource(pattern: string) {
  let source = '';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        index++;
        if (pattern[index + 1] === '/') {
          index++;
          source += '(?:.*/)?';
        } else source += '.*';
      } else source += '[^/]*';
    } else if (char === '?') source += '[^/]';
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return source;
}

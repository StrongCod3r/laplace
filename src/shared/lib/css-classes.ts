export type CssModule = Readonly<Record<string, string>>;

/** Keep semantic DOM hooks while adding the module's scoped presentation classes. */
export function withModuleClasses(styles: CssModule, value: string): string {
  const names = value.split(/\s+/).filter(Boolean);
  const scoped = names.flatMap((name) =>
    Object.hasOwn(styles, name) && typeof styles[name] === 'string'
      ? styles[name].split(/\s+/)
      : [],
  );
  return [...new Set([...names, ...scoped])].join(' ');
}

/** Apply the same module classes to UI markup produced by the existing editor engine. */
export function withHtmlModuleClasses(styles: CssModule, html: string): string {
  return html.replace(
    /(\sclass\s*=\s*)(['"])([\s\S]*?)\2/g,
    (_, prefix: string, quote: string, names: string) =>
      `${prefix}${quote}${withModuleClasses(styles, names)}${quote}`,
  );
}

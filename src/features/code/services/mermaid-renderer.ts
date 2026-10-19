let library: Promise<typeof import('pele')> | undefined;

/** Bundle Pele locally and load it only when a diagram is requested. */
export function ensureMermaidLibrary() {
  return (library ??= import('pele').catch((error: unknown) => {
    library = undefined;
    throw new Error('Could not load the diagram renderer', { cause: error });
  }));
}

export async function renderMermaidSvg(source: string, id: string, host: HTMLElement) {
  const api = await ensureMermaidLibrary();
  const { svg } = api.render(source, {
    idPrefix: id,
    fontFamily: getComputedStyle(host).fontFamily,
    // Preserve the direction authored in the note and Laplace's navigation controls.
    autoDirection: false,
    links: false,
    images: false,
  });
  const container = document.createElement('div');
  container.innerHTML = svg;
  const element = container.querySelector('svg');
  if (!element) throw new Error('The diagram renderer did not return an SVG');
  element.id = id;
  return element;
}

/** Resolve inherited theme variables so downloads work outside the app. */
export function copyMermaidSvg(svg: SVGSVGElement, host: HTMLElement) {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const styles = getComputedStyle(host);
  for (const name of [
    'bg',
    'fg',
    'muted',
    'line',
    'surface',
    'surface-alt',
    'border',
    'accent',
    'critical',
    'error',
  ]) {
    const property = `--pele-${name}`;
    copy.style.setProperty(property, styles.getPropertyValue(property));
  }
  copy.style.setProperty('--pele-font', styles.fontFamily);
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return copy;
}

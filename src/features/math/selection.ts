/** Locate rendered formulas using their selected source in the editable tree. */
export function selectedInlineMathHosts(root: HTMLElement, ranges: Range[]): HTMLElement[] {
  const localRanges = ranges.filter(
    (range) =>
      !range.collapsed && root.contains(range.startContainer) && root.contains(range.endContainer),
  );
  if (!localRanges.length) return [];
  return [...root.querySelectorAll<HTMLElement>('[data-inline-math]')].filter((host) => {
    if (host.hasAttribute('data-math-editing') || !host.shadowRoot?.querySelector('.rendered'))
      return false;
    return localRanges.some((range) => {
      if (!range.intersectsNode(host)) return false;
      const part = range.cloneRange();
      if (!host.contains(range.startContainer)) part.setStart(host, 0);
      if (!host.contains(range.endContainer)) part.setEnd(host, host.childNodes.length);
      return part.toString().length > 0;
    });
  });
}

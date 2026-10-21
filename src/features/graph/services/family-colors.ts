/** Session-local colors shared by nodes with the same ownership root. */
export class GraphFamilyColors {
  private hues = new Map<string, number>();

  update(rootIds: Iterable<string>) {
    const roots = [...new Set(rootIds)].sort();
    if (!this.hues.size) {
      roots.forEach((id, index) => this.hues.set(id, (210 + (index * 360) / roots.length) % 360));
      return;
    }
    for (const id of roots) {
      if (this.hues.has(id)) continue;
      const hues = [...this.hues.values()].sort((a, b) => a - b);
      let largestGap = 0;
      let hue = 0;
      for (let index = 0; index < hues.length; index++) {
        const start = hues[index];
        const end = hues[index + 1] ?? hues[0] + 360;
        if (end - start > largestGap) {
          largestGap = end - start;
          hue = (start + largestGap / 2) % 360;
        }
      }
      this.hues.set(id, hue);
    }
  }

  color(rootId: string) {
    const hue = this.hues.get(rootId);
    return hue === undefined ? undefined : `hsl(${hue} 52% 56%)`;
  }
}

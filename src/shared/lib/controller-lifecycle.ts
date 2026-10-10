/** Own every external resource of a mounted editor; safe under remounts. */
export class ControllerLifecycle {
  disposed = false;
  private listeners: Array<() => void> = [];
  private timeouts = new Set<number>();
  private intervals = new Set<number>();
  private frames = new Set<number>();

  listen(
    target: EventTarget | null | undefined,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (this.disposed || !target) return;
    target.addEventListener(type, listener, options);
    this.listeners.push(() => target.removeEventListener(type, listener, options));
  }

  timeout(callback: (...args: unknown[]) => void, delay = 0, ...args: unknown[]) {
    if (this.disposed) return 0;
    const id = window.setTimeout(() => {
      this.timeouts.delete(id);
      if (!this.disposed) callback(...args);
    }, delay);
    this.timeouts.add(id);
    return id;
  }

  clearTimeout(id: number | null | undefined) {
    if (id == null) return;
    window.clearTimeout(id);
    this.timeouts.delete(id);
  }

  interval(callback: () => void, delay: number) {
    if (this.disposed) return 0;
    const id = window.setInterval(() => {
      if (!this.disposed) callback();
    }, delay);
    this.intervals.add(id);
    return id;
  }

  clearInterval(id: number | null | undefined) {
    if (id == null) return;
    window.clearInterval(id);
    this.intervals.delete(id);
  }

  frame(callback: FrameRequestCallback) {
    if (this.disposed) return 0;
    const id = window.requestAnimationFrame((time) => {
      this.frames.delete(id);
      if (!this.disposed) callback(time);
    });
    this.frames.add(id);
    return id;
  }

  cancelFrame(id: number) {
    window.cancelAnimationFrame(id);
    this.frames.delete(id);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners
      .splice(0)
      .reverse()
      .forEach((remove) => remove());
    this.timeouts.forEach((id) => window.clearTimeout(id));
    this.intervals.forEach((id) => window.clearInterval(id));
    this.frames.forEach((id) => window.cancelAnimationFrame(id));
    this.timeouts.clear();
    this.intervals.clear();
    this.frames.clear();
  }
}

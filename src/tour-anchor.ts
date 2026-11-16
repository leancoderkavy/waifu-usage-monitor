/** The parts of `window` the tour needs to follow a target element. */
export interface AnchorHost {
  addEventListener(type: string, listener: () => void, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: string, listener: () => void, options?: boolean | EventListenerOptions): void;
  requestAnimationFrame?(cb: () => void): number;
  cancelAnimationFrame?(id: number): void;
  ResizeObserver?: new (cb: () => void) => { observe(el: Element): void; disconnect(): void };
}

/**
 * Calls `place` whenever the target may have moved: window resize, any scroll
 * (capture phase, so scrolling containers such as the narrow-layout `main`
 * count too) and target size changes. Calls are coalesced to one per frame.
 * Returns a cleanup that removes every listener.
 */
export function trackAnchor(host: AnchorHost, target: Element | null, place: () => void): () => void {
  let frame: number | null = null;
  const schedule = () => {
    if (!host.requestAnimationFrame) return place();
    if (frame !== null) return;
    frame = host.requestAnimationFrame(() => {
      frame = null;
      place();
    });
  };

  host.addEventListener("resize", schedule);
  host.addEventListener("scroll", schedule, true);
  const observer = target && host.ResizeObserver ? new host.ResizeObserver(schedule) : null;
  if (target) observer?.observe(target);

  return () => {
    host.removeEventListener("resize", schedule);
    host.removeEventListener("scroll", schedule, true);
    observer?.disconnect();
    if (frame !== null) host.cancelAnimationFrame?.(frame);
    frame = null;
  };
}

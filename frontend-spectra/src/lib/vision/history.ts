export interface HistorySample<T> {
  t: number;
  value: T;
}

/**
 * Rolling per-track sample window, used by the pose-based heuristic
 * detectors to compute things like velocity or sway variance over the last
 * N seconds without keeping unbounded history.
 */
export class TrackHistory<T> {
  private histories = new Map<string, HistorySample<T>[]>();

  constructor(private windowMs: number) {}

  push(trackId: string | number, timestamp: number, value: T): void {
    const key = String(trackId);
    const list = this.histories.get(key) ?? [];
    list.push({ t: timestamp, value });
    const cutoff = timestamp - this.windowMs;
    while (list.length > 0 && list[0].t < cutoff) list.shift();
    this.histories.set(key, list);
  }

  get(trackId: string | number): HistorySample<T>[] {
    return this.histories.get(String(trackId)) ?? [];
  }

  /** Drop tracks that haven't been updated recently (e.g. person left frame). */
  prune(now: number, staleMs: number): void {
    for (const [key, list] of this.histories) {
      const last = list[list.length - 1];
      if (!last || now - last.t > staleMs) {
        this.histories.delete(key);
      }
    }
  }

  activeKeys(): string[] {
    return [...this.histories.keys()];
  }
}

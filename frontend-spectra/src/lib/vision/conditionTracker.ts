/**
 * Shared "has this been true long enough, and are we out of cooldown" state
 * machine used by every detector. This is the mechanism behind both the
 * duration-threshold requirement (e.g. unattended object must persist 30s)
 * and duplicate-alert suppression (cooldown) — the two together are what
 * keep the system from spamming an alert every single tick.
 */
export class ConditionTracker {
  private since = new Map<string, number>();
  private lastFiredAt = new Map<string, number>();

  /**
   * Call once per tick per candidate key. Returns true exactly on the tick
   * an alert should fire: the condition has now held continuously for at
   * least durationThresholdMs, and the key isn't within its cooldown window.
   */
  evaluate(key: string, conditionTrue: boolean, now: number, durationThresholdMs: number, cooldownMs: number): boolean {
    if (!conditionTrue) {
      this.since.delete(key);
      return false;
    }

    if (!this.since.has(key)) {
      this.since.set(key, now);
    }
    const startedAt = this.since.get(key) ?? now;

    if (now - startedAt < durationThresholdMs) {
      return false;
    }

    const lastFired = this.lastFiredAt.get(key) ?? 0;
    if (now - lastFired < cooldownMs) {
      return false;
    }

    this.lastFiredAt.set(key, now);
    return true;
  }

  durationHeldMs(key: string, now: number): number {
    const startedAt = this.since.get(key);
    return startedAt ? now - startedAt : 0;
  }

  /** Drop state for keys that are no longer relevant (e.g. track expired). */
  prune(activeKeys: Set<string>): void {
    for (const key of this.since.keys()) {
      if (!activeKeys.has(key)) this.since.delete(key);
    }
  }
}

/** Small in-memory TTL cache. Per server instance; fine for a demo, not shared across instances. */
export class TtlCache<V> {
  private map = new Map<string, { at: number; value: V }>();
  constructor(
    private ttlMs: number,
    private max = 500,
    private now: () => number = Date.now,
  ) {}
  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (this.now() - hit.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }
  set(key: string, value: V) {
    if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { at: this.now(), value });
  }
  clear() {
    this.map.clear();
  }
}

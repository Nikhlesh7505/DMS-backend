class MemoryCache {
  constructor() {
    this.store = new Map();
  }

  set(key, value, ttlMs = 60 * 1000) {
    const expiresAt = ttlMs > 0 ? Date.now() + ttlMs : null;
    this.store.set(key, { value, expiresAt });
    return value;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  delete(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  async remember(key, ttlMs, factory) {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }
}

module.exports = {
  MemoryCache
};

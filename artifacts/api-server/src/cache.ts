interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL_MS = 60 * 60 * 1000;

export async function withCache<T>(key: string, fn: () => Promise<T>, ttlMs = DEFAULT_TTL_MS): Promise<T> {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() < entry.expiresAt) {
    return entry.data;
  }

  const data = await fn();
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

export function clearCache(): void {
  cache.clear();
}

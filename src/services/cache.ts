/**
 * Minimal "cache" shim.
 *
 * Why this exists:
 * - Keeps the code structured so you can add caching later if you want.
 * - For the "no negative side effects" mode, we effectively disable client-side
 *   caching by making these functions no-ops.
 *
 * Result:
 * - No stale-data risk from browser/localStorage caching.
 * - Any caching that remains is handled by Vercel/CDN (e.g. /api/kalshi headers, /assets immutable).
 */

export function readCache<T>(_key: string): T | undefined {
  return undefined;
}

export function writeCache<T>(_key: string, _data: T, _ttlMs: number) {
  // no-op
}

export function deleteCache(_key: string) {
  // no-op
}

export function clearCacheByPrefix(_prefix: string) {
  // no-op
}

export async function withCache<T>(
  _key: string,
  _ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  return await fetcher();
}



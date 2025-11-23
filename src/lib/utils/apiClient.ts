type CacheEntry<T> = { value: T; expiry: number };

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T, ttlMs: number) {
  cache.set(key, { value, expiry: Date.now() + ttlMs });
}

type BackoffOptions = {
  retries?: number;
  cacheKey?: string;
  cacheTtlMs?: number;
  signal?: AbortSignal;
};

export async function backoffFetchJson<T>(
  url: string,
  init?: RequestInit,
  options?: BackoffOptions,
): Promise<T> {
  const retries = options?.retries ?? 3;
  const cacheKey = options?.cacheKey;
  const cacheTtlMs = options?.cacheTtlMs ?? 5 * 60 * 1000; // 5 minutes

  if (cacheKey) {
    const cached = getCached<T>(cacheKey);
    if (cached) return cached;
  }

  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, { ...init, signal: options?.signal });

      const shouldRetry =
        (res.status >= 500 || res.status === 429 || res.status === 408) &&
        attempt < retries;

      if (shouldRetry) {
        const delay = Math.pow(2, attempt) * 400 + Math.random() * 200;
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt += 1;
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
      }

      const data = (await res.json()) as T;
      if (cacheKey) {
        setCached(cacheKey, data, cacheTtlMs);
      }
      return data;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }
      if (attempt >= retries) {
        throw err;
      }
      const delay = Math.pow(2, attempt) * 400 + Math.random() * 200;
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt += 1;
    }
  }
}

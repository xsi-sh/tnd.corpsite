import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Token bucket with small LRU eviction to avoid unbounded memory.
// Per-route buckets keep expensive endpoints from draining the shared pool.
type Bucket = { tokens: number; last: number };
const buckets = new Map<string, Bucket>();
const pathBuckets = new Map<string, Bucket>();
// Raise the burst + refill so bulk market scans with large item lists don’t trip local rate limits.
const MAX_TOKENS = 220;
const REFILL_INTERVAL_MS = 1000;
const REFILL_AMOUNT = 10;
const MAX_BUCKETS = 1200;

const PATH_GROUPS: { pattern: RegExp; key: string; max: number; refillMs: number; refillAmount: number }[] = [
  { pattern: /^\/api\/tycoon\/stats/, key: "tycoon-stats", max: 40, refillMs: 1000, refillAmount: 4 },
  { pattern: /^\/api\/market/, key: "market", max: 40, refillMs: 1000, refillAmount: 4 },
  { pattern: /^\/api\/tycoon\//, key: "tycoon", max: 30, refillMs: 1000, refillAmount: 3 },
];

function groupForPath(pathname: string) {
  return PATH_GROUPS.find((g) => g.pattern.test(pathname)) ?? null;
}

function getIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp =
    forwardedFor?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown";
  return realIp;
}

function evictOldest() {
  if (buckets.size <= MAX_BUCKETS) return;
  const oldestKey = buckets.keys().next().value;
  if (oldestKey) {
    buckets.delete(oldestKey);
  }
}

function takeFromBucket(
  map: Map<string, Bucket>,
  key: string,
  max: number,
  refillMs: number,
  refillAmount: number,
  cost: number,
) {
  const now = Date.now();
  const bucket = map.get(key) ?? { tokens: max, last: now };
  const elapsed = now - bucket.last;
  const refill = Math.floor(elapsed / refillMs) * refillAmount;
  const tokens = Math.min(max, bucket.tokens + refill);

  if (tokens < cost) {
    bucket.tokens = tokens;
    bucket.last = now;
    map.set(key, bucket);
    if (map === buckets) evictOldest();
    const deficit = cost - tokens;
    const retryAfter = Math.ceil((deficit / refillAmount) * (refillMs / 1000));
    return { allowed: false, retryAfter: retryAfter || 1 };
  }

  bucket.tokens = tokens - cost;
  bucket.last = now;
  map.set(key, bucket);
  if (map === buckets) evictOldest();
  return { allowed: true, retryAfter: null };
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  const ip = getIp(request);
  const globalResult = takeFromBucket(buckets, ip, MAX_TOKENS, REFILL_INTERVAL_MS, REFILL_AMOUNT, 1);
  if (!globalResult.allowed) {
    return new NextResponse(
      JSON.stringify({ ok: false, error: { message: "Rate limit exceeded. Please slow down." } }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": globalResult.retryAfter?.toString() ?? "2",
        },
      },
    );
  }

  const group = groupForPath(pathname);
  if (group) {
    const key = `${group.key}-${ip}`;
    const pathResult = takeFromBucket(
      pathBuckets,
      key,
      group.max,
      group.refillMs,
      group.refillAmount,
      1,
    );
    if (!pathResult.allowed) {
      return new NextResponse(
        JSON.stringify({ ok: false, error: { message: "Rate limit exceeded. Please slow down." } }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": pathResult.retryAfter?.toString() ?? "2",
          },
        },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};

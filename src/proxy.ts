import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Token bucket with small LRU eviction to avoid unbounded memory.
// Burst: 30 requests, refill: 1 token per 2s. Keeps last 500 IPs.

type Bucket = { tokens: number; last: number };
const buckets = new Map<string, Bucket>();
const MAX_TOKENS = 20;
const REFILL_INTERVAL_MS = 3000;
const REFILL_AMOUNT = 1;
const MAX_BUCKETS = 300;

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

function takeToken(ip: string) {
  const now = Date.now();
  const bucket = buckets.get(ip) ?? { tokens: MAX_TOKENS, last: now };
  const elapsed = now - bucket.last;
  const refill = Math.floor(elapsed / REFILL_INTERVAL_MS) * REFILL_AMOUNT;
  const tokens = Math.min(MAX_TOKENS, bucket.tokens + refill);

  if (tokens <= 0) {
    bucket.tokens = 0;
    bucket.last = now;
    buckets.set(ip, bucket);
    evictOldest();
    return { allowed: false, retryAfter: REFILL_INTERVAL_MS / 1000 };
  }

  bucket.tokens = tokens - 1;
  bucket.last = now;
  buckets.set(ip, bucket);
  evictOldest();
  return { allowed: true, retryAfter: null };
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  const ip = getIp(request);
  const result = takeToken(ip);

  if (!result.allowed) {
    return new NextResponse(
      JSON.stringify({ ok: false, error: { message: "Rate limit exceeded. Please slow down." } }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": result.retryAfter?.toString() ?? "2",
        },
      },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};

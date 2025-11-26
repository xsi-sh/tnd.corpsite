import { auth } from "@/auth"

const ESI_BASE_URL = "https://esi.evetech.net/latest"
const USER_AGENT = process.env.NEXT_PUBLIC_ESI_USER_AGENT || "Tactical Narcotics Division/1.0.0"

class ESIError extends Error {
  constructor(public status: number, public message: string, public body?: unknown) {
    super(message)
    this.name = "ESIError"
  }
}

// Simple memory cache for ETag/Expires
const cache = new Map<string, { etag?: string; expires?: number; data: unknown }>()

export async function fetchESI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // 1. Rate Limit Check (basic implementation - ideally this uses a shared store like Redis)
  // In a real app, we'd track X-ESI-Error-Limit-Remain globally.
  
  // 2. Get Session & Token
  const session = await auth()
  const token = session?.user?.accessToken

  if (!token) {
    throw new Error("Unauthorized: No valid EVE session found")
  }

  const url = `${ESI_BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`
  
  // 3. Check Cache (Client-side optimization)
  const cached = cache.get(url)
  if (cached && cached.expires && Date.now() < cached.expires) {
    console.log(`[ESI] Cache HIT: ${endpoint}`)
    return cached.data as T
  }

  // 4. Prepare Headers
  const headers = new Headers(options.headers)
  headers.set("Authorization", `Bearer ${token}`)
  headers.set("User-Agent", USER_AGENT)
  headers.set("Accept", "application/json")
  
  if (cached?.etag) {
    headers.set("If-None-Match", cached.etag)
  }

  console.log(`[ESI] Fetching: ${endpoint}`)

  const response = await fetch(url, {
    ...options,
    headers,
  })

  // 5. Handle 304 Not Modified
  if (response.status === 304 && cached) {
    console.log(`[ESI] 304 Not Modified: ${endpoint}`)
    // Update expiration if provided
    const expiresHeader = response.headers.get("Expires")
    if (expiresHeader) {
      cached.expires = new Date(expiresHeader).getTime()
      cache.set(url, cached)
    }
    return cached.data as T
  }

  // 6. Compliance: Check Error Limits (Old System)
  const errorLimitRemain = response.headers.get("X-ESI-Error-Limit-Remain")
  if (errorLimitRemain && parseInt(errorLimitRemain) < 10) {
    console.warn(`[ESI] CRITICAL: Error limit dropping! Remaining: ${errorLimitRemain}`)
  }

  // 7. Compliance: Check Token Bucket (New System)
  const tokenRemain = response.headers.get("X-Ratelimit-Remaining")
  if (tokenRemain && parseInt(tokenRemain) < 10) {
    console.warn(`[ESI] CRITICAL: Token bucket low! Remaining: ${tokenRemain}`)
  }

  if (!response.ok) {
    // Handle Rate Limiting (429)
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After")
      console.error(`[ESI] Rate Limited! Retry after ${retryAfter}s`)
      throw new ESIError(429, `Rate Limited. Retry after ${retryAfter}s`, { retryAfter })
    }

    const body = await response.json().catch(() => ({}))
    throw new ESIError(response.status, `ESI Request Failed: ${response.statusText}`, body)
  }

  const data = await response.json()

  // 7. Cache Response
  const etag = response.headers.get("ETag")
  const expires = response.headers.get("Expires")
  
  if (etag || expires) {
    cache.set(url, {
      data,
      etag: etag || undefined,
      expires: expires ? new Date(expires).getTime() : undefined
    })
  }

  return data as T
}

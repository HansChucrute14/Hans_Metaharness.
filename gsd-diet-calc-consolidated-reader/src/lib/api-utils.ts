/**
 * Lightweight in-memory rate limiter + slug validation for API routes.
 *
 * Token-bucket per client IP: 60 requests / minute / IP by default.
 * Designed for a single-instance deployment (no Redis needed). For multi-
 * instance serverless, swap this for `@upstash/ratelimit`.
 *
 * F-05 of the adversarial review: API routes had no validation, no rate
 * limiting, and no Cache-Control — cheap DoS amplifier via `/api/docs?slug=<junk>`.
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000; // 1 minute
const DEFAULT_CAPACITY = 60; // 60 requests per window per IP

/** Returns the client IP from a Next.js Request, or a fallback key. */
export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/**
 * Returns true if the request is allowed, false if rate-limited.
 * Call at the top of an API handler.
 */
export function rateLimit(
  request: Request,
  capacity = DEFAULT_CAPACITY
): boolean {
  const ip = getClientIp(request);
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket) {
    buckets.set(ip, { tokens: capacity - 1, lastRefill: now });
    return true;
  }
  // Refill proportionally to elapsed time
  const elapsed = now - bucket.lastRefill;
  const refill = (elapsed / WINDOW_MS) * capacity;
  bucket.tokens = Math.min(capacity, bucket.tokens + refill);
  bucket.lastRefill = now;
  if (bucket.tokens < 1) {
    return false;
  }
  bucket.tokens -= 1;
  return true;
}

/** Periodically evict stale buckets to avoid unbounded memory growth. */
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, bucket] of buckets) {
      if (now - bucket.lastRefill > WINDOW_MS * 5) {
        buckets.delete(ip);
      }
    }
  }, WINDOW_MS * 2).unref?.();
}

/**
 * Validates a doc slug. Allowed: lowercase letters, digits, hyphens.
 * Max 80 chars. Rejects path traversal and weird chars.
 */
const SLUG_RE = /^[a-z0-9-]+$/;
export function isValidSlug(slug: string): boolean {
  if (!slug || slug.length > 80) return false;
  return SLUG_RE.test(slug);
}

export interface RateLimitQuota {
  limit: number;
  remaining: number;
  reset: number; // unix ms; 0 when rate limiting isn't active (e.g. local dev)
}

// Reads the X-RateLimit-* headers set by src/lib/rateLimit.ts. Returns null
// when they're absent (older cached response, or a network-level failure
// that never reached the route).
export function parseRateLimitHeaders(res: Response): RateLimitQuota | null {
  const limit = res.headers.get("X-RateLimit-Limit");
  const remaining = res.headers.get("X-RateLimit-Remaining");
  const reset = res.headers.get("X-RateLimit-Reset");
  if (limit === null || remaining === null || reset === null) return null;
  return { limit: Number(limit), remaining: Number(remaining), reset: Number(reset) };
}

// "in 12 min" / "in 1 min" / "shortly" — used both for the quota display and
// for turning a 429 into a specific retry message instead of a generic one.
export function formatResetIn(reset: number): string {
  if (!reset) return "shortly";
  const ms = reset - Date.now();
  if (ms <= 0) return "now";
  const minutes = Math.ceil(ms / 60_000);
  return minutes <= 1 ? "in 1 min" : `in ${minutes} min`;
}

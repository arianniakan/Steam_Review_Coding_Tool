import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Both AI routes are public, unauthenticated, stateless OpenAI proxies —
// this app has no accounts to gate them behind. Without this, anyone who
// finds the URL could hit them directly with arbitrary text and run up the
// OpenAI bill. Rate limiting is keyed by IP via Upstash Redis (the standard
// pattern for Vercel serverless functions, which don't share in-memory
// state across invocations).
//
// Falls back to allowing all requests if Redis isn't configured (e.g.
// local dev without the env vars set) rather than breaking the route —
// production is expected to have these set via Vercel's Upstash/KV storage
// integration, which names them KV_REST_API_URL / KV_REST_API_TOKEN (same
// underlying Upstash Redis REST API, just Vercel's own naming convention
// when provisioned through the dashboard rather than Upstash directly).
const redisUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

if (!redis && process.env.NODE_ENV === "production") {
  console.warn(
    "KV_REST_API_URL / KV_REST_API_TOKEN are not set — AI routes are running without rate limiting.",
  );
}

const limiters = new Map<string, Ratelimit>();

function getLimiter(name: string, limit: number, window: `${number} ${"s" | "m" | "h" | "d"}`) {
  if (!redis) return null;
  const key = `${name}:${limit}:${window}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: `ratelimit:${name}`,
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

function clientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

// name/limit/window identify the bucket (different routes get separate
// budgets since they have very different per-request costs). Never throws —
// a Redis outage degrades to "allowed" rather than taking the app down.
export async function checkRateLimit(
  request: Request,
  name: string,
  limit: number,
  window: `${number} ${"s" | "m" | "h" | "d"}`,
): Promise<RateLimitResult> {
  const limiter = getLimiter(name, limit, window);
  if (!limiter) return { allowed: true, limit, remaining: limit, reset: 0 };

  try {
    const result = await limiter.limit(clientIp(request));
    return {
      allowed: result.success,
      limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (err) {
    console.error(`Rate limit check failed for "${name}" — allowing request`, err);
    return { allowed: true, limit, remaining: limit, reset: 0 };
  }
}

// Standard-ish rate-limit response headers (same convention as GitHub's
// API) so the client can show remaining quota / when it resets without the
// route needing to duplicate this on every response it returns.
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.reset),
  };
}

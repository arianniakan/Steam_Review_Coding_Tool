import { formatResetIn, type RateLimitQuota } from "@/lib/rateLimitClient";

// Thin fuel-gauge style indicator for AI request quota. Renders nothing
// when rate limiting isn't active (reset === 0, e.g. local dev without
// Redis configured) so it never shows a meaningless "20/20".
export function RateLimitQuotaBar({ quota, label }: { quota: RateLimitQuota | null; label: string }) {
  if (!quota || quota.reset <= 0) return null;

  const pct = Math.max(0, Math.min(100, (quota.remaining / quota.limit) * 100));
  const low = quota.remaining <= Math.max(1, Math.round(quota.limit * 0.15));

  return (
    <div className="mt-2">
      <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-[width] ${low ? "bg-amber-500" : "bg-gray-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`mt-1 text-xs ${low ? "text-amber-600" : "text-gray-400"}`}>
        {quota.remaining} of {quota.limit} {label} left this hour
        {quota.remaining === 0 ? ` — resets ${formatResetIn(quota.reset)}` : ""}
      </p>
    </div>
  );
}

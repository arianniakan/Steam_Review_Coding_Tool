import { NextResponse } from "next/server";
import { peekRateLimit, RATE_LIMIT_BUCKETS } from "@/lib/rateLimit";

// Non-consuming quota check so the UI can show "N/limit left" *before* the
// user spends a request, not just after their first one. Reads the same
// underlying counters the AI routes themselves enforce (see
// RATE_LIMIT_BUCKETS), just via getRemaining() instead of limit().
export async function GET(request: Request) {
  const [suggestCodes, suggestCodebook] = await Promise.all([
    peekRateLimit(
      request,
      RATE_LIMIT_BUCKETS.suggestCodes.name,
      RATE_LIMIT_BUCKETS.suggestCodes.limit,
      RATE_LIMIT_BUCKETS.suggestCodes.window,
    ),
    peekRateLimit(
      request,
      RATE_LIMIT_BUCKETS.suggestCodebook.name,
      RATE_LIMIT_BUCKETS.suggestCodebook.limit,
      RATE_LIMIT_BUCKETS.suggestCodebook.window,
    ),
  ]);

  return NextResponse.json({ suggestCodes, suggestCodebook });
}

import { NextResponse } from "next/server";
import { fetchAppDetails, fetchReviewPage, type SteamReview } from "@/lib/steam";

const MAX_PAGES_CAP = 30;
const DEFAULT_MAX_PAGES = 10;
const PAGE_DELAY_MS = 200; // be polite to Steam's public endpoint

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Steam-only proxy — the local-first migration moved the database into the
// browser, so this route no longer writes anything. It just does the Steam
// fetching (which needs a server-side request, not a browser one, to avoid
// CORS/rate-limit surprises) and hands the raw data back to the client,
// which performs the actual upsert into local PGlite.
export async function POST(
  request: Request,
  // Path segment is named `gameId` to match the sibling route naming
  // convention elsewhere in the app — the value passed in is still the
  // Steam App ID, not an internal DB id (there's no DB here anymore).
  context: { params: Promise<{ gameId: string }> },
) {
  const { gameId: appid } = await context.params;
  const appId = Number(appid);
  if (!Number.isInteger(appId) || appId <= 0) {
    return NextResponse.json(
      { error: "Invalid Steam App ID" },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const requestedMaxPages = Number(body.maxPages);
  const maxPages = Math.min(
    Math.max(Number.isFinite(requestedMaxPages) ? requestedMaxPages : DEFAULT_MAX_PAGES, 1),
    MAX_PAGES_CAP,
  );

  const details = await fetchAppDetails(appId);

  const allReviews: SteamReview[] = [];
  let cursor = "*";
  let pagesFetched = 0;
  let totalReviewsOnSteam = 0;

  for (; pagesFetched < maxPages; pagesFetched++) {
    const page = await fetchReviewPage(appId, cursor);
    totalReviewsOnSteam = page.query_summary?.total_reviews ?? totalReviewsOnSteam;
    if (!page.reviews || page.reviews.length === 0) break;
    allReviews.push(...page.reviews);
    if (page.cursor === cursor) break; // no forward progress — reached the end
    cursor = page.cursor;
    if (pagesFetched < maxPages - 1) await sleep(PAGE_DELAY_MS);
  }

  return NextResponse.json({
    steamAppId: appId,
    gameDetails: details,
    reviews: allReviews,
    pagesFetched,
    hasMore: pagesFetched === maxPages,
    totalReviewsOnSteam,
  });
}

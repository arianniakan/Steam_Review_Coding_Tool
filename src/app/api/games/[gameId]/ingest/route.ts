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
  // "Ingest all" drives this route in a loop from the client, each call
  // picking up Steam's pagination cursor where the last one left off —
  // a single request can't safely walk a game's entire review history
  // (could be hundreds of thousands of reviews) within one serverless
  // function's execution-time budget.
  const startCursor = typeof body.cursor === "string" && body.cursor ? body.cursor : "*";
  // App details don't change between batches of the same loop — the client
  // already has them after the first call, so skip the redundant Steam
  // request on every subsequent one.
  const skipDetails = body.skipDetails === true;

  const details = skipDetails ? null : await fetchAppDetails(appId);

  // Streamed as newline-delimited JSON rather than one final response —
  // a 30-page fetch (each page politely delayed) can take long enough that
  // a static "Ingesting…" button gave no sense of progress at all. The
  // client reads this incrementally; the last line is always the real
  // result, identical in shape to what this route used to return directly.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: unknown) {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      }
      const allReviews: SteamReview[] = [];
      let cursor = startCursor;
      let pagesFetched = 0;
      let totalReviewsOnSteam = 0;

      try {
        for (; pagesFetched < maxPages; pagesFetched++) {
          const page = await fetchReviewPage(appId, cursor);
          totalReviewsOnSteam = page.query_summary?.total_reviews ?? totalReviewsOnSteam;
          if (!page.reviews || page.reviews.length === 0) break;
          allReviews.push(...page.reviews);
          send({
            type: "progress",
            page: pagesFetched + 1,
            maxPages,
            reviewsSoFar: allReviews.length,
            totalReviewsOnSteam,
          });
          if (page.cursor === cursor) break; // no forward progress — reached the end
          cursor = page.cursor;
          if (pagesFetched < maxPages - 1) await sleep(PAGE_DELAY_MS);
        }

        send({
          type: "done",
          steamAppId: appId,
          gameDetails: details,
          reviews: allReviews,
          pagesFetched,
          hasMore: pagesFetched === maxPages,
          totalReviewsOnSteam,
          cursor,
        });
      } catch (err) {
        send({ type: "error", error: err instanceof Error ? err.message : "Ingestion failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}

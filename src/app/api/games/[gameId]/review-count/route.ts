import { NextResponse } from "next/server";
import { fetchReviewPage } from "@/lib/steam";

// Non-consuming peek at how many reviews Steam has for a game (optionally
// scoped to a language filter) — lets the Ingest/Sync forms show "~N
// reviews available" before the user commits to a long "ingest all" run,
// and gives the progress bar a real denominator from the very first
// render instead of waiting for the first batch to come back. Costs one
// cheap Steam request (num_per_page=1) rather than the real ingest route's
// multi-page fetch.
export async function GET(
  request: Request,
  context: { params: Promise<{ gameId: string }> },
) {
  const { gameId: appid } = await context.params;
  const appId = Number(appid);
  if (!Number.isInteger(appId) || appId <= 0) {
    return NextResponse.json({ error: "Invalid Steam App ID" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const language = searchParams.get("language") || "all";

  try {
    const page = await fetchReviewPage(appId, "*", 1, language);
    return NextResponse.json({ totalReviews: page.query_summary?.total_reviews ?? 0 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch review count" },
      { status: 502 },
    );
  }
}

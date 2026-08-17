import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAppName, fetchReviewPage, type SteamReview } from "@/lib/steam";

const MAX_PAGES_CAP = 30;
const DEFAULT_MAX_PAGES = 10;
const PAGE_DELAY_MS = 200; // be polite to Steam's public endpoint

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(
  request: Request,
  // Path segment is named `gameId` to match the sibling `codebooks` route
  // (Next.js requires one param name per path level) — the value passed in
  // is still the Steam App ID, not the internal DB id.
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

  const gameName = await fetchAppName(appId);
  const game = await prisma.game.upsert({
    where: { steamAppId: appId },
    update: { name: gameName },
    create: { steamAppId: appId, name: gameName },
  });

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

  const rows = allReviews.map((r) => ({
    gameId: game.id,
    steamReviewId: r.recommendationid,
    text: r.review,
    votedUp: r.voted_up,
    playtimeForever: r.author.playtime_forever,
    votesUp: r.votes_up,
    votesFunny: r.votes_funny,
    weightedVoteScore: Number.parseFloat(r.weighted_vote_score) || 0,
    timestampCreated: new Date(r.timestamp_created * 1000),
    timestampUpdated: new Date(r.timestamp_updated * 1000),
    writtenDuringEarlyAccess: r.written_during_early_access,
    steamPurchase: r.steam_purchase,
    receivedForFree: r.received_for_free,
    commentCount: r.comment_count,
    language: r.language,
  }));

  const result = rows.length
    ? await prisma.review.createMany({ data: rows, skipDuplicates: true })
    : { count: 0 };

  return NextResponse.json({
    gameId: game.id,
    gameName: game.name,
    steamAppId: appId,
    fetchedFromSteam: allReviews.length,
    ingestedCount: result.count,
    pagesFetched,
    hasMore: pagesFetched === maxPages,
    totalReviewsOnSteam,
  });
}

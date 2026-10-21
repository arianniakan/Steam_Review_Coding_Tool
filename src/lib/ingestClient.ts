import type { SteamReview, SteamAppDetails } from "@/lib/steam";
import type { IngestReviewRow } from "@/lib/localDb/queries/reviews";

export interface IngestProgress {
  page: number;
  maxPages: number;
  reviewsSoFar: number;
  totalReviewsOnSteam: number;
}

export interface IngestStreamResult {
  steamAppId: number;
  gameDetails: SteamAppDetails;
  reviews: SteamReview[];
  pagesFetched: number;
  hasMore: boolean;
  totalReviewsOnSteam: number;
}

// Shared by the standalone /ingest flow (first ingest for a new game) and
// the per-game "Sync more reviews" panel (re-ingesting an existing one) —
// both consume the same NDJSON-streaming route identically, just with a
// different Steam App ID source (typed in vs. already known).
export async function runIngestFetch(
  appId: number,
  maxPages: number,
  onProgress: (p: IngestProgress) => void,
): Promise<IngestStreamResult> {
  const res = await fetch(`/api/games/${appId}/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maxPages }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(data.error ?? "Ingestion failed");
  }
  if (!res.body) throw new Error("Ingestion failed — empty response");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let data: (IngestStreamResult & { error?: string }) | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.type === "progress") {
        onProgress({
          page: msg.page,
          maxPages: msg.maxPages,
          reviewsSoFar: msg.reviewsSoFar,
          totalReviewsOnSteam: msg.totalReviewsOnSteam,
        });
      } else if (msg.type === "done") {
        data = msg;
      } else if (msg.type === "error") {
        throw new Error(msg.error ?? "Ingestion failed");
      }
    }
  }
  if (!data) throw new Error("Ingestion ended unexpectedly");
  return data;
}

export function toIngestRows(reviews: SteamReview[]): IngestReviewRow[] {
  return reviews.map((r) => ({
    steamReviewId: r.recommendationid,
    text: r.review,
    votedUp: r.voted_up,
    playtimeForever: r.author.playtime_forever,
    votesUp: r.votes_up,
    votesFunny: r.votes_funny,
    weightedVoteScore: Number.parseFloat(r.weighted_vote_score) || 0,
    timestampCreated: new Date(r.timestamp_created * 1000).toISOString(),
    timestampUpdated: new Date(r.timestamp_updated * 1000).toISOString(),
    writtenDuringEarlyAccess: r.written_during_early_access,
    steamPurchase: r.steam_purchase,
    receivedForFree: r.received_for_free,
    commentCount: r.comment_count,
    language: r.language,
    textLength: r.review.length,
    playtimeAtReview: r.author.playtime_at_review ?? null,
    playtimeLastTwoWeeks: r.author.playtime_last_two_weeks ?? null,
    authorNumGamesOwned: r.author.num_games_owned ?? null,
    authorNumReviews: r.author.num_reviews ?? null,
    authorLastPlayed: r.author.last_played
      ? new Date(r.author.last_played * 1000).toISOString()
      : null,
  }));
}

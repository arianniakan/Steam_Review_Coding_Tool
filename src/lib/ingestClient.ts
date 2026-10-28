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
  cursor: string;
}

async function postIngest(
  appId: number,
  body: Record<string, unknown>,
  onProgress: (p: IngestProgress) => void,
  signal?: AbortSignal,
): Promise<IngestStreamResult> {
  const res = await fetch(`/api/games/${appId}/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
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

// Shared by the standalone /ingest flow (first ingest for a new game) and
// the per-game "Sync more reviews" panel (re-ingesting an existing one) —
// both consume the same NDJSON-streaming route identically, just with a
// different Steam App ID source (typed in vs. already known).
export async function runIngestFetch(
  appId: number,
  maxPages: number,
  onProgress: (p: IngestProgress) => void,
  language = "all",
): Promise<IngestStreamResult> {
  return postIngest(appId, { maxPages, language }, onProgress);
}

export interface FullIngestProgress extends IngestProgress {
  batch: number;
}

// "Ingest all" for a game that may have far more reviews than one request
// can safely walk (Steam's own pagination cursor, not just a page count, is
// the only way to know when it's actually exhausted). Loops the same
// NDJSON route batch by batch, handing each batch's reviews to `onBatch` as
// soon as they arrive — rather than buffering the whole game's reviews in
// memory — so the caller can upsert incrementally and progress survives a
// cancellation instead of being all-or-nothing.
export interface RunFullIngestOptions {
  language?: string;
  // Resumes Steam's cursor pagination from a saved checkpoint instead of
  // starting from "*" — the first call of THIS invocation still always
  // fetches app details (never skipDetails), since a fresh page load means
  // the caller has no gameDetails of its own yet even if resuming mid-run.
  startCursor?: string;
  // Fired after every batch (including the final, reviews-less one) with
  // the latest cursor and running Steam total, so the caller can persist a
  // resume point — a multi-hour "ingest all" run has a lot to lose to a
  // crashed tab otherwise.
  onCheckpoint?: (cursor: string, totalReviewsOnSteam: number) => void;
}

export async function runFullIngestFetch(
  appId: number,
  pagesPerBatch: number,
  onProgress: (p: FullIngestProgress) => void,
  onBatch: (reviews: SteamReview[], gameDetails: SteamAppDetails) => Promise<void>,
  signal?: AbortSignal,
  options?: RunFullIngestOptions,
): Promise<{ steamAppId: number; gameDetails: SteamAppDetails; totalFetched: number; batches: number }> {
  let cursor = options?.startCursor ?? "*";
  let batch = 0;
  let totalFetched = 0;
  let gameDetails: SteamAppDetails | null = null;
  let steamAppId = appId;

  while (true) {
    if (signal?.aborted) throw new DOMException("Ingestion cancelled", "AbortError");
    batch += 1;
    const data = await postIngest(
      appId,
      { maxPages: pagesPerBatch, cursor, skipDetails: batch > 1, language: options?.language },
      (p) => onProgress({ ...p, batch }),
      signal,
    );
    if (batch === 1) {
      gameDetails = data.gameDetails;
      steamAppId = data.steamAppId;
    }
    totalFetched += data.reviews.length;
    if (data.reviews.length > 0) await onBatch(data.reviews, gameDetails!);
    cursor = data.cursor;
    options?.onCheckpoint?.(cursor, data.totalReviewsOnSteam);
    if (!data.hasMore) break;
  }

  return { steamAppId, gameDetails: gameDetails!, totalFetched, batches: batch };
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

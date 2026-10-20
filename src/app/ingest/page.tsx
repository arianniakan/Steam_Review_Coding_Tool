"use client";

import { useState } from "react";
import { toast } from "sonner";
import { parseSteamAppId, type SteamReview, type SteamAppDetails } from "@/lib/steam";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { upsertGameFromSteam } from "@/lib/localDb/queries/games";
import { upsertReviewsBatch, type IngestReviewRow } from "@/lib/localDb/queries/reviews";

interface SteamIngestResponse {
  steamAppId: number;
  gameDetails: SteamAppDetails;
  reviews: SteamReview[];
  pagesFetched: number;
  hasMore: boolean;
  totalReviewsOnSteam: number;
}

interface IngestProgress {
  page: number;
  maxPages: number;
  reviewsSoFar: number;
  totalReviewsOnSteam: number;
}

interface IngestResult {
  gameId: string;
  gameName: string;
  steamAppId: number;
  fetchedFromSteam: number;
  ingestedCount: number;
  updatedCount: number;
  pagesFetched: number;
  hasMore: boolean;
}

export default function IngestPage() {
  const [appId, setAppId] = useState("");
  const [maxPages, setMaxPages] = useState(10);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedId = parseSteamAppId(appId);
    if (parsedId === null) {
      const message = "Couldn't find a Steam App ID in that — paste a store URL or the numeric ID";
      setError(message);
      toast.error(message);
      return;
    }
    setLoading(true);
    setProgress(null);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/games/${parsedId}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxPages }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as { error?: string });
        throw new Error(data.error ?? "Ingestion failed");
      }
      if (!res.body) throw new Error("Ingestion failed — empty response");

      // Streamed as newline-delimited JSON so the UI can show live
      // page-by-page progress instead of a static "Ingesting…" label for
      // what can be a multi-second, multi-page fetch.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let data: (SteamIngestResponse & { error?: string }) | null = null;

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
            setProgress({
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

      const game = await upsertGameFromSteam(data.steamAppId, data.gameDetails);

      const rows: IngestReviewRow[] = data.reviews.map((r) => ({
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

      const { insertedCount, updatedCount } = await upsertReviewsBatch(game.id, rows);

      setResult({
        gameId: game.id,
        gameName: game.name,
        steamAppId: data.steamAppId,
        fetchedFromSteam: data.reviews.length,
        ingestedCount: insertedCount,
        updatedCount,
        pagesFetched: data.pagesFetched,
        hasMore: data.hasMore,
      });
      toast.success(`Ingested ${insertedCount} review(s) for ${game.name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl p-4 sm:p-8">
      <Breadcrumbs items={[{ label: "Ingest" }]} />
      <div className="mt-2">
        <BackButton href="/" label="Home" />
      </div>
      <h1 className="mt-2 text-2xl font-semibold">Ingest Steam Reviews</h1>
      <p className="mt-2 text-sm text-gray-500">
        Paste a Steam store URL or just the App ID (e.g.{" "}
        <code>store.steampowered.com/app/1091500</code> or <code>1091500</code>).
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Steam store URL or App ID</span>
          <input
            required
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder="store.steampowered.com/app/1091500 or 1091500"
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            Max pages (100 reviews/page, capped at 30)
          </span>
          <input
            type="number"
            min={1}
            max={30}
            value={maxPages}
            onChange={(e) => setMaxPages(Number(e.target.value))}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading
            ? progress
              ? `Fetching page ${progress.page} of ${progress.maxPages} (${progress.reviewsSoFar} reviews so far)…`
              : "Ingesting…"
            : "Ingest reviews"}
        </button>
        {loading && progress && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-gray-600 transition-[width]"
              style={{ width: `${Math.min(100, (progress.page / progress.maxPages) * 100)}%` }}
            />
          </div>
        )}
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4 text-sm">
          <p className="font-medium">{result.gameName}</p>
          <p className="mt-1 text-gray-600">
            Fetched {result.fetchedFromSteam} reviews from Steam across{" "}
            {result.pagesFetched} page(s); {result.ingestedCount} new,{" "}
            {result.updatedCount} already-ingested row(s) refreshed.
          </p>
          {result.hasMore && (
            <p className="mt-2 text-amber-600">
              Hit the page cap — re-run with a higher max pages (or run again
              later) to pull more.
            </p>
          )}
          <a
            className="mt-3 inline-block underline"
            href={`/games/${result.gameId}/reviews`}
          >
            View reviews →
          </a>
        </div>
      )}
    </main>
  );
}

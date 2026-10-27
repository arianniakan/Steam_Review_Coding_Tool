"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { parseSteamAppId } from "@/lib/steam";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { upsertGameFromSteam } from "@/lib/localDb/queries/games";
import { upsertReviewsBatch } from "@/lib/localDb/queries/reviews";
import {
  runIngestFetch,
  runFullIngestFetch,
  toIngestRows,
  type IngestProgress,
  type FullIngestProgress,
} from "@/lib/ingestClient";

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
  const [ingestAll, setIngestAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<IngestProgress | FullIngestProgress | null>(null);
  const [cumulativeFetched, setCumulativeFetched] = useState(0);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
    setCumulativeFetched(0);
    setError(null);
    setResult(null);
    try {
      if (ingestAll) {
        const controller = new AbortController();
        abortRef.current = controller;
        const gameHolder: { current: { id: string; name: string } | null } = { current: null };
        let insertedTotal = 0;
        let updatedTotal = 0;
        let fetchedTotal = 0;
        const summary = await runFullIngestFetch(
          parsedId,
          maxPages,
          setProgress,
          async (reviews, gameDetails) => {
            if (!gameHolder.current) gameHolder.current = await upsertGameFromSteam(parsedId, gameDetails);
            const rows = toIngestRows(reviews);
            const { insertedCount, updatedCount } = await upsertReviewsBatch(gameHolder.current.id, rows);
            insertedTotal += insertedCount;
            updatedTotal += updatedCount;
            fetchedTotal += reviews.length;
            setCumulativeFetched(fetchedTotal);
          },
          controller.signal,
        );
        const game = gameHolder.current;
        if (!game) throw new Error("No reviews found for this game");
        setResult({
          gameId: game.id,
          gameName: game.name,
          steamAppId: summary.steamAppId,
          fetchedFromSteam: fetchedTotal,
          ingestedCount: insertedTotal,
          updatedCount: updatedTotal,
          pagesFetched: summary.batches * maxPages,
          hasMore: false,
        });
        toast.success(`Ingested ${insertedTotal} review(s) for ${game.name}`);
      } else {
        const data = await runIngestFetch(parsedId, maxPages, setProgress);

        const game = await upsertGameFromSteam(data.steamAppId, data.gameDetails);
        const rows = toIngestRows(data.reviews);
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
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        toast("Ingestion cancelled — reviews fetched so far were kept", { icon: "ℹ️" });
      } else {
        const message = err instanceof Error ? err.message : "Something went wrong";
        setError(message);
        toast.error(message);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
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
            {ingestAll ? "Reviews per batch (100/page, 30 pages/batch max)" : "Max pages (100 reviews/page, capped at 30)"}
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

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ingestAll}
            onChange={(e) => setIngestAll(e.target.checked)}
          />
          <span>
            Ingest ALL reviews — keeps fetching batch after batch until Steam has no more
            (can take a while for popular games; cancel any time without losing progress already saved)
          </span>
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {loading
              ? progress && "batch" in progress
                ? `Batch ${progress.batch}, page ${progress.page} of ${progress.maxPages} (${cumulativeFetched} reviews so far)…`
                : progress
                  ? `Fetching page ${progress.page} of ${progress.maxPages} (${progress.reviewsSoFar} reviews so far)…`
                  : "Ingesting…"
              : "Ingest reviews"}
          </button>
          {loading && ingestAll && (
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
            >
              Cancel
            </button>
          )}
        </div>
        {loading && progress && !("batch" in progress) && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-gray-600 transition-[width]"
              style={{ width: `${Math.min(100, (progress.page / progress.maxPages) * 100)}%` }}
            />
          </div>
        )}
        {loading && progress && "batch" in progress && progress.totalReviewsOnSteam > 0 && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-gray-600 transition-[width]"
              style={{
                width: `${Math.min(100, (cumulativeFetched / progress.totalReviewsOnSteam) * 100)}%`,
              }}
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

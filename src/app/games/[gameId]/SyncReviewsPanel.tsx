"use client";

import { useState } from "react";
import { toast } from "sonner";
import { upsertGameFromSteam, markGameSynced, type Game } from "@/lib/localDb/queries/games";
import { upsertReviewsBatch } from "@/lib/localDb/queries/reviews";
import { runIngestFetch, toIngestRows, type IngestProgress } from "@/lib/ingestClient";

const DEFAULT_MAX_PAGES = 10;

// "Re-sync" for an existing game previously meant leaving its context
// entirely and re-pasting its Steam URL/App ID into the generic top-level
// /ingest form — this reuses the exact same NDJSON-streaming ingest
// machinery (via ingestClient.ts) without re-prompting for anything the app
// already knows.
export function SyncReviewsPanel({ game, onSynced }: { game: Game; onSynced: (game: Game) => void }) {
  const [maxPages, setMaxPages] = useState(DEFAULT_MAX_PAGES);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<IngestProgress | null>(null);

  async function handleSync() {
    setLoading(true);
    setProgress(null);
    try {
      const data = await runIngestFetch(game.steamAppId, maxPages, setProgress);
      const updatedGame = await upsertGameFromSteam(data.steamAppId, data.gameDetails);
      const rows = toIngestRows(data.reviews);
      const { insertedCount, updatedCount } = await upsertReviewsBatch(updatedGame.id, rows);
      await markGameSynced(updatedGame.id, data.reviews.length);
      onSynced({ ...updatedGame, lastIngestedAt: new Date().toISOString(), lastSyncReviewCount: data.reviews.length });
      toast.success(`Synced — ${insertedCount} new, ${updatedCount} refreshed`);
      if (data.hasMore) {
        toast("Hit the page cap — sync again (or raise max pages) to pull more", { icon: "ℹ️" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
      <h2 className="font-medium">Sync more reviews</h2>
      <p className="mt-1 text-xs text-gray-500">
        Re-fetches from Steam for this game — already-ingested reviews are refreshed in place
        (manually edited reviews keep their edited text), new ones are added.
      </p>
      <label className="mt-3 flex max-w-xs flex-col gap-1 text-sm">
        <span className="font-medium">Max pages (100 reviews/page, capped at 30)</span>
        <input
          type="number"
          min={1}
          max={30}
          value={maxPages}
          onChange={(e) => setMaxPages(Number(e.target.value))}
          className="rounded border border-gray-300 px-2 py-1"
        />
      </label>
      <button
        type="button"
        onClick={handleSync}
        disabled={loading}
        className="mt-3 rounded-lg bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {loading
          ? progress
            ? `Fetching page ${progress.page} of ${progress.maxPages} (${progress.reviewsSoFar} so far)…`
            : "Syncing…"
          : "Sync more reviews →"}
      </button>
      {loading && progress && (
        <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-gray-600 transition-[width]"
            style={{ width: `${Math.min(100, (progress.page / progress.maxPages) * 100)}%` }}
          />
        </div>
      )}
    </section>
  );
}

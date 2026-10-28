"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { upsertGameFromSteam, markGameSynced, type Game } from "@/lib/localDb/queries/games";
import { upsertReviewsBatch } from "@/lib/localDb/queries/reviews";
import {
  runIngestFetch,
  runFullIngestFetch,
  runParallelFullIngestFetch,
  toIngestRows,
  type IngestProgress,
  type FullIngestProgress,
  type ParallelGroupState,
} from "@/lib/ingestClient";
import {
  loadIngestCheckpoint,
  saveIngestCheckpoint,
  clearIngestCheckpoint,
  loadParallelIngestCheckpoint,
  saveParallelIngestCheckpoint,
  clearParallelIngestCheckpoint,
} from "@/lib/ingestCheckpoint";
import { useBackgroundTabWarning } from "@/lib/useBackgroundTabWarning";
import { STEAM_LANGUAGE_GROUPS } from "@/lib/steamLanguageGroups";

const DEFAULT_MAX_PAGES = 30;

// "Re-sync" for an existing game previously meant leaving its context
// entirely and re-pasting its Steam URL/App ID into the generic top-level
// /ingest form — this reuses the exact same NDJSON-streaming ingest
// machinery (via ingestClient.ts) without re-prompting for anything the app
// already knows.
export function SyncReviewsPanel({ game, onSynced }: { game: Game; onSynced: (game: Game) => void }) {
  const [maxPages, setMaxPages] = useState(DEFAULT_MAX_PAGES);
  const [language, setLanguage] = useState("all");
  const [syncAll, setSyncAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<IngestProgress | FullIngestProgress | null>(null);
  const [cumulativeFetched, setCumulativeFetched] = useState(0);
  const [parallelTotalOnSteam, setParallelTotalOnSteam] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useBackgroundTabWarning(loading && syncAll);

  const pendingCheckpoint = loadIngestCheckpoint(game.steamAppId);
  const pendingParallelCheckpoint = loadParallelIngestCheckpoint(game.steamAppId);

  async function handleSync() {
    setLoading(true);
    setProgress(null);
    setCumulativeFetched(0);
    setParallelTotalOnSteam(0);
    try {
      if (syncAll && language === "parallel") {
        const controller = new AbortController();
        abortRef.current = controller;
        let gameEnsure: Promise<Game> | null = null;
        const ensureGame = (details: Parameters<typeof upsertGameFromSteam>[1]) => {
          if (!gameEnsure) gameEnsure = upsertGameFromSteam(game.steamAppId, details);
          return gameEnsure;
        };
        let fetchedTotal = 0;
        let insertedTotal = 0;
        let updatedTotal = 0;

        const initialStates: Record<string, ParallelGroupState> = {};
        const existingParallel = loadParallelIngestCheckpoint(game.steamAppId);
        if (existingParallel) {
          const totalSoFar = existingParallel.streams.reduce((s, x) => s + x.fetchedTotal, 0);
          const resume = window.confirm(
            `Found an interrupted "sync all (parallel)" for this game: ${totalSoFar} review(s) already fetched, ` +
              `last updated ${new Date(existingParallel.updatedAt).toLocaleString()}.\n\n` +
              `Resume from there? Cancel to start over from scratch.`,
          );
          if (resume) {
            for (const s of existingParallel.streams) initialStates[s.languages] = { ...s };
            fetchedTotal = totalSoFar;
            insertedTotal = existingParallel.streams.reduce((s, x) => s + x.insertedTotal, 0);
            updatedTotal = existingParallel.streams.reduce((s, x) => s + x.updatedTotal, 0);
            setCumulativeFetched(fetchedTotal);
          } else {
            clearParallelIngestCheckpoint(game.steamAppId);
          }
        }

        const persistParallelCheckpoint = (states: ParallelGroupState[]) => {
          setParallelTotalOnSteam(states.reduce((s, x) => s + x.totalReviewsOnSteam, 0));
          saveParallelIngestCheckpoint({
            steamAppId: game.steamAppId,
            pagesPerBatch: maxPages,
            streams: states.map((s) => ({ ...s, cursor: s.cursor ?? "*" })),
            updatedAt: new Date().toISOString(),
          });
        };

        const summary = await runParallelFullIngestFetch(
          game.steamAppId,
          maxPages,
          STEAM_LANGUAGE_GROUPS,
          initialStates,
          async (reviews, gameDetails) => {
            const g = await ensureGame(gameDetails);
            const rows = toIngestRows(reviews);
            return upsertReviewsBatch(g.id, rows);
          },
          (ft, it, ut) => {
            fetchedTotal = ft;
            insertedTotal = it;
            updatedTotal = ut;
            setCumulativeFetched(ft);
          },
          controller,
          persistParallelCheckpoint,
        );
        clearParallelIngestCheckpoint(game.steamAppId);
        const updatedGame = gameEnsure ? await gameEnsure : await upsertGameFromSteam(summary.steamAppId, summary.gameDetails);
        await markGameSynced(updatedGame.id, fetchedTotal);
        onSynced({ ...updatedGame, lastIngestedAt: new Date().toISOString(), lastSyncReviewCount: fetchedTotal });
        toast.success(`Synced — ${insertedTotal} new, ${updatedTotal} refreshed across ${STEAM_LANGUAGE_GROUPS.length} parallel language streams`);
      } else if (syncAll) {
        const controller = new AbortController();
        abortRef.current = controller;
        const gameHolder: { current: Game | null } = { current: null };
        let insertedTotal = 0;
        let updatedTotal = 0;
        let fetchedTotal = 0;
        let startCursor: string | undefined;
        let effectiveLanguage = language;

        const checkpoint = loadIngestCheckpoint(game.steamAppId);
        if (checkpoint) {
          const resume = window.confirm(
            `Found an interrupted "sync all" for this game: ${checkpoint.fetchedTotal} review(s) already fetched` +
              (checkpoint.totalReviewsOnSteam ? ` of ~${checkpoint.totalReviewsOnSteam} on Steam` : "") +
              ` (language: ${checkpoint.language}), last updated ${new Date(checkpoint.updatedAt).toLocaleString()}.\n\n` +
              `Resume from there? Cancel to start over from scratch.`,
          );
          if (resume) {
            startCursor = checkpoint.cursor;
            effectiveLanguage = checkpoint.language;
            insertedTotal = checkpoint.insertedTotal;
            updatedTotal = checkpoint.updatedTotal;
            fetchedTotal = checkpoint.fetchedTotal;
            setCumulativeFetched(fetchedTotal);
          } else {
            clearIngestCheckpoint(game.steamAppId);
          }
        }

        const summary = await runFullIngestFetch(
          game.steamAppId,
          maxPages,
          setProgress,
          async (reviews, gameDetails) => {
            if (!gameHolder.current) gameHolder.current = await upsertGameFromSteam(game.steamAppId, gameDetails);
            const rows = toIngestRows(reviews);
            const { insertedCount, updatedCount } = await upsertReviewsBatch(gameHolder.current.id, rows);
            insertedTotal += insertedCount;
            updatedTotal += updatedCount;
            fetchedTotal += reviews.length;
            setCumulativeFetched(fetchedTotal);
          },
          controller.signal,
          {
            language: effectiveLanguage,
            startCursor,
            onCheckpoint: (cursor, totalReviewsOnSteam) => {
              saveIngestCheckpoint({
                steamAppId: game.steamAppId,
                language: effectiveLanguage,
                cursor,
                pagesPerBatch: maxPages,
                fetchedTotal,
                insertedTotal,
                updatedTotal,
                totalReviewsOnSteam,
                updatedAt: new Date().toISOString(),
              });
            },
          },
        );
        clearIngestCheckpoint(game.steamAppId);
        // A resumed run that had nothing left to fetch never calls onBatch,
        // so gameHolder is still empty even though the game itself may
        // already exist locally from before the interruption.
        const updatedGame = gameHolder.current ?? (await upsertGameFromSteam(summary.steamAppId, summary.gameDetails));
        await markGameSynced(updatedGame.id, fetchedTotal);
        onSynced({ ...updatedGame, lastIngestedAt: new Date().toISOString(), lastSyncReviewCount: fetchedTotal });
        toast.success(`Synced — ${insertedTotal} new, ${updatedTotal} refreshed`);
      } else {
        // "Parallel" only makes sense across a full multi-batch run — a
        // single bounded batch falls back to the plain "all" stream instead
        // of sending the meaningless literal value "parallel" to Steam.
        const data = await runIngestFetch(game.steamAppId, maxPages, setProgress, language === "parallel" ? "all" : language);
        const updatedGame = await upsertGameFromSteam(data.steamAppId, data.gameDetails);
        const rows = toIngestRows(data.reviews);
        const { insertedCount, updatedCount } = await upsertReviewsBatch(updatedGame.id, rows);
        await markGameSynced(updatedGame.id, data.reviews.length);
        onSynced({ ...updatedGame, lastIngestedAt: new Date().toISOString(), lastSyncReviewCount: data.reviews.length });
        toast.success(`Synced — ${insertedCount} new, ${updatedCount} refreshed`);
        if (data.hasMore) {
          toast("Hit the page cap — sync again (or raise max pages) to pull more", { icon: "ℹ️" });
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        toast("Sync cancelled — reviews fetched so far were kept", { icon: "ℹ️" });
      } else {
        toast.error(err instanceof Error ? err.message : "Sync failed");
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
    <section className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
      <h2 className="font-medium">Sync more reviews</h2>
      <p className="mt-1 text-xs text-gray-500">
        Re-fetches from Steam for this game — already-ingested reviews are refreshed in place
        (manually edited reviews keep their edited text), new ones are added.
      </p>
      <label className="mt-3 flex max-w-xs flex-col gap-1 text-sm">
        <span className="font-medium">
          {syncAll ? "Reviews per batch (100/page, 30 pages/batch max)" : "Max pages (100 reviews/page, capped at 30)"}
        </span>
        <input
          type="number"
          min={1}
          max={30}
          value={maxPages}
          onChange={(e) => setMaxPages(Number(e.target.value))}
          className="rounded border border-gray-300 px-2 py-1"
        />
      </label>
      <label className="mt-3 flex max-w-xs flex-col gap-1 text-sm">
        <span className="font-medium">Language</span>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1"
        >
          <option value="all">All languages</option>
          <option value="english">English only</option>
          {syncAll && <option value="parallel">All languages (parallel, faster)</option>}
        </select>
        <span className="text-xs text-gray-500">
          {language === "parallel"
            ? "Fetches several languages at once instead of one long sequential stream — faster, but puts more concurrent load on Steam's endpoint."
            : "English only is much faster for big, popular games."}
        </span>
      </label>
      <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={syncAll}
          onChange={(e) => {
            setSyncAll(e.target.checked);
            if (!e.target.checked && language === "parallel") setLanguage("all");
          }}
        />
        <span>
          Sync ALL reviews — keeps fetching until Steam has no more (cancel any time; keep this
          tab in the foreground, backgrounded tabs get throttled hard by the browser)
        </span>
      </label>
      {pendingCheckpoint && !loading && (
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          Found an interrupted &quot;sync all&quot; for this game: {pendingCheckpoint.fetchedTotal} review(s)
          already fetched{pendingCheckpoint.totalReviewsOnSteam ? ` of ~${pendingCheckpoint.totalReviewsOnSteam}` : ""}{" "}
          (language: {pendingCheckpoint.language}). Checking &quot;Sync ALL&quot; and syncing will offer to
          resume it.
        </p>
      )}
      {pendingParallelCheckpoint && !loading && (
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          Found an interrupted &quot;sync all (parallel)&quot; for this game:{" "}
          {pendingParallelCheckpoint.streams.reduce((s, x) => s + x.fetchedTotal, 0)} review(s) already fetched.
          Selecting &quot;All languages (parallel)&quot; and syncing will offer to resume it.
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleSync}
          disabled={loading}
          className="rounded-lg bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {loading
            ? syncAll && language === "parallel"
              ? `Fetching in parallel across ${STEAM_LANGUAGE_GROUPS.length} language streams… (${cumulativeFetched} so far)…`
              : progress && "batch" in progress
                ? `Batch ${progress.batch}, page ${progress.page} of ${progress.maxPages} (${cumulativeFetched} so far)…`
                : progress
                  ? `Fetching page ${progress.page} of ${progress.maxPages} (${progress.reviewsSoFar} so far)…`
                  : "Syncing…"
            : "Sync more reviews →"}
        </button>
        {loading && syncAll && (
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm"
          >
            Cancel
          </button>
        )}
      </div>
      {loading && syncAll && language === "parallel" && parallelTotalOnSteam > 0 && (
        <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-gray-600 transition-[width]"
            style={{ width: `${Math.min(100, (cumulativeFetched / parallelTotalOnSteam) * 100)}%` }}
          />
        </div>
      )}
      {loading && !(syncAll && language === "parallel") && progress && !("batch" in progress) && (
        <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-gray-600 transition-[width]"
            style={{ width: `${Math.min(100, (progress.page / progress.maxPages) * 100)}%` }}
          />
        </div>
      )}
      {loading && !(syncAll && language === "parallel") && progress && "batch" in progress && progress.totalReviewsOnSteam > 0 && (
        <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-gray-600 transition-[width]"
            style={{
              width: `${Math.min(100, (cumulativeFetched / progress.totalReviewsOnSteam) * 100)}%`,
            }}
          />
        </div>
      )}
    </section>
  );
}

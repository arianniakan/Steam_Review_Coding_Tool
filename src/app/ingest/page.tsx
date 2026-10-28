"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { parseSteamAppId } from "@/lib/steam";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { upsertGameFromSteam } from "@/lib/localDb/queries/games";
import { upsertReviewsBatch } from "@/lib/localDb/queries/reviews";
import {
  runIngestFetch,
  runFullIngestFetch,
  runParallelFullIngestFetch,
  fetchReviewCount,
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
  const [maxPages, setMaxPages] = useState(30);
  const [language, setLanguage] = useState("all");
  const [ingestAll, setIngestAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<IngestProgress | FullIngestProgress | null>(null);
  const [cumulativeFetched, setCumulativeFetched] = useState(0);
  const [parallelTotalOnSteam, setParallelTotalOnSteam] = useState(0);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableCount, setAvailableCount] = useState<number | null>(null);
  const [availableCountLoading, setAvailableCountLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useBackgroundTabWarning(loading && ingestAll);

  const previewAppId = appId ? parseSteamAppId(appId) : null;
  const pendingCheckpoint = previewAppId !== null ? loadIngestCheckpoint(previewAppId) : null;
  const pendingParallelCheckpoint =
    previewAppId !== null ? loadParallelIngestCheckpoint(previewAppId) : null;

  // "parallel" isn't a real Steam language value — it means "all languages,
  // split into concurrent streams" — so the count check always asks for the
  // same thing a parallel run would actually cover.
  const countLanguage = language === "parallel" ? "all" : language;

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (previewAppId === null) {
        if (!cancelled) setAvailableCount(null);
        return;
      }
      if (!cancelled) setAvailableCountLoading(true);
      const count = await fetchReviewCount(previewAppId, countLanguage);
      if (!cancelled) {
        setAvailableCount(count);
        setAvailableCountLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [previewAppId, countLanguage]);

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
    // Seeded from the upfront count check so the progress bar has a real
    // denominator immediately instead of sitting at 0% until the first
    // batch's own total comes back.
    setParallelTotalOnSteam(availableCount ?? 0);
    setError(null);
    setResult(null);
    try {
      if (ingestAll && language === "parallel") {
        const controller = new AbortController();
        abortRef.current = controller;
        let gameEnsure: Promise<{ id: string; name: string }> | null = null;
        const ensureGame = (details: Parameters<typeof upsertGameFromSteam>[1]) => {
          if (!gameEnsure) gameEnsure = upsertGameFromSteam(parsedId, details);
          return gameEnsure;
        };
        let fetchedTotal = 0;
        let insertedTotal = 0;
        let updatedTotal = 0;

        const initialStates: Record<string, ParallelGroupState> = {};
        const existingParallel = loadParallelIngestCheckpoint(parsedId);
        if (existingParallel) {
          const totalSoFar = existingParallel.streams.reduce((s, x) => s + x.fetchedTotal, 0);
          const resume = window.confirm(
            `Found an interrupted "ingest all (parallel)" for this game: ${totalSoFar} review(s) already fetched, ` +
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
            clearParallelIngestCheckpoint(parsedId);
          }
        }

        const persistParallelCheckpoint = (states: ParallelGroupState[]) => {
          setParallelTotalOnSteam(states.reduce((s, x) => s + x.totalReviewsOnSteam, 0));
          saveParallelIngestCheckpoint({
            steamAppId: parsedId,
            pagesPerBatch: maxPages,
            streams: states.map((s) => ({ ...s, cursor: s.cursor ?? "*" })),
            updatedAt: new Date().toISOString(),
          });
        };

        const summary = await runParallelFullIngestFetch(
          parsedId,
          maxPages,
          STEAM_LANGUAGE_GROUPS,
          initialStates,
          async (reviews, gameDetails) => {
            const game = await ensureGame(gameDetails);
            const rows = toIngestRows(reviews);
            return upsertReviewsBatch(game.id, rows);
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
        clearParallelIngestCheckpoint(parsedId);
        const game = gameEnsure ? await gameEnsure : await upsertGameFromSteam(summary.steamAppId, summary.gameDetails);
        setResult({
          gameId: game.id,
          gameName: game.name,
          steamAppId: summary.steamAppId,
          fetchedFromSteam: fetchedTotal,
          ingestedCount: insertedTotal,
          updatedCount: updatedTotal,
          pagesFetched: summary.totalPagesFetched,
          hasMore: false,
        });
        toast.success(`Ingested ${insertedTotal} review(s) for ${game.name} across ${STEAM_LANGUAGE_GROUPS.length} parallel language streams`);
      } else if (ingestAll) {
        const controller = new AbortController();
        abortRef.current = controller;
        const gameHolder: { current: { id: string; name: string } | null } = { current: null };
        let insertedTotal = 0;
        let updatedTotal = 0;
        let fetchedTotal = 0;
        let startCursor: string | undefined;
        let effectiveLanguage = language;

        const checkpoint = loadIngestCheckpoint(parsedId);
        if (checkpoint) {
          const resume = window.confirm(
            `Found an interrupted "ingest all" for this game: ${checkpoint.fetchedTotal} review(s) already fetched` +
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
            clearIngestCheckpoint(parsedId);
          }
        }

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
          {
            language: effectiveLanguage,
            startCursor,
            onCheckpoint: (cursor, totalReviewsOnSteam) => {
              saveIngestCheckpoint({
                steamAppId: parsedId,
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
        clearIngestCheckpoint(parsedId);
        // A resumed run that had nothing left to fetch never calls onBatch,
        // so gameHolder is still empty even though the game itself may
        // already exist locally from before the interruption.
        const game = gameHolder.current ?? (await upsertGameFromSteam(summary.steamAppId, summary.gameDetails));
        setResult({
          gameId: game.id,
          gameName: game.name,
          steamAppId: summary.steamAppId,
          fetchedFromSteam: fetchedTotal,
          ingestedCount: insertedTotal,
          updatedCount: updatedTotal,
          pagesFetched: summary.totalPagesFetched,
          hasMore: false,
        });
        toast.success(`Ingested ${insertedTotal} review(s) for ${game.name}`);
      } else {
        // "Parallel" only makes sense across a full multi-batch run — a
        // single bounded batch falls back to the plain "all" stream instead
        // of sending the meaningless literal value "parallel" to Steam.
        const data = await runIngestFetch(parsedId, maxPages, setProgress, language === "parallel" ? "all" : language);

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
          {previewAppId !== null && (
            <span className="text-xs text-gray-500">
              {availableCountLoading
                ? "Checking how many reviews Steam has…"
                : availableCount !== null
                  ? `${availableCount.toLocaleString()} review(s) on Steam${
                      countLanguage !== "all" ? ` (${countLanguage})` : ""
                    }`
                  : "Couldn't check Steam's review count — the App ID may be invalid"}
            </span>
          )}
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

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Language</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          >
            <option value="all">All languages</option>
            <option value="english">English only</option>
            {ingestAll && <option value="parallel">All languages (parallel, faster)</option>}
          </select>
          <span className="text-xs text-gray-500">
            {language === "parallel"
              ? "Fetches several languages at once instead of one long sequential stream — faster, but puts more concurrent load on Steam's endpoint."
              : "English only is much faster for big, popular games — fewer total reviews to page through."}
          </span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ingestAll}
            onChange={(e) => {
              setIngestAll(e.target.checked);
              if (!e.target.checked && language === "parallel") setLanguage("all");
            }}
          />
          <span>
            Ingest ALL reviews — keeps fetching batch after batch until Steam has no more
            (can take a while for popular games; cancel any time without losing progress already saved,
            and keep this tab in the foreground — backgrounded tabs get throttled hard by the browser)
          </span>
        </label>

        {pendingCheckpoint && !loading && (
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Found an interrupted &quot;ingest all&quot; for this game: {pendingCheckpoint.fetchedTotal} review(s)
            already fetched{pendingCheckpoint.totalReviewsOnSteam ? ` of ~${pendingCheckpoint.totalReviewsOnSteam}` : ""}{" "}
            (language: {pendingCheckpoint.language}), last updated{" "}
            {new Date(pendingCheckpoint.updatedAt).toLocaleString()}. Checking &quot;Ingest ALL&quot; and
            submitting will offer to resume it.
          </p>
        )}
        {pendingParallelCheckpoint && !loading && (
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Found an interrupted &quot;ingest all (parallel)&quot; for this game:{" "}
            {pendingParallelCheckpoint.streams.reduce((s, x) => s + x.fetchedTotal, 0)} review(s) already fetched,
            last updated {new Date(pendingParallelCheckpoint.updatedAt).toLocaleString()}. Selecting
            &quot;All languages (parallel)&quot; and submitting will offer to resume it.
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {loading
              ? ingestAll && language === "parallel"
                ? `Fetching in parallel across ${STEAM_LANGUAGE_GROUPS.length} language streams… (${cumulativeFetched} reviews so far)…`
                : progress && "batch" in progress
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
        {loading && ingestAll && language === "parallel" && parallelTotalOnSteam > 0 && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-gray-600 transition-[width]"
              style={{ width: `${Math.min(100, (cumulativeFetched / parallelTotalOnSteam) * 100)}%` }}
            />
          </div>
        )}
        {loading && !(ingestAll && language === "parallel") && progress && !("batch" in progress) && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-gray-600 transition-[width]"
              style={{ width: `${Math.min(100, (progress.page / progress.maxPages) * 100)}%` }}
            />
          </div>
        )}
        {loading && !(ingestAll && language === "parallel") && progress && "batch" in progress && progress.totalReviewsOnSteam > 0 && (
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

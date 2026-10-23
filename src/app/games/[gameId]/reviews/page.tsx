"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ReviewFilterForm, FILTER_KEYS } from "@/components/ReviewFilterForm";
import { ActiveFilterChips } from "@/components/ActiveFilterChips";
import type { ReviewSearchParams } from "@/lib/localDb/queries/reviewFilters";
import {
  countReviews,
  countCodedReviews,
  listReviews,
  listReviewIdsOrdered,
  groupReviewsByLanguage,
  deleteReview,
  type ReviewWithTaggingCount,
} from "@/lib/localDb/queries/reviews";
import { listSavedSamplesForGame, type SavedSample } from "@/lib/localDb/queries/savedSamples";
import { getGameById, type Game } from "@/lib/localDb/queries/games";
import { listCodebooksForGame, type Codebook } from "@/lib/localDb/queries/codebooks";
import { getGatedReviewIds } from "@/lib/localDb/queries/training";
import {
  listIrrelevantReviewIds,
  markReviewIrrelevant,
  markReviewsIrrelevantBulk,
} from "@/lib/localDb/queries/reviewRelevance";
import { resolveActiveCodebookId } from "@/lib/activeCodebook";
import { SavedSamples } from "./SavedSamples";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { ExpandableText } from "@/components/ExpandableText";
import { CodebookToolbar } from "@/components/CodebookToolbar";
import { PageLoading } from "@/components/PageLoading";

export default function ReviewsPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const searchParams = useSearchParams();
  const sp: ReviewSearchParams = Object.fromEntries(searchParams.entries());
  const page = Math.max(Number(sp.page) || 1, 1);

  const [game, setGame] = useState<Game | null | undefined>(undefined);
  const [total, setTotal] = useState(0);
  const [codedCount, setCodedCount] = useState(0);
  const [reviews, setReviews] = useState<ReviewWithTaggingCount[]>([]);
  const [savedSamples, setSavedSamples] = useState<SavedSample[]>([]);
  const [languages, setLanguages] = useState<{ language: string; count: number }[]>([]);
  const [codebooks, setCodebooks] = useState<Codebook[]>([]);
  const [activeCodebookId, setActiveCodebookId] = useState<string | undefined>(undefined);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkMarking, setBulkMarking] = useState(false);
  const [confirmingBulkIrrelevant, setConfirmingBulkIrrelevant] = useState(false);
  const [confirmingIrrelevantId, setConfirmingIrrelevantId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [keepOnlyMarking, setKeepOnlyMarking] = useState(false);
  const [confirmingKeepOnly, setConfirmingKeepOnly] = useState(false);
  const [keepOnlyCount, setKeepOnlyCount] = useState<number | null>(null);

  async function load() {
    const g = await getGameById(gameId);
    setGame(g);
    if (!g) {
      setLoading(false);
      return;
    }
    const cbs = await listCodebooksForGame(gameId);
    const active = resolveActiveCodebookId(gameId, cbs, searchParams.get("codebookId"));
    setCodebooks(cbs);
    setActiveCodebookId(active);
    const [gated, irrelevant] = active
      ? await Promise.all([getGatedReviewIds(active), listIrrelevantReviewIds(active)])
      : [[], []];
    const excluded = [...gated, ...irrelevant];
    setExcludedIds(excluded);

    const [t, c, r, s, l] = await Promise.all([
      countReviews(gameId, sp, excluded),
      countCodedReviews(gameId, sp, active, excluded),
      listReviews(gameId, sp, page, active, undefined, excluded),
      listSavedSamplesForGame(gameId),
      groupReviewsByLanguage(gameId),
    ]);
    setTotal(t);
    setCodedCount(c);
    setReviews(r);
    setSavedSamples(s);
    setLanguages(l);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, searchParams.toString()]);

  async function handleMarkIrrelevant(reviewId: string) {
    if (!activeCodebookId) return;
    if (confirmingIrrelevantId !== reviewId) {
      setConfirmingIrrelevantId(reviewId);
      return;
    }
    setConfirmingIrrelevantId(null);
    await markReviewIrrelevant(reviewId, activeCodebookId);
    setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    setTotal((prev) => Math.max(prev - 1, 0));
  }

  async function handleMarkAllIrrelevant() {
    if (!activeCodebookId) return;
    if (!confirmingBulkIrrelevant) {
      setConfirmingBulkIrrelevant(true);
      return;
    }
    setBulkMarking(true);
    try {
      const matchingIds = await listReviewIdsOrdered(gameId, sp, excludedIds);
      await markReviewsIrrelevantBulk(matchingIds, activeCodebookId);
      await load();
    } finally {
      setBulkMarking(false);
      setConfirmingBulkIrrelevant(false);
    }
  }

  // Complement of handleMarkAllIrrelevant: excludes everything that does
  // NOT match the current filter, so the filtered subset is what's kept.
  // The inverse count isn't known until queried, so it's fetched when the
  // confirm step first opens rather than pre-computed on every render.
  async function handleKeepOnlyFiltered() {
    if (!activeCodebookId) return;
    if (!confirmingKeepOnly) {
      const inverseCount = await countReviews(gameId, sp, excludedIds, { invert: true });
      setKeepOnlyCount(inverseCount);
      setConfirmingKeepOnly(true);
      return;
    }
    setKeepOnlyMarking(true);
    try {
      const nonMatchingIds = await listReviewIdsOrdered(gameId, sp, excludedIds, { invert: true });
      await markReviewsIrrelevantBulk(nonMatchingIds, activeCodebookId);
      await load();
    } finally {
      setKeepOnlyMarking(false);
      setConfirmingKeepOnly(false);
      setKeepOnlyCount(null);
    }
  }

  async function handleDeleteReview(reviewId: string) {
    if (confirmingDeleteId !== reviewId) {
      setConfirmingDeleteId(reviewId);
      return;
    }
    setDeletingId(reviewId);
    try {
      await deleteReview(reviewId);
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
      setTotal((prev) => Math.max(prev - 1, 0));
    } finally {
      setDeletingId(null);
      setConfirmingDeleteId(null);
    }
  }

  const PAGE_SIZE = 25;
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const hasActiveFilter = FILTER_KEYS.some((k) => sp[k]);

  const filterParams = new URLSearchParams();
  if (sp.voted) filterParams.set("voted", sp.voted);
  if (sp.earlyAccess) filterParams.set("earlyAccess", sp.earlyAccess);
  if (sp.playtime) filterParams.set("playtime", sp.playtime);
  if (sp.from) filterParams.set("from", sp.from);
  if (sp.to) filterParams.set("to", sp.to);
  if (sp.purchase) filterParams.set("purchase", sp.purchase);
  if (sp.language) filterParams.set("language", sp.language);
  if (sp.minVotes) filterParams.set("minVotes", sp.minVotes);
  if (sp.minLength) filterParams.set("minLength", sp.minLength);
  if (sp.sort) filterParams.set("sort", sp.sort);

  function pageHref(p: number) {
    const params = new URLSearchParams(filterParams);
    params.set("page", String(p));
    return `?${params.toString()}`;
  }

  const tagQuery = new URLSearchParams(filterParams);
  if (activeCodebookId) tagQuery.set("codebookId", activeCodebookId);

  if (game === undefined || loading) {
    return <PageLoading />;
  }
  if (game === null) {
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-8">
        <p className="text-sm text-gray-500">Game not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8">
      <Breadcrumbs
        items={[
          { label: "Games", href: "/games" },
          { label: game.name },
        ]}
      />
      <div className="mt-2">
        <BackButton href="/games" label="Games" />
      </div>

      <div className="mt-2 flex gap-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm p-4">
        {game.headerImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={game.headerImage}
            alt={game.name}
            className="h-24 w-auto shrink-0 rounded-lg object-cover"
          />
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-semibold">{game.name}</h1>
            <Link href={`/games/${gameId}/codebooks`} className="shrink-0 text-sm underline">
              All codebooks →
            </Link>
          </div>
          {(game.genres.length > 0 || game.releaseDate || game.developers.length > 0) && (
            <p className="mt-1 text-xs text-gray-500">
              {[game.genres.join(", "), game.releaseDate, game.developers.join(", ")]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {game.shortDescription && (
            <ExpandableText text={game.shortDescription} className="mt-2 text-sm text-gray-600" />
          )}
        </div>
      </div>

      <CodebookToolbar
        scope={{ type: "game", gameId }}
        contextName={game.name}
        codebooks={codebooks}
        activeCodebookId={activeCodebookId}
      />

      <p className="mt-2 text-sm text-gray-500">
        {total} review{total === 1 ? "" : "s"} matching current filters ·{" "}
        {codedCount} of {total} coded
      </p>

      <ReviewFilterForm sp={sp} languages={languages} clearHref={`/games/${gameId}/reviews`} />
      <ActiveFilterChips sp={sp} />

      {activeCodebookId && total > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          <p className="font-medium">Exclude reviews from this codebook</p>
          <p className="mt-1">
            Excludes reviews from <span className="font-medium">this codebook only</span> — other
            codebooks on this game still see them, and it&apos;s reversible from the{" "}
            <span className="font-medium">Excluded</span> page above. For permanent removal,
            delete the review instead (below each one).
          </p>
          {confirmingBulkIrrelevant ? (
            <div className="mt-2 flex items-center gap-3">
              <span>Exclude all {total} shown reviews from this codebook?</span>
              <button
                type="button"
                onClick={handleMarkAllIrrelevant}
                disabled={bulkMarking}
                className="font-medium underline disabled:opacity-50"
              >
                {bulkMarking ? "Excluding…" : "Yes, exclude all shown"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingBulkIrrelevant(false)}
                disabled={bulkMarking}
                className="underline disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={handleMarkAllIrrelevant} className="mt-2 underline">
              Exclude all {total} shown →
            </button>
          )}

          {hasActiveFilter && (
            <div className="mt-3 border-t border-amber-200 pt-2">
              {confirmingKeepOnly ? (
                <div className="flex items-center gap-3">
                  <span>
                    Exclude the other {keepOnlyCount ?? "…"} review(s) not shown by this filter —
                    keeping only these {total}?
                  </span>
                  <button
                    type="button"
                    onClick={handleKeepOnlyFiltered}
                    disabled={keepOnlyMarking}
                    className="font-medium underline disabled:opacity-50"
                  >
                    {keepOnlyMarking ? "Excluding…" : "Yes, exclude the rest"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingKeepOnly(false);
                      setKeepOnlyCount(null);
                    }}
                    disabled={keepOnlyMarking}
                    className="underline disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" onClick={handleKeepOnlyFiltered} className="underline">
                  Exclude everything NOT shown (keep these {total}) →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <SavedSamples
        gameId={gameId}
        currentQuery={filterParams.toString()}
        initialSamples={savedSamples}
      />

      <ul className="mt-6 flex flex-col gap-4">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className={r.votedUp ? "text-green-700" : "text-red-700"}>
                {r.votedUp ? "Recommended" : "Not recommended"}
              </span>
              <span>·</span>
              <span>{(r.playtimeForever / 60).toFixed(1)}h playtime</span>
              <span>·</span>
              <span>{new Date(r.timestampCreated).toISOString().slice(0, 10)}</span>
              {r.writtenDuringEarlyAccess && (
                <>
                  <span>·</span>
                  <span>Early access</span>
                </>
              )}
              <span>·</span>
              <span title="Steam quality/helpfulness score">
                {r.votesUp} helpful ({(r.weightedVoteScore * 100).toFixed(0)}% score)
              </span>
              {r.steamPurchase && (
                <>
                  <span>·</span>
                  <span>Verified purchase</span>
                </>
              )}
              <span>·</span>
              {r.taggingCount > 0 ? (
                <span className="text-green-700">✓ Coded ({r.taggingCount})</span>
              ) : (
                <span>Not yet coded</span>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap">{r.text}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Link
                href={`/games/${gameId}/reviews/${r.id}?${tagQuery.toString()}`}
                className="inline-block text-xs underline"
              >
                Tag this review →
              </Link>
              {activeCodebookId &&
                (confirmingIrrelevantId === r.id ? (
                  <span className="flex items-center gap-2 text-xs">
                    <span className="text-amber-700">Exclude this review from the codebook?</span>
                    <button type="button" onClick={() => handleMarkIrrelevant(r.id)} className="font-medium text-amber-700 underline">
                      Yes, exclude
                    </button>
                    <button type="button" onClick={() => setConfirmingIrrelevantId(null)} className="text-gray-500 underline">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleMarkIrrelevant(r.id)}
                    className="text-xs text-amber-700 underline"
                  >
                    Exclude from codebook →
                  </button>
                ))}
              {confirmingDeleteId === r.id ? (
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-red-700">Permanently delete this review?</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteReview(r.id)}
                    disabled={deletingId === r.id}
                    className="font-medium text-red-700 underline disabled:opacity-50"
                  >
                    {deletingId === r.id ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button type="button" onClick={() => setConfirmingDeleteId(null)} className="text-gray-500 underline">
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleDeleteReview(r.id)}
                  className="text-xs text-red-600 underline"
                >
                  Delete review →
                </button>
              )}
            </div>
          </li>
        ))}
        {reviews.length === 0 && (
          <li className="text-sm text-gray-500">No reviews match these filters.</li>
        )}
      </ul>

      {totalPages > 1 && (
        <nav className="mt-6 flex items-center gap-3 text-sm">
          <Link
            href={pageHref(Math.max(page - 1, 1))}
            aria-disabled={page <= 1}
            className={page <= 1 ? "pointer-events-none text-gray-300" : "underline"}
          >
            ← Prev
          </Link>
          <span>
            Page {page} of {totalPages}
          </span>
          <Link
            href={pageHref(Math.min(page + 1, totalPages))}
            aria-disabled={page >= totalPages}
            className={page >= totalPages ? "pointer-events-none text-gray-300" : "underline"}
          >
            Next →
          </Link>
        </nav>
      )}
    </main>
  );
}

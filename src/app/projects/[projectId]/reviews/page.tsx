"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ReviewFilterForm, FILTER_KEYS } from "@/components/ReviewFilterForm";
import { ActiveFilterChips } from "@/components/ActiveFilterChips";
import { CodebookToolbar } from "@/components/CodebookToolbar";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
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
import { getProjectById, listGamesForProject, type Project } from "@/lib/localDb/queries/projects";
import { listCodebooksForProject, type Codebook } from "@/lib/localDb/queries/codebooks";
import { getGatedReviewIds } from "@/lib/localDb/queries/training";
import {
  listIrrelevantReviewIds,
  markReviewIrrelevant,
  markReviewsIrrelevantBulk,
} from "@/lib/localDb/queries/reviewRelevance";
import { resolveActiveProjectCodebookId } from "@/lib/activeCodebook";
import type { Game } from "@/lib/localDb/queries/games";
import { PageLoading } from "@/components/PageLoading";

const DEFAULT_PER_GAME = 5;

interface MixedRow extends ReviewWithTaggingCount {
  gameName: string;
}

export default function ProjectMixedReviewsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const sp: ReviewSearchParams = Object.fromEntries(searchParams.entries());
  const page = Math.max(Number(sp.page) || 1, 1);
  const perGame = Math.max(Number(searchParams.get("perGame")) || DEFAULT_PER_GAME, 1);

  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [games, setGames] = useState<Game[]>([]);
  const [rows, setRows] = useState<MixedRow[]>([]);
  const [perGameCounts, setPerGameCounts] = useState<Record<string, number>>({});
  const [codedCount, setCodedCount] = useState(0);
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
    const p = await getProjectById(projectId);
    setProject(p);
    if (!p) {
      setLoading(false);
      return;
    }
    const gs = await listGamesForProject(projectId);
    setGames(gs);
    if (gs.length === 0) {
      setLoading(false);
      return;
    }
    const gameIds = gs.map((g) => g.id);
    const cbs = await listCodebooksForProject(projectId);
    const active = resolveActiveProjectCodebookId(projectId, cbs, searchParams.get("codebookId"));
    setCodebooks(cbs);
    setActiveCodebookId(active);
    const [gated, irrelevant] = active
      ? await Promise.all([getGatedReviewIds(active), listIrrelevantReviewIds(active)])
      : [[], []];
    const excluded = [...gated, ...irrelevant];
    setExcludedIds(excluded);

    // Round-robin: fetch each game's own page of `perGame` reviews (its
    // own LIMIT/OFFSET), then interleave — deterministic and bookmarkable,
    // unlike a randomized proportional sample.
    const [perGameReviews, counts, coded, langs] = await Promise.all([
      Promise.all(gs.map((g) => listReviews(g.id, sp, page, active, perGame, excluded))),
      Promise.all(gs.map((g) => countReviews(g.id, sp, excluded))),
      countCodedReviews(gameIds, sp, active, excluded),
      groupReviewsByLanguage(gameIds),
    ]);

    const gameNameById = new Map(gs.map((g) => [g.id, g.name]));
    const interleaved: MixedRow[] = [];
    for (let i = 0; i < perGame; i++) {
      for (let gi = 0; gi < gs.length; gi++) {
        const r = perGameReviews[gi]![i];
        if (r) interleaved.push({ ...r, gameName: gameNameById.get(r.gameId) ?? "Unknown game" });
      }
    }
    setRows(interleaved);
    setPerGameCounts(Object.fromEntries(gs.map((g, i) => [g.id, counts[i]!])));
    setCodedCount(coded);
    setLanguages(langs);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, searchParams.toString()]);

  async function handleMarkIrrelevant(reviewId: string) {
    if (!activeCodebookId) return;
    if (confirmingIrrelevantId !== reviewId) {
      setConfirmingIrrelevantId(reviewId);
      return;
    }
    setConfirmingIrrelevantId(null);
    await markReviewIrrelevant(reviewId, activeCodebookId);
    setRows((prev) => prev.filter((r) => r.id !== reviewId));
  }

  async function handleMarkAllIrrelevant() {
    if (!activeCodebookId || games.length === 0) return;
    if (!confirmingBulkIrrelevant) {
      setConfirmingBulkIrrelevant(true);
      return;
    }
    setBulkMarking(true);
    try {
      const gameIds = games.map((g) => g.id);
      const matchingIds = await listReviewIdsOrdered(gameIds, sp, excludedIds);
      await markReviewsIrrelevantBulk(matchingIds, activeCodebookId);
      await load();
    } finally {
      setBulkMarking(false);
      setConfirmingBulkIrrelevant(false);
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
      setRows((prev) => prev.filter((r) => r.id !== reviewId));
    } finally {
      setDeletingId(null);
      setConfirmingDeleteId(null);
    }
  }

  // Complement of handleMarkAllIrrelevant: excludes everything that does
  // NOT match the current filter, so the filtered subset is what's kept.
  // The inverse count isn't known until queried, so it's fetched when the
  // confirm step first opens rather than pre-computed on every render.
  async function handleKeepOnlyFiltered() {
    if (!activeCodebookId || games.length === 0) return;
    const gameIds = games.map((g) => g.id);
    if (!confirmingKeepOnly) {
      const inverseCount = await countReviews(gameIds, sp, excludedIds, { invert: true });
      setKeepOnlyCount(inverseCount);
      setConfirmingKeepOnly(true);
      return;
    }
    setKeepOnlyMarking(true);
    try {
      const nonMatchingIds = await listReviewIdsOrdered(gameIds, sp, excludedIds, { invert: true });
      await markReviewsIrrelevantBulk(nonMatchingIds, activeCodebookId);
      await load();
    } finally {
      setKeepOnlyMarking(false);
      setConfirmingKeepOnly(false);
      setKeepOnlyCount(null);
    }
  }

  const totalPerGame = Object.values(perGameCounts);
  const total = totalPerGame.reduce((a, b) => a + b, 0);
  const longestGamePages = Math.max(1, ...totalPerGame.map((c) => Math.ceil(c / perGame)));
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
  filterParams.set("perGame", String(perGame));

  function pageHref(p: number) {
    const params = new URLSearchParams(filterParams);
    params.set("page", String(p));
    return `?${params.toString()}`;
  }

  function perGameHref(n: number) {
    const params = new URLSearchParams(filterParams);
    params.set("perGame", String(n));
    params.set("page", "1");
    return `?${params.toString()}`;
  }

  const tagQuery = new URLSearchParams(filterParams);
  if (activeCodebookId) tagQuery.set("codebookId", activeCodebookId);

  if (project === undefined || loading) {
    return <PageLoading />;
  }
  if (project === null) {
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-8">
        <p className="text-sm text-gray-500">Project not found.</p>
      </main>
    );
  }
  if (games.length === 0) {
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-8">
        <Breadcrumbs items={[{ label: "Projects", href: "/projects" }, { label: project.name }]} />
        <div className="mt-2">
          <BackButton href={`/projects/${projectId}`} label={project.name} />
        </div>
        <p className="mt-4 text-sm text-gray-500">
          This project has no games yet — add some from the{" "}
          <Link href={`/projects/${projectId}`} className="underline">
            project page
          </Link>
          .
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8">
      <Breadcrumbs
        items={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${projectId}` },
        ]}
      />
      <div className="mt-2">
        <BackButton href={`/projects/${projectId}`} label={project.name} />
      </div>

      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{project.name} — Mixed reviews</h1>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {games.map((g) => g.name).join(", ")} — {perGame} review(s) shown per game, per page.
      </p>

      <CodebookToolbar
        scope={{ type: "project", projectId }}
        contextName={project.name}
        codebooks={codebooks}
        activeCodebookId={activeCodebookId}
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
        <span>
          {total} review{total === 1 ? "" : "s"} matching current filters across {games.length} game
          {games.length === 1 ? "" : "s"} · {codedCount} of {total} coded
        </span>
        <label className="flex items-center gap-1.5 text-xs">
          <span>Reviews per game:</span>
          <select
            value={perGame}
            onChange={(e) => {
              router.push(perGameHref(Number(e.target.value)));
            }}
            className="rounded border border-gray-300 px-1.5 py-0.5"
          >
            {[3, 5, 10, 15].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ReviewFilterForm sp={sp} languages={languages} clearHref={`/projects/${projectId}/reviews?perGame=${perGame}`} />
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
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span>Exclude all {total} shown reviews from this codebook?</span>
              <button
                type="button"
                onClick={handleMarkAllIrrelevant}
                disabled={bulkMarking}
                className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {bulkMarking ? "Excluding…" : "Yes, exclude all shown"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingBulkIrrelevant(false)}
                disabled={bulkMarking}
                className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleMarkAllIrrelevant}
              className="mt-2 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
            >
              Exclude all {total} shown
            </button>
          )}

          {hasActiveFilter && (
            <div className="mt-3 border-t border-amber-200 pt-2">
              {confirmingKeepOnly ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span>
                    Exclude the other {keepOnlyCount ?? "…"} review(s) not shown by this filter —
                    keeping only these {total}?
                  </span>
                  <button
                    type="button"
                    onClick={handleKeepOnlyFiltered}
                    disabled={keepOnlyMarking}
                    className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
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
                    className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleKeepOnlyFiltered}
                  className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                >
                  Exclude everything NOT shown (keep these {total})
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <ul className="mt-6 flex flex-col gap-4">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700">
                {r.gameName}
              </span>
              <span>·</span>
              <span className={r.votedUp ? "text-green-700" : "text-red-700"}>
                {r.votedUp ? "Recommended" : "Not recommended"}
              </span>
              <span>·</span>
              <span>{(r.playtimeForever / 60).toFixed(1)}h playtime</span>
              <span>·</span>
              <span>{new Date(r.timestampCreated).toISOString().slice(0, 10)}</span>
              <span>·</span>
              <span title="Steam quality/helpfulness score">
                {r.votesUp} helpful ({(r.weightedVoteScore * 100).toFixed(0)}% score)
              </span>
              <span>·</span>
              {r.taggingCount > 0 ? (
                <span className="text-green-700">✓ Coded ({r.taggingCount})</span>
              ) : (
                <span>Not yet coded</span>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap">{r.text}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link
                href={`/projects/${projectId}/reviews/${r.id}?${tagQuery.toString()}`}
                className="text-xs underline"
              >
                Tag this review →
              </Link>

              {activeCodebookId &&
                (confirmingIrrelevantId === r.id ? (
                  <span className="flex items-center gap-2 text-xs">
                    <span className="text-amber-700">Exclude from this codebook?</span>
                    <button
                      type="button"
                      onClick={() => handleMarkIrrelevant(r.id)}
                      className="rounded-lg bg-amber-600 px-2 py-0.5 font-medium text-white hover:bg-amber-700"
                    >
                      Yes, exclude
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingIrrelevantId(null)}
                      className="rounded-lg border border-gray-300 bg-white px-2 py-0.5 text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleMarkIrrelevant(r.id)}
                    className="rounded-lg border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
                  >
                    Exclude
                  </button>
                ))}

              {confirmingDeleteId === r.id ? (
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-red-700">Permanently delete?</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteReview(r.id)}
                    disabled={deletingId === r.id}
                    className="rounded-lg bg-red-600 px-2 py-0.5 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deletingId === r.id ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDeleteId(null)}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-0.5 text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleDeleteReview(r.id)}
                  className="rounded-lg border border-red-300 bg-white px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-sm text-gray-500">No reviews match these filters.</li>
        )}
      </ul>

      {longestGamePages > 1 && (
        <nav className="mt-6 flex items-center gap-3 text-sm">
          <Link
            href={pageHref(Math.max(page - 1, 1))}
            aria-disabled={page <= 1}
            className={page <= 1 ? "pointer-events-none text-gray-300" : "underline"}
          >
            ← Prev
          </Link>
          <span>
            Page {page} of {longestGamePages}
          </span>
          <Link
            href={pageHref(Math.min(page + 1, longestGamePages))}
            aria-disabled={page >= longestGamePages}
            className={page >= longestGamePages ? "pointer-events-none text-gray-300" : "underline"}
          >
            Next →
          </Link>
        </nav>
      )}
      {longestGamePages > 1 && (
        <p className="mt-2 text-xs text-gray-500">
          Pages are capped by the game with the most matching reviews — a game with fewer
          reviews may contribute nothing on later pages.
        </p>
      )}
    </main>
  );
}

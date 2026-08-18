"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PLAYTIME_TIERS } from "@/lib/playtimeTiers";
import { SORT_OPTIONS, type ReviewSearchParams } from "@/lib/localDb/queries/reviewFilters";
import {
  countReviews,
  countCodedReviews,
  listReviews,
  groupReviewsByLanguage,
  type ReviewWithTaggingCount,
} from "@/lib/localDb/queries/reviews";
import { listSavedSamplesForGame, type SavedSample } from "@/lib/localDb/queries/savedSamples";
import { getGameById, type Game } from "@/lib/localDb/queries/games";
import { listCodebooksForGame, type Codebook } from "@/lib/localDb/queries/codebooks";
import { resolveActiveCodebookId } from "@/lib/activeCodebook";
import { SavedSamples } from "./SavedSamples";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { ExpandableText } from "@/components/ExpandableText";
import { CodebookToolbar } from "@/components/CodebookToolbar";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const g = await getGameById(gameId);
      if (cancelled) return;
      setGame(g);
      if (!g) {
        setLoading(false);
        return;
      }
      const cbs = await listCodebooksForGame(gameId);
      if (cancelled) return;
      const active = resolveActiveCodebookId(gameId, cbs, searchParams.get("codebookId"));
      setCodebooks(cbs);
      setActiveCodebookId(active);

      const [t, c, r, s, l] = await Promise.all([
        countReviews(gameId, sp),
        countCodedReviews(gameId, sp, active),
        listReviews(gameId, sp, page, active),
        listSavedSamplesForGame(gameId),
        groupReviewsByLanguage(gameId),
      ]);
      if (cancelled) return;
      setTotal(t);
      setCodedCount(c);
      setReviews(r);
      setSavedSamples(s);
      setLanguages(l);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, searchParams.toString()]);

  const PAGE_SIZE = 25;
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

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
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }
  if (game === null) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-sm text-gray-500">Game not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Breadcrumbs
        items={[
          { label: "Games", href: "/games" },
          { label: game.name },
        ]}
      />
      <div className="mt-2">
        <BackButton href="/games" label="Games" />
      </div>

      <div className="mt-2 flex gap-4 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
        {game.headerImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={game.headerImage}
            alt={game.name}
            className="h-24 w-auto shrink-0 rounded-lg object-cover"
          />
        )}
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
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
        gameId={gameId}
        gameName={game.name}
        codebooks={codebooks}
        activeCodebookId={activeCodebookId}
      />

      <p className="mt-2 text-sm text-gray-500">
        {total} review{total === 1 ? "" : "s"} matching current filters ·{" "}
        {codedCount} of {total} coded
      </p>

      <form method="get" className="mt-6 grid grid-cols-2 gap-4 rounded-xl border border-gray-200 bg-white shadow-sm p-4 text-sm sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Recommended</span>
          <select name="voted" defaultValue={sp.voted ?? ""} className="rounded border border-gray-300 px-2 py-1">
            <option value="">All</option>
            <option value="up">Recommended</option>
            <option value="down">Not recommended</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">Purchase</span>
          <select name="purchase" defaultValue={sp.purchase ?? ""} className="rounded border border-gray-300 px-2 py-1">
            <option value="">All</option>
            <option value="verified">Verified purchase only</option>
            <option value="free">Received for free only</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">Early access</span>
          <select name="earlyAccess" defaultValue={sp.earlyAccess ?? ""} className="rounded border border-gray-300 px-2 py-1">
            <option value="">All</option>
            <option value="true">Written during EA only</option>
          </select>
        </label>

        <div className="col-span-2 sm:col-span-4" />

        <label className="flex flex-col gap-1">
          <span className="font-medium">Playtime</span>
          <select name="playtime" defaultValue={sp.playtime ?? ""} className="rounded border border-gray-300 px-2 py-1">
            <option value="">All</option>
            {PLAYTIME_TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">Language</span>
          <select name="language" defaultValue={sp.language ?? ""} className="rounded border border-gray-300 px-2 py-1">
            <option value="">All</option>
            {languages.map((l) => (
              <option key={l.language} value={l.language}>
                {l.language} ({l.count})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">From</span>
          <input
            type="date"
            name="from"
            defaultValue={sp.from ?? ""}
            className="w-full min-w-0 rounded border border-gray-300 px-2 py-1"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">To</span>
          <input
            type="date"
            name="to"
            defaultValue={sp.to ?? ""}
            className="w-full min-w-0 rounded border border-gray-300 px-2 py-1"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">Sort by</span>
          <select name="sort" defaultValue={sp.sort ?? "newest"} className="rounded border border-gray-300 px-2 py-1">
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">Min. helpful votes</span>
          <input
            type="number"
            min={0}
            name="minVotes"
            defaultValue={sp.minVotes ?? ""}
            className="w-full min-w-0 rounded border border-gray-300 px-2 py-1"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">Min. length (chars)</span>
          <input
            type="number"
            min={0}
            name="minLength"
            defaultValue={sp.minLength ?? ""}
            className="w-full min-w-0 rounded border border-gray-300 px-2 py-1"
          />
        </label>

        <div className="col-span-2 flex items-end gap-2 sm:col-span-4">
          <button type="submit" className="rounded-lg bg-black px-4 py-1.5 text-white">
            Apply filters
          </button>
          <a href={`/games/${gameId}/reviews`} className="rounded border border-gray-300 px-4 py-1.5">
            Clear
          </a>
        </div>
      </form>

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
            <Link
              href={`/games/${gameId}/reviews/${r.id}?${tagQuery.toString()}`}
              className="mt-2 inline-block text-xs underline"
            >
              Tag this review →
            </Link>
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

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PLAYTIME_TIERS } from "@/lib/playtimeTiers";
import {
  buildReviewWhere,
  buildReviewOrderBy,
  SORT_OPTIONS,
  type ReviewSearchParams,
} from "@/lib/reviewFilters";
import { SavedSamples } from "./SavedSamples";
import { Breadcrumbs } from "@/components/Breadcrumbs";

const PAGE_SIZE = 25;

type SearchParams = ReviewSearchParams;

export default async function ReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { gameId } = await params;
  const sp = await searchParams;

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) notFound();

  const page = Math.max(Number(sp.page) || 1, 1);
  const where = buildReviewWhere(gameId, sp);
  const orderBy = buildReviewOrderBy(sp);

  const [total, codedCount, reviews, savedSamples, languages] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.count({ where: { ...where, taggings: { some: {} } } }),
    prisma.review.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { taggings: true } } },
    }),
    prisma.savedSample.findMany({ where: { gameId }, orderBy: { createdAt: "desc" } }),
    prisma.review.groupBy({
      by: ["language"],
      where: { gameId },
      _count: true,
      orderBy: { _count: { language: "desc" } },
    }),
  ]);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  // Preserve current filters across pagination links.
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

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Breadcrumbs
        items={[
          { label: "Games", href: "/games" },
          { label: game.name },
        ]}
      />
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{game.name}</h1>
        <Link href={`/games/${gameId}/codebooks`} className="text-sm underline">
          Codebooks →
        </Link>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        {total} review{total === 1 ? "" : "s"} matching current filters ·{" "}
        {codedCount} of {total} coded
      </p>

      <form method="get" className="mt-6 grid grid-cols-2 gap-4 rounded-xl border border-gray-200 bg-white shadow-sm p-4 text-sm sm:grid-cols-4">
        {/* Review type: recommended / purchase / early access */}
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

        {/* Row break so the next group starts on a fresh line */}
        <div className="col-span-2 sm:col-span-4" />

        {/* Who & when: playtime / language / date range */}
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
                {l.language} ({l._count})
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

        {/* Quality & sort: how to order results, and substance thresholds */}
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
              <span>{r.timestampCreated.toISOString().slice(0, 10)}</span>
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
              {r._count.taggings > 0 ? (
                <span className="text-green-700">✓ Coded ({r._count.taggings})</span>
              ) : (
                <span>Not yet coded</span>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap">{r.text}</p>
            <Link
              href={`/games/${gameId}/reviews/${r.id}?${filterParams.toString()}`}
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

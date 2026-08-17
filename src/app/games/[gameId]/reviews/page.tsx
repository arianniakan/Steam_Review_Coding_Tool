import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PLAYTIME_TIERS, getPlaytimeTier } from "@/lib/playtimeTiers";
import type { Prisma } from "@/generated/prisma/client";
import { SavedSamples } from "./SavedSamples";

const PAGE_SIZE = 25;

interface SearchParams {
  voted?: string; // "up" | "down" | undefined (= all)
  earlyAccess?: string; // "true" | undefined (= all)
  playtime?: string; // one of PLAYTIME_TIERS values
  from?: string; // ISO date
  to?: string; // ISO date
  page?: string;
}

function buildWhere(gameId: string, sp: SearchParams): Prisma.ReviewWhereInput {
  const where: Prisma.ReviewWhereInput = { gameId };

  if (sp.voted === "up") where.votedUp = true;
  if (sp.voted === "down") where.votedUp = false;

  if (sp.earlyAccess === "true") where.writtenDuringEarlyAccess = true;

  const tier = sp.playtime ? getPlaytimeTier(sp.playtime) : undefined;
  if (tier) {
    where.playtimeForever = {
      gte: tier.minMinutes,
      ...(tier.maxMinutes !== null ? { lt: tier.maxMinutes } : {}),
    };
  }

  if (sp.from || sp.to) {
    where.timestampCreated = {
      ...(sp.from ? { gte: new Date(sp.from) } : {}),
      ...(sp.to ? { lte: new Date(sp.to) } : {}),
    };
  }

  return where;
}

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
  const where = buildWhere(gameId, sp);

  const [total, reviews, savedSamples] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: { timestampCreated: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.savedSample.findMany({ where: { gameId }, orderBy: { createdAt: "desc" } }),
  ]);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  // Preserve current filters across pagination links.
  const filterParams = new URLSearchParams();
  if (sp.voted) filterParams.set("voted", sp.voted);
  if (sp.earlyAccess) filterParams.set("earlyAccess", sp.earlyAccess);
  if (sp.playtime) filterParams.set("playtime", sp.playtime);
  if (sp.from) filterParams.set("from", sp.from);
  if (sp.to) filterParams.set("to", sp.to);

  function pageHref(p: number) {
    const params = new URLSearchParams(filterParams);
    params.set("page", String(p));
    return `?${params.toString()}`;
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{game.name}</h1>
        <Link href={`/games/${gameId}/codebooks`} className="text-sm underline">
          Codebooks →
        </Link>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        {total} review{total === 1 ? "" : "s"} matching current filters
      </p>

      <form method="get" className="mt-6 grid grid-cols-2 gap-4 rounded border border-gray-200 p-4 text-sm sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Recommended</span>
          <select name="voted" defaultValue={sp.voted ?? ""} className="rounded border border-gray-300 px-2 py-1">
            <option value="">All</option>
            <option value="up">Recommended</option>
            <option value="down">Not recommended</option>
          </select>
        </label>

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
          <span className="font-medium">Early access</span>
          <select name="earlyAccess" defaultValue={sp.earlyAccess ?? ""} className="rounded border border-gray-300 px-2 py-1">
            <option value="">All</option>
            <option value="true">Written during EA only</option>
          </select>
        </label>

        <div className="col-span-2 flex gap-2 sm:col-span-1">
          <label className="flex flex-1 flex-col gap-1">
            <span className="font-medium">From</span>
            <input type="date" name="from" defaultValue={sp.from ?? ""} className="rounded border border-gray-300 px-2 py-1" />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="font-medium">To</span>
            <input type="date" name="to" defaultValue={sp.to ?? ""} className="rounded border border-gray-300 px-2 py-1" />
          </label>
        </div>

        <div className="col-span-2 flex items-end gap-2 sm:col-span-4">
          <button type="submit" className="rounded bg-black px-4 py-1.5 text-white">
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
          <li key={r.id} className="rounded border border-gray-200 p-4 text-sm">
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
            </div>
            <p className="mt-2 whitespace-pre-wrap">{r.text}</p>
            <Link
              href={`/games/${gameId}/reviews/${r.id}`}
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

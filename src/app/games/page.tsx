import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";

export default async function GamesPage() {
  const games = await prisma.game.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { reviews: true, codebooks: true } } },
  });

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Breadcrumbs items={[{ label: "Games" }]} />
      <div className="mt-2">
        <BackButton href="/" label="Home" />
      </div>
      <h1 className="mt-2 text-2xl font-semibold">Games</h1>
      <p className="mt-1 text-sm text-gray-500">
        Games with reviews ingested so far.
      </p>

      <ul className="mt-6 flex flex-col gap-2">
        {games.map((g) => (
          <li key={g.id}>
            <Link
              href={`/games/${g.id}/reviews`}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-3 text-sm hover:border-gray-400"
            >
              {g.headerImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={g.headerImage}
                  alt={g.name}
                  className="h-10 w-20 shrink-0 rounded object-cover"
                />
              )}
              <span className="flex-1 font-medium">{g.name}</span>
              <span className="shrink-0 text-gray-500">
                {g._count.reviews} review{g._count.reviews === 1 ? "" : "s"} ·{" "}
                {g._count.codebooks} codebook{g._count.codebooks === 1 ? "" : "s"}
              </span>
            </Link>
          </li>
        ))}
        {games.length === 0 && (
          <li className="text-sm text-gray-500">
            No games ingested yet.{" "}
            <Link href="/ingest" className="underline">
              Ingest one →
            </Link>
          </li>
        )}
      </ul>
    </main>
  );
}

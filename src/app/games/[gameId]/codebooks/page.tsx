import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CreateCodebookForm } from "./CreateCodebookForm";
import { AutoCodebookGenerator } from "./AutoCodebookGenerator";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default async function CodebooksPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) notFound();

  const [codebooks, languages, savedSamples] = await Promise.all([
    prisma.codebook.findMany({
      where: { gameId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { codes: true } } },
    }),
    prisma.review.groupBy({
      by: ["language"],
      where: { gameId },
      _count: true,
      orderBy: { _count: { language: "desc" } },
    }),
    prisma.savedSample.findMany({ where: { gameId }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <main className="mx-auto max-w-xl p-8">
      <Breadcrumbs
        items={[
          { label: "Games", href: "/games" },
          { label: game.name, href: `/games/${gameId}/reviews` },
        ]}
      />
      <h1 className="mt-2 text-2xl font-semibold">{game.name} — Codebooks</h1>
      <p className="mt-1 text-sm text-gray-500">
        A codebook is a named set of codes for tagging review segments. Version
        by creating a new codebook rather than editing one mid-analysis.
      </p>

      <ul className="mt-6 flex flex-col gap-2">
        {codebooks.map((cb) => (
          <li key={cb.id}>
            <Link
              href={`/games/${gameId}/codebooks/${cb.id}`}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-2 text-sm hover:border-gray-400"
            >
              <span>{cb.name}</span>
              <span className="text-gray-500">
                {cb._count.codes} code{cb._count.codes === 1 ? "" : "s"}
              </span>
            </Link>
          </li>
        ))}
        {codebooks.length === 0 && (
          <li className="text-sm text-gray-500">No codebooks yet.</li>
        )}
      </ul>

      <CreateCodebookForm gameId={gameId} />
      <AutoCodebookGenerator gameId={gameId} languages={languages} savedSamples={savedSamples} />
    </main>
  );
}

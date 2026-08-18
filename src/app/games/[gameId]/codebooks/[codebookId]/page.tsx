import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CodeManager } from "./CodeManager";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default async function CodebookDetailPage({
  params,
}: {
  params: Promise<{ gameId: string; codebookId: string }>;
}) {
  const { gameId, codebookId } = await params;

  const codebook = await prisma.codebook.findUnique({
    where: { id: codebookId },
    include: { game: true, codes: { orderBy: { createdAt: "asc" } } },
  });

  if (!codebook || codebook.gameId !== gameId) notFound();

  return (
    <main className="mx-auto max-w-xl p-8">
      <Breadcrumbs
        items={[
          { label: "Games", href: "/games" },
          { label: codebook.game.name, href: `/games/${gameId}/reviews` },
          { label: "Codebooks", href: `/games/${gameId}/codebooks` },
          { label: codebook.name },
        ]}
      />
      <div className="mt-2 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{codebook.game.name}</p>
          <h1 className="text-2xl font-semibold">{codebook.name}</h1>
        </div>
        <div className="flex gap-4">
          <Link href={`/games/${gameId}/codebooks/${codebookId}/analytics`} className="text-sm underline">
            Analytics →
          </Link>
          <a href={`/api/codebooks/${codebookId}/export.csv`} className="text-sm underline">
            Export CSV →
          </a>
        </div>
      </div>

      <div className="mt-6">
        <CodeManager codebookId={codebookId} codes={codebook.codes} />
      </div>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TagEditor } from "./TagEditor";
import { CodebookSwitcher } from "./CodebookSwitcher";

export default async function ReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string; reviewId: string }>;
  searchParams: Promise<{ codebookId?: string }>;
}) {
  const { gameId, reviewId } = await params;
  const sp = await searchParams;

  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review || review.gameId !== gameId) notFound();

  const codebooks = await prisma.codebook.findMany({
    where: { gameId },
    orderBy: { createdAt: "desc" },
  });

  if (codebooks.length === 0) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p className="text-sm text-gray-500">
          No codebooks exist for this game yet.{" "}
          <Link href={`/games/${gameId}/codebooks`} className="underline">
            Create one first →
          </Link>
        </p>
      </main>
    );
  }

  const activeCodebook =
    codebooks.find((cb) => cb.id === sp.codebookId) ?? codebooks[0];

  const [codes, taggings] = await Promise.all([
    prisma.code.findMany({
      where: { codebookId: activeCodebook.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.tagging.findMany({
      where: { reviewId },
      include: { code: true, coder: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <Link href={`/games/${gameId}/reviews`} className="text-sm underline">
          ← Back to reviews
        </Link>
        {codebooks.length > 1 && (
          <CodebookSwitcher codebooks={codebooks} activeCodebookId={activeCodebook.id} />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span className={review.votedUp ? "text-green-700" : "text-red-700"}>
          {review.votedUp ? "Recommended" : "Not recommended"}
        </span>
        <span>·</span>
        <span>{(review.playtimeForever / 60).toFixed(1)}h playtime</span>
        <span>·</span>
        <span>{review.timestampCreated.toISOString().slice(0, 10)}</span>
      </div>

      <TagEditor
        reviewId={reviewId}
        reviewText={review.text}
        codebookId={activeCodebook.id}
        codes={codes}
        initialTaggings={taggings.map((t) => ({
          id: t.id,
          spanStart: t.spanStart,
          spanEnd: t.spanEnd,
          memo: t.memo,
          aiConfidence: t.aiConfidence,
          aiRationale: t.aiRationale,
          code: { id: t.code.id, label: t.code.label, color: t.code.color },
          coder: { name: t.coder.name, kind: t.coder.kind },
        }))}
      />
    </main>
  );
}

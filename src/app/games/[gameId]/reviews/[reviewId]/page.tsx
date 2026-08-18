import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TagEditor } from "./TagEditor";
import { CodebookSwitcher } from "./CodebookSwitcher";
import { ReviewNav } from "./ReviewNav";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { buildReviewWhere, type ReviewSearchParams } from "@/lib/reviewFilters";

type SearchParams = ReviewSearchParams & { codebookId?: string };

export default async function ReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string; reviewId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { gameId, reviewId } = await params;
  const sp = await searchParams;

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) notFound();

  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review || review.gameId !== gameId) notFound();

  const codebooks = await prisma.codebook.findMany({
    where: { gameId },
    orderBy: { createdAt: "desc" },
  });

  const breadcrumbItems = [
    { label: "Games", href: "/games" },
    { label: game.name, href: `/games/${gameId}/reviews` },
    { label: "Reviews", href: `/games/${gameId}/reviews` },
    { label: "Review" },
  ];

  if (codebooks.length === 0) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <Breadcrumbs items={breadcrumbItems} />
        <p className="mt-4 text-sm text-gray-500">
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

  const [codes, taggings, orderedReviews] = await Promise.all([
    prisma.code.findMany({
      where: { codebookId: activeCodebook.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.tagging.findMany({
      where: { reviewId },
      include: { code: true, coder: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.review.findMany({
      where: buildReviewWhere(gameId, sp),
      orderBy: { timestampCreated: "desc" },
      select: { id: true },
    }),
  ]);

  const currentIndex = orderedReviews.findIndex((r) => r.id === reviewId);
  const position = currentIndex === -1 ? 1 : currentIndex + 1;
  const prevId = currentIndex > 0 ? orderedReviews[currentIndex - 1]?.id : undefined;
  const nextId =
    currentIndex !== -1 && currentIndex < orderedReviews.length - 1
      ? orderedReviews[currentIndex + 1]?.id
      : undefined;

  const navQuery = new URLSearchParams();
  if (sp.voted) navQuery.set("voted", sp.voted);
  if (sp.earlyAccess) navQuery.set("earlyAccess", sp.earlyAccess);
  if (sp.playtime) navQuery.set("playtime", sp.playtime);
  if (sp.from) navQuery.set("from", sp.from);
  if (sp.to) navQuery.set("to", sp.to);
  if (sp.codebookId) navQuery.set("codebookId", sp.codebookId);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Breadcrumbs items={breadcrumbItems} />

      <div className="mt-4">
        <ReviewNav
          gameId={gameId}
          query={navQuery.toString()}
          position={position}
          total={orderedReviews.length}
          prevId={prevId}
          nextId={nextId}
        />
      </div>

      <div className="mt-4 flex items-center justify-between">
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

      <div className="mt-6">
        <ReviewNav
          gameId={gameId}
          query={navQuery.toString()}
          position={position}
          total={orderedReviews.length}
          prevId={prevId}
          nextId={nextId}
        />
      </div>
    </main>
  );
}

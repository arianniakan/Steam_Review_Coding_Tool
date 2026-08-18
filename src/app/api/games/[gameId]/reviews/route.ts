import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildReviewWhere, type ReviewSearchParams } from "@/lib/reviewFilters";

const PAGE_SIZE = 20;

// JSON search endpoint for review-picking UIs (e.g. hand-picking a sample
// for AI codebook generation) — the main review browser is a server
// component and doesn't need this, but a client component that lets the
// researcher search/select individual reviews does.
export async function GET(
  request: Request,
  context: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await context.params;
  const url = new URL(request.url);
  const sp: ReviewSearchParams = Object.fromEntries(url.searchParams.entries());
  const page = Math.max(Number(sp.page) || 1, 1);

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  const where = buildReviewWhere(gameId, sp);
  const [total, reviews] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: { weightedVoteScore: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        text: true,
        votedUp: true,
        votesUp: true,
        weightedVoteScore: true,
        steamPurchase: true,
      },
    }),
  ]);

  return NextResponse.json({ reviews, total, page, pageSize: PAGE_SIZE });
}

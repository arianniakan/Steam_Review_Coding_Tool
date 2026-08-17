import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultResearcher, getAiCoder } from "@/lib/coders";

export async function POST(
  request: Request,
  context: { params: Promise<{ reviewId: string }> },
) {
  const { reviewId } = await context.params;
  const body = await request.json().catch(() => ({}) as Record<string, unknown>);

  const codeId = typeof body.codeId === "string" ? body.codeId : "";
  const memo = typeof body.memo === "string" && body.memo.trim() ? body.memo.trim() : null;
  const spanStart = typeof body.spanStart === "number" ? body.spanStart : null;
  const spanEnd = typeof body.spanEnd === "number" ? body.spanEnd : null;
  // "ai" is only reachable by accepting a suggestion returned from our own
  // suggest-codes endpoint (see AI suggestions UI in TagEditor) — the model
  // never writes directly to the database, only via this same human-gated path.
  const source = body.source === "ai" ? "ai" : "human";
  const aiConfidence = typeof body.confidence === "number" ? body.confidence : null;
  const aiRationale = typeof body.rationale === "string" ? body.rationale : null;

  if (!codeId) {
    return NextResponse.json({ error: "codeId is required" }, { status: 400 });
  }
  if ((spanStart === null) !== (spanEnd === null)) {
    return NextResponse.json(
      { error: "spanStart and spanEnd must both be set or both be null" },
      { status: 400 },
    );
  }
  if (spanStart !== null && spanEnd !== null && spanStart >= spanEnd) {
    return NextResponse.json({ error: "spanStart must be before spanEnd" }, { status: 400 });
  }

  const [review, code] = await Promise.all([
    prisma.review.findUnique({ where: { id: reviewId } }),
    prisma.code.findUnique({ where: { id: codeId } }),
  ]);
  if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });
  if (!code) return NextResponse.json({ error: "Code not found" }, { status: 404 });

  // Identity is not client-supplied — there's no auth layer yet, so every
  // human tagging is attributed to the single seeded researcher, and every
  // accepted AI suggestion to the reserved AI coder.
  const coder = source === "ai" ? await getAiCoder() : await getDefaultResearcher();

  const tagging = await prisma.tagging.create({
    data: {
      reviewId,
      codeId,
      coderId: coder.id,
      spanStart,
      spanEnd,
      memo,
      aiConfidence: source === "ai" ? aiConfidence : null,
      aiRationale: source === "ai" ? aiRationale : null,
    },
    include: { code: true, coder: true },
  });

  return NextResponse.json(tagging, { status: 201 });
}

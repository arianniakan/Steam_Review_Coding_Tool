import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { openai, OPENAI_MODEL } from "@/lib/openai";
import { buildReviewWhere, type ReviewSearchParams } from "@/lib/reviewFilters";

interface RawProposal {
  label: string;
  description: string;
}

const MIN_SAMPLE_SIZE = 10;
const MAX_SAMPLE_SIZE = 100;
const DEFAULT_SAMPLE_SIZE = 40;
const MAX_TEXT_CHARS_PER_REVIEW = 600; // bound prompt size on long reviews
const MIN_REVIEW_TEXT_LENGTH = 20; // skip one-word noise like "gud" / "s"

export async function POST(
  request: Request,
  context: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await context.params;
  const body = await request.json().catch(() => ({}) as Record<string, unknown>);

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  const requestedSampleSize = Number(body.sampleSize);
  const sampleSize = Math.min(
    Math.max(
      Number.isFinite(requestedSampleSize) ? requestedSampleSize : DEFAULT_SAMPLE_SIZE,
      MIN_SAMPLE_SIZE,
    ),
    MAX_SAMPLE_SIZE,
  );
  const focus = typeof body.focus === "string" ? body.focus.trim() : "";
  const requestedTargetCount = Number(body.targetCount);
  const targetCount = Math.min(
    Math.max(Number.isFinite(requestedTargetCount) ? requestedTargetCount : 8, 3),
    20,
  );

  // Researcher-set criteria — same shape/semantics as the reviews list
  // filters, so "which reviews does the AI read" is scoped the same way
  // browsing is. A minimum text length always applies (floor: whichever is
  // higher of the researcher's setting or the built-in noise floor).
  const filters = (body.filters ?? {}) as ReviewSearchParams;
  const requestedMinLength = Number(filters.minLength);
  const effectiveMinLength = Math.max(
    Number.isFinite(requestedMinLength) ? requestedMinLength : 0,
    MIN_REVIEW_TEXT_LENGTH,
  );
  const scopedFilters: ReviewSearchParams = {
    ...filters,
    minLength: String(effectiveMinLength),
  };

  let sample: { text: string }[];
  if (filters.voted === "up" || filters.voted === "down") {
    // Researcher already pinned one side — just sample that, no balancing.
    sample = await prisma.review.findMany({
      where: buildReviewWhere(gameId, scopedFilters),
      orderBy: { weightedVoteScore: "desc" },
      take: sampleSize,
      select: { text: true },
    });
  } else {
    // Split evenly between recommended/not-recommended so the proposed
    // codebook isn't skewed one-sided, favoring the most helpful (highest
    // weighted-vote-score) reviews on each side as the most substantive text.
    const half = Math.ceil(sampleSize / 2);
    const [positive, negative] = await Promise.all([
      prisma.review.findMany({
        where: buildReviewWhere(gameId, { ...scopedFilters, voted: "up" }),
        orderBy: { weightedVoteScore: "desc" },
        take: half,
        select: { text: true },
      }),
      prisma.review.findMany({
        where: buildReviewWhere(gameId, { ...scopedFilters, voted: "down" }),
        orderBy: { weightedVoteScore: "desc" },
        take: half,
        select: { text: true },
      }),
    ]);
    sample = [...positive, ...negative];
  }

  if (sample.length === 0) {
    return NextResponse.json(
      { error: "No reviews match these criteria — loosen the filters and try again" },
      { status: 400 },
    );
  }

  const reviewsBlock = sample
    .map((r, i) => `${i + 1}. ${r.text.slice(0, MAX_TEXT_CHARS_PER_REVIEW)}`)
    .join("\n\n");

  let raw: { proposals: RawProposal[] };
  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are helping a qualitative researcher build a codebook for thematically " +
            "coding Steam game reviews. Given a sample of real reviews for one game, propose " +
            `around ${targetCount} distinct, non-overlapping codes that capture recurring ` +
            "themes actually present in this sample — do not invent generic placeholder " +
            "codes. Each code needs a short snake_case label (e.g. performance_complaint) " +
            "and a one-sentence description precise enough that another coder (human or AI) " +
            "would know exactly when to apply it. If a research focus is given, prioritize " +
            "codes relevant to that focus, but only propose codes actually grounded in the " +
            "sample.",
        },
        {
          role: "user",
          content:
            (focus ? `Research focus: ${focus}\n\n` : "") +
            `Game: ${game.name}\n\nReview sample:\n${reviewsBlock}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "codebook_proposals",
          strict: true,
          schema: {
            type: "object",
            properties: {
              proposals: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    description: { type: "string" },
                  },
                  required: ["label", "description"],
                  additionalProperties: false,
                },
              },
            },
            required: ["proposals"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response from OpenAI");
    raw = JSON.parse(content);
  } catch (err) {
    console.error("suggest-codebook: OpenAI call failed", err);
    return NextResponse.json(
      { error: "AI codebook generation failed — check OPENAI_API_KEY and try again" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    proposals: raw.proposals,
    sampleSize: sample.length,
  });
}

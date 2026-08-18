import { NextResponse } from "next/server";
import { openai, OPENAI_MODEL } from "@/lib/openai";
import { checkRateLimit } from "@/lib/rateLimit";

interface RawProposal {
  label: string;
  description: string;
}

const MAX_TEXT_CHARS_PER_REVIEW = 600; // bound prompt size on long reviews
const MAX_REVIEW_TEXTS = 40; // matches the sampler's own cap, defends direct API calls too

// Stateless AI proxy — sampling (which reviews, how many, balanced by
// recommended/not, hand-picked, etc.) now happens entirely client-side
// against the local database (see sampleReviewsForCodebook in
// src/lib/localDb/queries/reviews.ts). This route just takes the resulting
// texts and asks OpenAI to propose a codebook from them.
export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, "suggest-codebook", 5, "1 h");
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded — try again later" },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => ({}) as Record<string, unknown>);

  const gameName = typeof body.gameName === "string" ? body.gameName : "this game";
  const reviewTexts = Array.isArray(body.reviewTexts)
    ? (body.reviewTexts as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const focus = typeof body.focus === "string" ? body.focus.trim() : "";
  const requestedTargetCount = Number(body.targetCount);
  const targetCount = Math.min(
    Math.max(Number.isFinite(requestedTargetCount) ? requestedTargetCount : 8, 3),
    20,
  );

  if (reviewTexts.length === 0) {
    return NextResponse.json(
      { error: "No reviews match these criteria — loosen the filters and try again" },
      { status: 400 },
    );
  }
  if (reviewTexts.length > MAX_REVIEW_TEXTS) {
    return NextResponse.json({ error: "Too many reviews in the sample" }, { status: 400 });
  }

  const reviewsBlock = reviewTexts
    .map((t, i) => `${i + 1}. ${t.slice(0, MAX_TEXT_CHARS_PER_REVIEW)}`)
    .join("\n\n");

  let raw: { proposals: RawProposal[] };
  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: 4000,
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
            `Game: ${gameName}\n\nReview sample:\n${reviewsBlock}`,
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
    sampleSize: reviewTexts.length,
  });
}

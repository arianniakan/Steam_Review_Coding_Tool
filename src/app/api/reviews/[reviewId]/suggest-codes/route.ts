import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { openai, OPENAI_MODEL } from "@/lib/openai";

interface RawSuggestion {
  codeLabel: string;
  spanText: string;
  rationale: string;
  confidence: number;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ reviewId: string }> },
) {
  const { reviewId } = await context.params;
  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const codebookId = typeof body.codebookId === "string" ? body.codebookId : "";

  if (!codebookId) {
    return NextResponse.json({ error: "codebookId is required" }, { status: 400 });
  }

  const [review, codes] = await Promise.all([
    prisma.review.findUnique({ where: { id: reviewId } }),
    prisma.code.findMany({ where: { codebookId }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });
  if (codes.length === 0) {
    return NextResponse.json({ error: "This codebook has no codes yet" }, { status: 400 });
  }

  const codebookDescription = codes
    .map((c) => `- ${c.label}: ${c.description}`)
    .join("\n");

  let raw: { suggestions: RawSuggestion[] };
  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are assisting a qualitative researcher coding Steam game reviews. " +
            "Given a codebook (a list of codes with descriptions defining when each applies) " +
            "and a single review, propose codes that apply. For each suggestion, quote the " +
            "exact verbatim substring of the review text that justifies the code (do not " +
            "paraphrase — it must be an exact substring), give a one-sentence rationale tied " +
            "to the code's description, and a confidence between 0 and 1. Only use codes from " +
            "the given list. Propose zero suggestions if nothing in the review matches any code " +
            "— do not force a fit.",
        },
        {
          role: "user",
          content: `Codebook:\n${codebookDescription}\n\nReview:\n${review.text}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "code_suggestions",
          strict: true,
          schema: {
            type: "object",
            properties: {
              suggestions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    codeLabel: { type: "string", enum: codes.map((c) => c.label) },
                    spanText: {
                      type: "string",
                      description: "Exact verbatim substring of the review text",
                    },
                    rationale: { type: "string" },
                    confidence: { type: "number" },
                  },
                  required: ["codeLabel", "spanText", "rationale", "confidence"],
                  additionalProperties: false,
                },
              },
            },
            required: ["suggestions"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response from OpenAI");
    raw = JSON.parse(content);
  } catch (err) {
    console.error("suggest-codes: OpenAI call failed", err);
    return NextResponse.json(
      { error: "AI suggestion request failed — check OPENAI_API_KEY and try again" },
      { status: 502 },
    );
  }

  const codeByLabel = new Map(codes.map((c) => [c.label, c]));

  const suggestions = raw.suggestions
    .map((s) => {
      const code = codeByLabel.get(s.codeLabel);
      if (!code) return null; // shouldn't happen given the enum constraint, but be defensive

      const idx = review.text.indexOf(s.spanText);
      const spanStart = idx >= 0 ? idx : null;
      const spanEnd = idx >= 0 ? idx + s.spanText.length : null;

      return {
        codeId: code.id,
        codeLabel: code.label,
        color: code.color,
        spanText: s.spanText,
        spanStart,
        spanEnd,
        rationale: s.rationale,
        confidence: s.confidence,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return NextResponse.json({ suggestions });
}

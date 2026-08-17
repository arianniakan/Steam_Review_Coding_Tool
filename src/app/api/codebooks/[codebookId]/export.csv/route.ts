import { prisma } from "@/lib/prisma";

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Quote whenever the field could be misread otherwise — comma, quote, or newline.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toRow(values: (string | number | boolean | null | undefined)[]): string {
  return values.map(csvEscape).join(",") + "\r\n";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ codebookId: string }> },
) {
  const { codebookId } = await context.params;

  const codebook = await prisma.codebook.findUnique({
    where: { id: codebookId },
    include: { game: true },
  });
  if (!codebook) {
    return new Response("Codebook not found", { status: 404 });
  }

  const taggings = await prisma.tagging.findMany({
    where: { code: { codebookId } },
    include: { code: true, coder: true, review: true },
    orderBy: { createdAt: "asc" },
  });

  const header = toRow([
    "review_id",
    "steam_review_id",
    "voted_up",
    "playtime_forever_minutes",
    "review_timestamp_created",
    "code_label",
    "coder_name",
    "coder_kind",
    "span_text",
    "memo",
    "ai_confidence",
    "ai_rationale",
    "tagging_created_at",
    "review_text",
  ]);

  const rows = taggings.map((t) => {
    const spanText =
      t.spanStart !== null && t.spanEnd !== null
        ? t.review.text.slice(t.spanStart, t.spanEnd)
        : "";
    return toRow([
      t.review.id,
      t.review.steamReviewId,
      t.review.votedUp,
      t.review.playtimeForever,
      t.review.timestampCreated.toISOString(),
      t.code.label,
      t.coder.name,
      t.coder.kind,
      spanText,
      t.memo,
      t.aiConfidence,
      t.aiRationale,
      t.createdAt.toISOString(),
      t.review.text,
    ]);
  });

  const csv = header + rows.join("");
  const filename = `${codebook.game.name.replace(/[^a-z0-9]+/gi, "_")}_${codebook.name.replace(/[^a-z0-9]+/gi, "_")}_taggings.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

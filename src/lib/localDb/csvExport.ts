import { listTaggingsForCodebookExport } from "./queries/taggings";

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

export async function exportCodebookCsv(
  codebookId: string,
  gameName: string,
  codebookName: string,
): Promise<void> {
  const taggings = await listTaggingsForCodebookExport(codebookId);

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
        ? t.reviewText.slice(t.spanStart, t.spanEnd)
        : "";
    return toRow([
      t.reviewId,
      t.reviewSteamReviewId,
      t.reviewVotedUp,
      t.reviewPlaytimeForever,
      new Date(t.reviewTimestampCreated).toISOString(),
      t.codeLabel,
      t.coderName,
      t.coderKind,
      spanText,
      t.memo,
      t.aiConfidence,
      t.aiRationale,
      new Date(t.createdAt).toISOString(),
      t.reviewText,
    ]);
  });

  const csv = header + rows.join("");
  const filename = `${gameName.replace(/[^a-z0-9]+/gi, "_")}_${codebookName.replace(/[^a-z0-9]+/gi, "_")}_taggings.csv`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

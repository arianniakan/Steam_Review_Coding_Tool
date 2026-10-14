import { getDb, newId } from "../client";

export interface NewRejectedSuggestionInput {
  reviewId: string;
  codebookId: string;
  codeId: string;
  spanStart: number | null;
  spanEnd: number | null;
  spanText: string;
  aiConfidence: number;
  aiRationale: string;
}

export async function createRejectedSuggestion(data: NewRejectedSuggestionInput): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO "RejectedSuggestion"
       ("id", "reviewId", "codebookId", "codeId", "spanStart", "spanEnd", "spanText", "aiConfidence", "aiRationale")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      newId(),
      data.reviewId,
      data.codebookId,
      data.codeId,
      data.spanStart,
      data.spanEnd,
      data.spanText,
      data.aiConfidence,
      data.aiRationale,
    ],
  );
}

export interface DisagreementRow {
  id: string;
  reviewId: string;
  codeId: string;
  codeLabel: string;
  codeColor: string;
  spanStart: number | null;
  spanEnd: number | null;
  spanText: string;
  aiConfidence: number;
  aiRationale: string;
  rejectedAt: string;
  reviewText: string;
  reviewGameId: string;
}

// Newest first — the most recently rejected suggestions are most likely to
// be fresh in the researcher's mind and worth revisiting first.
export async function listDisagreementsForCodebook(codebookId: string): Promise<DisagreementRow[]> {
  const db = await getDb();
  const result = await db.query<DisagreementRow>(
    `SELECT rs."id", rs."reviewId", rs."codeId", c."label" AS "codeLabel", c."color" AS "codeColor",
       rs."spanStart", rs."spanEnd", rs."spanText", rs."aiConfidence", rs."aiRationale", rs."rejectedAt",
       r."text" AS "reviewText", r."gameId" AS "reviewGameId"
     FROM "RejectedSuggestion" rs
     JOIN "Code" c ON c."id" = rs."codeId"
     JOIN "Review" r ON r."id" = rs."reviewId"
     WHERE rs."codebookId" = $1
     ORDER BY rs."rejectedAt" DESC`,
    [codebookId],
  );
  return result.rows;
}

export async function countDisagreementsForCodebook(codebookId: string): Promise<number> {
  const db = await getDb();
  const result = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM "RejectedSuggestion" WHERE "codebookId" = $1`,
    [codebookId],
  );
  return result.rows[0]?.count ?? 0;
}

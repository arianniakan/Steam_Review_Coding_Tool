import { getDb, newId } from "../client";

export interface TaggingWithCode {
  id: string;
  reviewId: string;
  codeId: string;
  coderId: string;
  spanStart: number | null;
  spanEnd: number | null;
  memo: string | null;
  aiConfidence: number | null;
  aiRationale: string | null;
  createdAt: string;
  codeLabel: string;
  codeColor: string;
  coderName: string;
  coderKind: "HUMAN" | "AI";
}

const TAGGING_JOIN_SELECT = `
  t.*,
  c."label" AS "codeLabel",
  c."color" AS "codeColor",
  co."name" AS "coderName",
  co."kind" AS "coderKind"
`;

export async function createTagging(data: {
  reviewId: string;
  codeId: string;
  coderId: string;
  spanStart: number | null;
  spanEnd: number | null;
  memo: string | null;
  aiConfidence: number | null;
  aiRationale: string | null;
}): Promise<TaggingWithCode> {
  const db = await getDb();
  const id = newId();
  await db.query(
    `INSERT INTO "Tagging" ("id", "reviewId", "codeId", "coderId", "spanStart", "spanEnd", "memo", "aiConfidence", "aiRationale")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      data.reviewId,
      data.codeId,
      data.coderId,
      data.spanStart,
      data.spanEnd,
      data.memo,
      data.aiConfidence,
      data.aiRationale,
    ],
  );
  const result = await db.query<TaggingWithCode>(
    `SELECT ${TAGGING_JOIN_SELECT} FROM "Tagging" t
     JOIN "Code" c ON c."id" = t."codeId"
     JOIN "Coder" co ON co."id" = t."coderId"
     WHERE t."id" = $1`,
    [id],
  );
  return result.rows[0]!;
}

export async function deleteTagging(id: string): Promise<void> {
  const db = await getDb();
  await db.query(`DELETE FROM "Tagging" WHERE "id" = $1`, [id]);
}

export async function listTaggingsForReview(reviewId: string): Promise<TaggingWithCode[]> {
  const db = await getDb();
  const result = await db.query<TaggingWithCode>(
    `SELECT ${TAGGING_JOIN_SELECT} FROM "Tagging" t
     JOIN "Code" c ON c."id" = t."codeId"
     JOIN "Coder" co ON co."id" = t."coderId"
     WHERE t."reviewId" = $1
     ORDER BY t."createdAt" DESC`,
    [reviewId],
  );
  return result.rows;
}

export interface TaggingForAnalytics extends TaggingWithCode {
  reviewTimestampCreated: string;
}

export async function listTaggingsForCodebookAnalytics(
  codebookId: string,
): Promise<TaggingForAnalytics[]> {
  const db = await getDb();
  const result = await db.query<TaggingForAnalytics>(
    `SELECT ${TAGGING_JOIN_SELECT}, r."timestampCreated" AS "reviewTimestampCreated"
     FROM "Tagging" t
     JOIN "Code" c ON c."id" = t."codeId"
     JOIN "Coder" co ON co."id" = t."coderId"
     JOIN "Review" r ON r."id" = t."reviewId"
     WHERE c."codebookId" = $1`,
    [codebookId],
  );
  return result.rows;
}

export interface TaggingForExport extends TaggingWithCode {
  reviewSteamReviewId: string;
  reviewVotedUp: boolean;
  reviewPlaytimeForever: number;
  reviewTimestampCreated: string;
  reviewText: string;
}

export async function listTaggingsForCodebookExport(
  codebookId: string,
): Promise<TaggingForExport[]> {
  const db = await getDb();
  const result = await db.query<TaggingForExport>(
    `SELECT ${TAGGING_JOIN_SELECT},
       r."steamReviewId" AS "reviewSteamReviewId",
       r."votedUp" AS "reviewVotedUp",
       r."playtimeForever" AS "reviewPlaytimeForever",
       r."timestampCreated" AS "reviewTimestampCreated",
       r."text" AS "reviewText"
     FROM "Tagging" t
     JOIN "Code" c ON c."id" = t."codeId"
     JOIN "Coder" co ON co."id" = t."coderId"
     JOIN "Review" r ON r."id" = t."reviewId"
     WHERE c."codebookId" = $1
     ORDER BY t."createdAt" ASC`,
    [codebookId],
  );
  return result.rows;
}

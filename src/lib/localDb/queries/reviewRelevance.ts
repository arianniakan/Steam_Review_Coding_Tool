import { getDb, newId } from "../client";

// Relevance is per-codebook, not global to the review — a review that's
// noise for one codebook's research question may be exactly what a
// different codebook on the same game/project wants. A row's existence
// *is* the exclusion; unmarking is a plain DELETE, not a toggle flag.

export async function markReviewIrrelevant(reviewId: string, codebookId: string): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO "ReviewRelevance" ("id", "reviewId", "codebookId") VALUES ($1, $2, $3)
     ON CONFLICT ("reviewId", "codebookId") DO NOTHING`,
    [newId(), reviewId, codebookId],
  );
}

export async function markReviewsIrrelevantBulk(reviewIds: string[], codebookId: string): Promise<void> {
  if (reviewIds.length === 0) return;
  const db = await getDb();
  await db.transaction(async (tx) => {
    for (const reviewId of reviewIds) {
      await tx.query(
        `INSERT INTO "ReviewRelevance" ("id", "reviewId", "codebookId") VALUES ($1, $2, $3)
         ON CONFLICT ("reviewId", "codebookId") DO NOTHING`,
        [newId(), reviewId, codebookId],
      );
    }
  });
}

export async function unmarkReviewIrrelevant(reviewId: string, codebookId: string): Promise<void> {
  const db = await getDb();
  await db.query(`DELETE FROM "ReviewRelevance" WHERE "reviewId" = $1 AND "codebookId" = $2`, [
    reviewId,
    codebookId,
  ]);
}

// The exclusion set — same shape as getGatedReviewIds, consumed by
// startTraining, listUntrainedReviews, and the normal Reviews list.
export async function listIrrelevantReviewIds(codebookId: string): Promise<string[]> {
  const db = await getDb();
  const result = await db.query<{ reviewId: string }>(
    `SELECT "reviewId" FROM "ReviewRelevance" WHERE "codebookId" = $1`,
    [codebookId],
  );
  return result.rows.map((r) => r.reviewId);
}

export interface ExcludedReviewRow {
  id: string;
  reviewId: string;
  reviewText: string;
  reviewGameId: string;
  excludedAt: string;
}

// Newest first, matching the Disagreements queue's convention.
export async function listIrrelevantReviews(codebookId: string): Promise<ExcludedReviewRow[]> {
  const db = await getDb();
  const result = await db.query<ExcludedReviewRow>(
    `SELECT rr."id", rr."reviewId", r."text" AS "reviewText", r."gameId" AS "reviewGameId", rr."excludedAt"
     FROM "ReviewRelevance" rr
     JOIN "Review" r ON r."id" = rr."reviewId"
     WHERE rr."codebookId" = $1
     ORDER BY rr."excludedAt" DESC`,
    [codebookId],
  );
  return result.rows;
}

export async function countIrrelevantReviews(codebookId: string): Promise<number> {
  const db = await getDb();
  const result = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM "ReviewRelevance" WHERE "codebookId" = $1`,
    [codebookId],
  );
  return result.rows[0]?.count ?? 0;
}

import { getDb, newId } from "../client";
import { listReviewIdsOrdered } from "./reviews";
import type { ReviewSearchParams } from "./reviewFilters";

export type TrainingPhase = "calibrating" | "testing" | "locked" | "verified";
export type SplitBucket = "calibration" | "test" | "verification";

export interface CodebookTraining {
  id: string;
  currentCodebookId: string;
  phase: TrainingPhase;
  heldOutPercent: number;
  verificationSharePercent: number;
  distributionMode: "equal" | "proportional" | null;
  filterQuery: string;
  lockedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Splits a fixed total across games — equal mode divides evenly (remainder
// to the first games), proportional weights by each game's own pool size.
// Mirrors the same share logic already used for AI-codebook sampling
// (sampleReviewsAcrossGames in reviews.ts) but here it partitions real
// review ids into buckets rather than sampling text for a prompt.
function computeShares(total: number, poolSizes: number[], mode: "equal" | "proportional"): number[] {
  if (poolSizes.length === 0) return [];
  if (mode === "proportional") {
    const grandTotal = poolSizes.reduce((a, b) => a + b, 0);
    if (grandTotal === 0) return poolSizes.map(() => 0);
    return poolSizes.map((size) => Math.round((total * size) / grandTotal));
  }
  const base = Math.floor(total / poolSizes.length);
  const remainder = total - base * poolSizes.length;
  return poolSizes.map((_, i) => base + (i < remainder ? 1 : 0));
}

export interface StartTrainingOptions {
  codebookId: string;
  gameIds: string[];
  filters: ReviewSearchParams;
  calibrationSampleSize: number;
  heldOutPercent: number;
  verificationSharePercent: number;
  distributionMode: "equal" | "proportional";
}

// Draws the held-out split exactly once — a small, fixed-size calibration
// sample (not a percentage: the paper's "~15-20 reviews", not "x% of the
// corpus"), then a percentage-of-the-remainder held out as test+verification.
// For a multi-game (project-scoped) codebook, the calibration sample is
// shared across games per distributionMode, but held-out/verification are
// simple percentages of each game's own remaining pool — a percentage
// already scales per game without needing a distribution mode of its own.
export async function startTraining(options: StartTrainingOptions): Promise<CodebookTraining> {
  const {
    codebookId,
    gameIds,
    filters,
    calibrationSampleSize,
    heldOutPercent,
    verificationSharePercent,
    distributionMode,
  } = options;

  // Exclude reviews already tagged under this codebook — if a review was
  // coded before training started (e.g. via the normal AI-assisted flow),
  // the human has already seen AI output for it, so it can never be a
  // genuinely blind calibration/test/verification data point.
  const db0 = await getDb();
  const alreadyTagged = await db0.query<{ reviewId: string }>(
    `SELECT DISTINCT t."reviewId" FROM "Tagging" t JOIN "Code" c ON c."id" = t."codeId" WHERE c."codebookId" = $1`,
    [codebookId],
  );
  const excludeIds = new Set(alreadyTagged.rows.map((r) => r.reviewId));

  const perGameIds = (await Promise.all(gameIds.map((id) => listReviewIdsOrdered(id, filters)))).map((ids) =>
    ids.filter((id) => !excludeIds.has(id)),
  );
  const calibrationShares = computeShares(
    calibrationSampleSize,
    perGameIds.map((ids) => ids.length),
    distributionMode,
  );

  const assignments: { reviewId: string; bucket: SplitBucket }[] = [];
  perGameIds.forEach((ids, i) => {
    const shuffled = shuffle(ids);
    const calibrationIds = shuffled.slice(0, calibrationShares[i]);
    const remaining = shuffled.slice(calibrationShares[i]);
    const heldOutCount = Math.round((remaining.length * heldOutPercent) / 100);
    const verificationCount = Math.round((heldOutCount * verificationSharePercent) / 100);
    const verificationIds = remaining.slice(0, verificationCount);
    const testIds = remaining.slice(verificationCount, heldOutCount);

    for (const reviewId of calibrationIds) assignments.push({ reviewId, bucket: "calibration" });
    for (const reviewId of testIds) assignments.push({ reviewId, bucket: "test" });
    for (const reviewId of verificationIds) assignments.push({ reviewId, bucket: "verification" });
  });

  const db = await getDb();
  const trainingId = newId();
  await db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO "CodebookTraining"
         ("id", "currentCodebookId", "phase", "heldOutPercent", "verificationSharePercent", "distributionMode", "filterQuery")
       VALUES ($1, $2, 'calibrating', $3, $4, $5, $6)`,
      [
        trainingId,
        codebookId,
        heldOutPercent,
        verificationSharePercent,
        distributionMode,
        new URLSearchParams(filters as Record<string, string>).toString(),
      ],
    );
    await tx.query(`UPDATE "Codebook" SET "trainingId" = $1 WHERE "id" = $2`, [trainingId, codebookId]);
    for (const a of assignments) {
      await tx.query(
        `INSERT INTO "ReviewSplitAssignment" ("id", "trainingId", "reviewId", "bucket")
         VALUES ($1, $2, $3, $4)`,
        [newId(), trainingId, a.reviewId, a.bucket],
      );
    }
  });

  return (await getTrainingById(trainingId))!;
}

export async function getTrainingById(id: string): Promise<CodebookTraining | null> {
  const db = await getDb();
  const result = await db.query<CodebookTraining>(`SELECT * FROM "CodebookTraining" WHERE "id" = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function getTrainingForCodebook(codebookId: string): Promise<CodebookTraining | null> {
  const db = await getDb();
  const result = await db.query<CodebookTraining>(
    `SELECT t.* FROM "CodebookTraining" t JOIN "Codebook" cb ON cb."trainingId" = t."id" WHERE cb."id" = $1`,
    [codebookId],
  );
  return result.rows[0] ?? null;
}

export interface SplitReviewRow {
  id: string;
  reviewId: string;
  bucket: SplitBucket;
  reviewText: string;
  reviewGameId: string;
  aiAttemptedAt: string | null;
}

export async function listSplitAssignments(trainingId: string, bucket: SplitBucket): Promise<SplitReviewRow[]> {
  const db = await getDb();
  const result = await db.query<SplitReviewRow>(
    `SELECT rsa."id", rsa."reviewId", rsa."bucket", rsa."aiAttemptedAt", r."text" AS "reviewText", r."gameId" AS "reviewGameId"
     FROM "ReviewSplitAssignment" rsa
     JOIN "Review" r ON r."id" = rsa."reviewId"
     WHERE rsa."trainingId" = $1 AND rsa."bucket" = $2
     ORDER BY r."createdAt" ASC`,
    [trainingId, bucket],
  );
  return result.rows;
}

// Marks that the independent AI pass has run for this review, regardless of
// how many (if any) codes it suggested — see the "aiAttemptedAt" migration
// note in client.ts for why this can't be inferred from Tagging rows alone.
export async function markAiAttempted(trainingId: string, reviewId: string): Promise<void> {
  const db = await getDb();
  await db.query(
    `UPDATE "ReviewSplitAssignment" SET "aiAttemptedAt" = now() WHERE "trainingId" = $1 AND "reviewId" = $2`,
    [trainingId, reviewId],
  );
}

export async function countSplitAssignmentsByBucket(trainingId: string): Promise<Record<SplitBucket, number>> {
  const db = await getDb();
  const result = await db.query<{ bucket: SplitBucket; count: number }>(
    `SELECT "bucket", COUNT(*)::int AS count FROM "ReviewSplitAssignment" WHERE "trainingId" = $1 GROUP BY "bucket"`,
    [trainingId],
  );
  const counts: Record<SplitBucket, number> = { calibration: 0, test: 0, verification: 0 };
  for (const row of result.rows) counts[row.bucket] = row.count;
  return counts;
}

// Review ids that must not be hand-codeable through the normal Feature-A
// tagging flow for this codebook's context. Blindness matters for *all
// three* buckets equally — a calibration review seen through the normal
// AI-assisted flow first would be just as contaminated as a test or
// verification one — so every bucketed review is gated until the whole
// training is verified, at which point the entire split is revealed and
// rejoins normal circulation (there's no more blindness left to protect).
export async function getGatedReviewIds(codebookId: string): Promise<string[]> {
  const training = await getTrainingForCodebook(codebookId);
  if (!training || training.phase === "verified") return [];
  const db = await getDb();
  const result = await db.query<{ reviewId: string }>(
    `SELECT "reviewId" FROM "ReviewSplitAssignment" WHERE "trainingId" = $1`,
    [training.id],
  );
  return result.rows.map((r) => r.reviewId);
}

export async function lockTraining(trainingId: string): Promise<void> {
  const db = await getDb();
  await db.query(`UPDATE "CodebookTraining" SET "phase" = 'locked', "lockedAt" = now() WHERE "id" = $1`, [
    trainingId,
  ]);
}

export async function advanceTrainingPhase(trainingId: string, phase: TrainingPhase): Promise<void> {
  const db = await getDb();
  if (phase === "verified") {
    await db.query(`UPDATE "CodebookTraining" SET "phase" = $2, "verifiedAt" = now() WHERE "id" = $1`, [
      trainingId,
      phase,
    ]);
  } else {
    await db.query(`UPDATE "CodebookTraining" SET "phase" = $2 WHERE "id" = $1`, [trainingId, phase]);
  }
}

export interface UntrainedReview {
  reviewId: string;
  reviewText: string;
  reviewGameId: string;
}

// The Phase B4 target set: every review in the training's original scope
// that isn't part of the held-out split, hasn't already been attempted by a
// prior auto-code batch, and has no existing Tagging at all under this
// codebook (human or AI — a review a human already hand-coded through the
// normal AI-Assisted flow shouldn't silently get an uninvited independent
// AI opinion layered on top of it).
export async function listUntrainedReviews(
  training: CodebookTraining,
  gameIds: string[],
  codebookId: string,
): Promise<UntrainedReview[]> {
  const db = await getDb();
  const [splitRows, attemptRows, taggedRows] = await Promise.all([
    db.query<{ reviewId: string }>(`SELECT "reviewId" FROM "ReviewSplitAssignment" WHERE "trainingId" = $1`, [
      training.id,
    ]),
    db.query<{ reviewId: string }>(`SELECT "reviewId" FROM "AutoCodeAttempt" WHERE "trainingId" = $1`, [training.id]),
    db.query<{ reviewId: string }>(
      `SELECT DISTINCT t."reviewId" FROM "Tagging" t JOIN "Code" c ON c."id" = t."codeId" WHERE c."codebookId" = $1`,
      [codebookId],
    ),
  ]);
  const excludeIds = [
    ...new Set([...splitRows.rows, ...attemptRows.rows, ...taggedRows.rows].map((r) => r.reviewId)),
  ];

  const filters = Object.fromEntries(new URLSearchParams(training.filterQuery).entries()) as ReviewSearchParams;
  const remainingIds = await listReviewIdsOrdered(gameIds, filters, excludeIds);
  if (remainingIds.length === 0) return [];

  const result = await db.query<UntrainedReview>(
    `SELECT "id" AS "reviewId", "text" AS "reviewText", "gameId" AS "reviewGameId" FROM "Review" WHERE "id" = ANY($1)`,
    [remainingIds],
  );
  return result.rows;
}

// Marks that the bulk auto-code pass has attempted this review, regardless
// of how many (if any) codes it suggested — same "attempted vs. produced a
// tagging" distinction as markAiAttempted, needed here too since these
// reviews were never assigned to ReviewSplitAssignment in the first place.
export async function markAutoCodeAttempted(trainingId: string, reviewId: string): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO "AutoCodeAttempt" ("id", "trainingId", "reviewId") VALUES ($1, $2, $3)
     ON CONFLICT ("trainingId", "reviewId") DO NOTHING`,
    [newId(), trainingId, reviewId],
  );
}

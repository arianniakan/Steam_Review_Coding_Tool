import { getDb, newId } from "../client";
import { buildReviewWhereSql, buildReviewOrderBySql, type ReviewSearchParams } from "./reviewFilters";

export interface Review {
  id: string;
  gameId: string;
  steamReviewId: string;
  text: string;
  votedUp: boolean;
  playtimeForever: number;
  votesUp: number;
  votesFunny: number;
  weightedVoteScore: number;
  timestampCreated: string;
  timestampUpdated: string;
  writtenDuringEarlyAccess: boolean;
  steamPurchase: boolean;
  receivedForFree: boolean;
  commentCount: number;
  language: string;
  textLength: number;
  playtimeAtReview: number | null;
  playtimeLastTwoWeeks: number | null;
  authorNumGamesOwned: number | null;
  authorNumReviews: number | null;
  authorLastPlayed: string | null;
  createdAt: string;
}

export interface ReviewWithTaggingCount extends Review {
  taggingCount: number;
}

const PAGE_SIZE = 25;

export async function countReviews(gameId: string, sp: ReviewSearchParams): Promise<number> {
  const db = await getDb();
  const { sql, params } = buildReviewWhereSql(gameId, sp);
  const result = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM "Review" WHERE ${sql}`,
    params,
  );
  return result.rows[0]?.count ?? 0;
}

export async function countCodedReviews(gameId: string, sp: ReviewSearchParams): Promise<number> {
  const db = await getDb();
  const { sql, params } = buildReviewWhereSql(gameId, sp);
  const result = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM "Review" r
     WHERE ${sql} AND EXISTS (SELECT 1 FROM "Tagging" t WHERE t."reviewId" = r."id")`,
    params,
  );
  return result.rows[0]?.count ?? 0;
}

export async function listReviews(
  gameId: string,
  sp: ReviewSearchParams,
  page: number,
): Promise<ReviewWithTaggingCount[]> {
  const db = await getDb();
  const { sql, params } = buildReviewWhereSql(gameId, sp);
  const orderBy = buildReviewOrderBySql(sp);
  const offset = Math.max(page - 1, 0) * PAGE_SIZE;
  const result = await db.query<ReviewWithTaggingCount>(
    `SELECT r.*,
       (SELECT COUNT(*)::int FROM "Tagging" t WHERE t."reviewId" = r."id") AS "taggingCount"
     FROM "Review" r
     WHERE ${sql}
     ORDER BY ${orderBy}
     LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    params,
  );
  return result.rows;
}

export async function getReviewById(id: string): Promise<Review | null> {
  const db = await getDb();
  const result = await db.query<Review>(`SELECT * FROM "Review" WHERE "id" = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function listReviewIdsOrdered(
  gameId: string,
  sp: ReviewSearchParams,
): Promise<string[]> {
  const db = await getDb();
  const { sql, params } = buildReviewWhereSql(gameId, sp);
  const orderBy = buildReviewOrderBySql(sp);
  const result = await db.query<{ id: string }>(
    `SELECT "id" FROM "Review" WHERE ${sql} ORDER BY ${orderBy}`,
    params,
  );
  return result.rows.map((r) => r.id);
}

export async function groupReviewsByLanguage(
  gameId: string,
): Promise<{ language: string; count: number }[]> {
  const db = await getDb();
  const result = await db.query<{ language: string; count: number }>(
    `SELECT "language", COUNT(*)::int AS count FROM "Review"
     WHERE "gameId" = $1 GROUP BY "language" ORDER BY count DESC`,
    [gameId],
  );
  return result.rows;
}

export interface IngestReviewRow {
  steamReviewId: string;
  text: string;
  votedUp: boolean;
  playtimeForever: number;
  votesUp: number;
  votesFunny: number;
  weightedVoteScore: number;
  timestampCreated: string;
  timestampUpdated: string;
  writtenDuringEarlyAccess: boolean;
  steamPurchase: boolean;
  receivedForFree: boolean;
  commentCount: number;
  language: string;
  textLength: number;
  playtimeAtReview: number | null;
  playtimeLastTwoWeeks: number | null;
  authorNumGamesOwned: number | null;
  authorNumReviews: number | null;
  authorLastPlayed: string | null;
}

// Upsert-by-steamReviewId, mirroring the old Prisma logic: re-ingesting an
// already-ingested game backfills newly-added fields on existing rows
// rather than silently no-opping.
export async function upsertReviewsBatch(
  gameId: string,
  rows: IngestReviewRow[],
): Promise<{ insertedCount: number; updatedCount: number }> {
  if (rows.length === 0) return { insertedCount: 0, updatedCount: 0 };
  const db = await getDb();

  const existing = await db.query<{ steamReviewId: string }>(
    `SELECT "steamReviewId" FROM "Review" WHERE "gameId" = $1 AND "steamReviewId" = ANY($2)`,
    [gameId, rows.map((r) => r.steamReviewId)],
  );
  const existingIds = new Set(existing.rows.map((r) => r.steamReviewId));

  for (const row of rows) {
    const id = newId();
    await db.query(
      `INSERT INTO "Review" (
        "id", "gameId", "steamReviewId", "text", "votedUp", "playtimeForever", "votesUp",
        "votesFunny", "weightedVoteScore", "timestampCreated", "timestampUpdated",
        "writtenDuringEarlyAccess", "steamPurchase", "receivedForFree", "commentCount",
        "language", "textLength", "playtimeAtReview", "playtimeLastTwoWeeks",
        "authorNumGamesOwned", "authorNumReviews", "authorLastPlayed"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      ON CONFLICT ("steamReviewId") DO UPDATE SET
        "text" = EXCLUDED."text",
        "votedUp" = EXCLUDED."votedUp",
        "playtimeForever" = EXCLUDED."playtimeForever",
        "votesUp" = EXCLUDED."votesUp",
        "votesFunny" = EXCLUDED."votesFunny",
        "weightedVoteScore" = EXCLUDED."weightedVoteScore",
        "timestampCreated" = EXCLUDED."timestampCreated",
        "timestampUpdated" = EXCLUDED."timestampUpdated",
        "writtenDuringEarlyAccess" = EXCLUDED."writtenDuringEarlyAccess",
        "steamPurchase" = EXCLUDED."steamPurchase",
        "receivedForFree" = EXCLUDED."receivedForFree",
        "commentCount" = EXCLUDED."commentCount",
        "language" = EXCLUDED."language",
        "textLength" = EXCLUDED."textLength",
        "playtimeAtReview" = EXCLUDED."playtimeAtReview",
        "playtimeLastTwoWeeks" = EXCLUDED."playtimeLastTwoWeeks",
        "authorNumGamesOwned" = EXCLUDED."authorNumGamesOwned",
        "authorNumReviews" = EXCLUDED."authorNumReviews",
        "authorLastPlayed" = EXCLUDED."authorLastPlayed"`,
      [
        id,
        gameId,
        row.steamReviewId,
        row.text,
        row.votedUp,
        row.playtimeForever,
        row.votesUp,
        row.votesFunny,
        row.weightedVoteScore,
        row.timestampCreated,
        row.timestampUpdated,
        row.writtenDuringEarlyAccess,
        row.steamPurchase,
        row.receivedForFree,
        row.commentCount,
        row.language,
        row.textLength,
        row.playtimeAtReview,
        row.playtimeLastTwoWeeks,
        row.authorNumGamesOwned,
        row.authorNumReviews,
        row.authorLastPlayed,
      ],
    );
  }

  return {
    insertedCount: rows.length - existingIds.size,
    updatedCount: existingIds.size,
  };
}

// --- Sampling for AI codebook generation (ported from suggest-codebook route) ---

const RANDOM_POOL_CAP = 300;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchSampleTexts(
  gameId: string,
  sp: ReviewSearchParams,
  count: number,
  mode: "helpful" | "random",
): Promise<string[]> {
  if (count <= 0) return [];
  const db = await getDb();
  const { sql, params } = buildReviewWhereSql(gameId, sp);
  if (mode === "random") {
    const pool = await db.query<{ text: string }>(
      `SELECT "text" FROM "Review" WHERE ${sql} LIMIT ${RANDOM_POOL_CAP}`,
      params,
    );
    return shuffle(pool.rows.map((r) => r.text)).slice(0, count);
  }
  const result = await db.query<{ text: string }>(
    `SELECT "text" FROM "Review" WHERE ${sql} ORDER BY "weightedVoteScore" DESC LIMIT ${count}`,
    params,
  );
  return result.rows.map((r) => r.text);
}

export async function sampleReviewsForCodebook(options: {
  gameId: string;
  filters: ReviewSearchParams;
  reviewIds: string[];
  sampleSize: number;
  ratio: number;
  sampleMode: "helpful" | "random";
  maxSampleSize: number;
  minReviewTextLength: number;
}): Promise<string[]> {
  const { gameId, filters, reviewIds, sampleSize, ratio, sampleMode, maxSampleSize, minReviewTextLength } =
    options;

  if (reviewIds.length > 0) {
    const db = await getDb();
    const capped = reviewIds.slice(0, maxSampleSize);
    const result = await db.query<{ text: string }>(
      `SELECT "text" FROM "Review" WHERE "gameId" = $1 AND "id" = ANY($2)`,
      [gameId, capped],
    );
    return result.rows.map((r) => r.text);
  }

  const requestedMinLength = Number(filters.minLength);
  const effectiveMinLength = Math.max(
    Number.isFinite(requestedMinLength) ? requestedMinLength : 0,
    minReviewTextLength,
  );
  const scopedFilters: ReviewSearchParams = { ...filters, minLength: String(effectiveMinLength) };

  if (filters.voted === "up" || filters.voted === "down") {
    return fetchSampleTexts(gameId, scopedFilters, sampleSize, sampleMode);
  }

  const positiveCount = Math.round((sampleSize * ratio) / 100);
  const negativeCount = sampleSize - positiveCount;
  const [positive, negative] = await Promise.all([
    fetchSampleTexts(gameId, { ...scopedFilters, voted: "up" }, positiveCount, sampleMode),
    fetchSampleTexts(gameId, { ...scopedFilters, voted: "down" }, negativeCount, sampleMode),
  ]);
  return [...positive, ...negative];
}

import { getDb, newId } from "../client";

export interface Game {
  id: string;
  steamAppId: number;
  name: string;
  createdAt: string;
  headerImage: string | null;
  shortDescription: string | null;
  genres: string[];
  releaseDate: string | null;
  developers: string[];
}

export interface GameWithCounts extends Game {
  reviewCount: number;
  codebookCount: number;
}

export async function listGames(): Promise<GameWithCounts[]> {
  const db = await getDb();
  const result = await db.query<GameWithCounts>(`
    SELECT g.*,
      (SELECT COUNT(*) FROM "Review" r WHERE r."gameId" = g."id")::int AS "reviewCount",
      (SELECT COUNT(*) FROM "Codebook" c WHERE c."gameId" = g."id")::int AS "codebookCount"
    FROM "Game" g
    ORDER BY g."createdAt" DESC
  `);
  return result.rows;
}

export async function getGameById(id: string): Promise<Game | null> {
  const db = await getDb();
  const result = await db.query<Game>(`SELECT * FROM "Game" WHERE "id" = $1`, [id]);
  return result.rows[0] ?? null;
}

export interface GameSteamData {
  name: string;
  headerImage: string | null;
  shortDescription: string | null;
  genres: string[];
  releaseDate: string | null;
  developers: string[];
}

export async function upsertGameFromSteam(
  steamAppId: number,
  data: GameSteamData,
): Promise<Game> {
  const db = await getDb();
  const existing = await db.query<Game>(`SELECT * FROM "Game" WHERE "steamAppId" = $1`, [
    steamAppId,
  ]);
  if (existing.rows[0]) {
    const updated = await db.query<Game>(
      `UPDATE "Game" SET "name" = $2, "headerImage" = $3, "shortDescription" = $4,
        "genres" = $5, "releaseDate" = $6, "developers" = $7
       WHERE "steamAppId" = $1 RETURNING *`,
      [
        steamAppId,
        data.name,
        data.headerImage,
        data.shortDescription,
        data.genres,
        data.releaseDate,
        data.developers,
      ],
    );
    return updated.rows[0]!;
  }
  const id = newId();
  const created = await db.query<Game>(
    `INSERT INTO "Game" ("id", "steamAppId", "name", "headerImage", "shortDescription", "genres", "releaseDate", "developers")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      id,
      steamAppId,
      data.name,
      data.headerImage,
      data.shortDescription,
      data.genres,
      data.releaseDate,
      data.developers,
    ],
  );
  return created.rows[0]!;
}

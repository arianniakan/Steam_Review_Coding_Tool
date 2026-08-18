import { getDb, newId } from "../client";

export interface SavedSample {
  id: string;
  gameId: string;
  name: string;
  query: string;
  createdAt: string;
}

export async function listSavedSamplesForGame(gameId: string): Promise<SavedSample[]> {
  const db = await getDb();
  const result = await db.query<SavedSample>(
    `SELECT * FROM "SavedSample" WHERE "gameId" = $1 ORDER BY "createdAt" DESC`,
    [gameId],
  );
  return result.rows;
}

export async function createSavedSample(
  gameId: string,
  name: string,
  query: string,
): Promise<SavedSample> {
  const db = await getDb();
  const id = newId();
  const result = await db.query<SavedSample>(
    `INSERT INTO "SavedSample" ("id", "gameId", "name", "query") VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, gameId, name, query],
  );
  return result.rows[0]!;
}

export async function deleteSavedSample(id: string): Promise<void> {
  const db = await getDb();
  await db.query(`DELETE FROM "SavedSample" WHERE "id" = $1`, [id]);
}

import { getDb } from "../client";

export interface Event {
  id: string;
  gameId: string;
  label: string;
  date: string;
  createdAt: string;
}

export async function listEventsForGame(gameId: string): Promise<Event[]> {
  const db = await getDb();
  const result = await db.query<Event>(
    `SELECT * FROM "Event" WHERE "gameId" = $1 ORDER BY "date" ASC`,
    [gameId],
  );
  return result.rows;
}

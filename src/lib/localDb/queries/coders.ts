import { getDb, newId } from "../client";

const RESEARCHER_EMAIL = "researcher@example.com";
const AI_CODER_EMAIL = "ai@system.local";

export interface Coder {
  id: string;
  kind: "HUMAN" | "AI";
  name: string;
  email: string | null;
}

async function upsertCoderByEmail(
  email: string,
  kind: "HUMAN" | "AI",
  name: string,
): Promise<Coder> {
  const db = await getDb();
  const existing = await db.query<Coder>(`SELECT * FROM "Coder" WHERE "email" = $1`, [email]);
  if (existing.rows[0]) return existing.rows[0];
  const id = newId();
  const created = await db.query<Coder>(
    `INSERT INTO "Coder" ("id", "kind", "name", "email") VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, kind, name, email],
  );
  return created.rows[0]!;
}

export function getDefaultResearcher(): Promise<Coder> {
  return upsertCoderByEmail(RESEARCHER_EMAIL, "HUMAN", "Default Researcher");
}

export function getAiCoder(): Promise<Coder> {
  return upsertCoderByEmail(AI_CODER_EMAIL, "AI", "AI Coder");
}

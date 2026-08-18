import { getDb, newId } from "../client";

const RESEARCHER_EMAIL = "researcher@example.com";
const AI_CODER_EMAIL = "ai@system.local";

export interface Coder {
  id: string;
  kind: "HUMAN" | "AI";
  name: string;
  email: string | null;
}

// A single atomic upsert rather than SELECT-then-INSERT — two concurrent
// calls (e.g. accepting two AI suggestions back-to-back) could otherwise
// both see "no row yet" and both try to INSERT, with the second violating
// the unique constraint on email. ON CONFLICT DO UPDATE (a harmless no-op)
// is used instead of DO NOTHING specifically so RETURNING * still gives
// back the existing row when a conflict happens.
async function upsertCoderByEmail(
  email: string,
  kind: "HUMAN" | "AI",
  name: string,
): Promise<Coder> {
  const db = await getDb();
  const id = newId();
  const result = await db.query<Coder>(
    `INSERT INTO "Coder" ("id", "kind", "name", "email") VALUES ($1, $2, $3, $4)
     ON CONFLICT ("email") DO UPDATE SET "email" = EXCLUDED."email"
     RETURNING *`,
    [id, kind, name, email],
  );
  return result.rows[0]!;
}

export function getDefaultResearcher(): Promise<Coder> {
  return upsertCoderByEmail(RESEARCHER_EMAIL, "HUMAN", "Default Researcher");
}

export function getAiCoder(): Promise<Coder> {
  return upsertCoderByEmail(AI_CODER_EMAIL, "AI", "AI Coder");
}

import { getDb, newId } from "../client";

export interface Codebook {
  id: string;
  gameId: string;
  name: string;
  version: number;
  createdAt: string;
}

export interface CodebookWithCodeCount extends Codebook {
  codeCount: number;
}

export async function listCodebooksForGame(gameId: string): Promise<CodebookWithCodeCount[]> {
  const db = await getDb();
  const result = await db.query<CodebookWithCodeCount>(
    `SELECT cb.*, (SELECT COUNT(*)::int FROM "Code" c WHERE c."codebookId" = cb."id") AS "codeCount"
     FROM "Codebook" cb WHERE cb."gameId" = $1 ORDER BY cb."createdAt" DESC`,
    [gameId],
  );
  return result.rows;
}

export async function getCodebookById(id: string): Promise<Codebook | null> {
  const db = await getDb();
  const result = await db.query<Codebook>(`SELECT * FROM "Codebook" WHERE "id" = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function createCodebook(gameId: string, name: string): Promise<Codebook> {
  const db = await getDb();
  const id = newId();
  const result = await db.query<Codebook>(
    `INSERT INTO "Codebook" ("id", "gameId", "name") VALUES ($1, $2, $3) RETURNING *`,
    [id, gameId, name],
  );
  return result.rows[0]!;
}

export interface NewCodeInput {
  label: string;
  description: string;
  color: string;
}

// Creates a codebook and all its codes in one transaction (mirrors the old
// prisma.$transaction in the codebooks/from-ai route) — used by AI-assisted
// codebook generation. Duplicate labels within the batch are skipped rather
// than failing the whole insert (skipDuplicates equivalent).
export async function createCodebookWithCodes(
  gameId: string,
  name: string,
  codes: NewCodeInput[],
): Promise<Codebook> {
  const db = await getDb();
  const codebookId = newId();
  await db.transaction(async (tx) => {
    await tx.query(`INSERT INTO "Codebook" ("id", "gameId", "name") VALUES ($1, $2, $3)`, [
      codebookId,
      gameId,
      name,
    ]);
    const seenLabels = new Set<string>();
    for (const code of codes) {
      if (seenLabels.has(code.label)) continue;
      seenLabels.add(code.label);
      await tx.query(
        `INSERT INTO "Code" ("id", "codebookId", "label", "description", "color")
         VALUES ($1, $2, $3, $4, $5)`,
        [newId(), codebookId, code.label, code.description, code.color],
      );
    }
  });
  const created = await getCodebookById(codebookId);
  return created!;
}

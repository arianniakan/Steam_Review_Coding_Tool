import { getDb, newId } from "../client";
import { listCodesForCodebook } from "./codes";

export interface Codebook {
  id: string;
  gameId: string | null;
  projectId: string | null;
  name: string;
  version: number;
  previousVersionId: string | null;
  trainingId: string | null;
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

export async function listCodebooksForProject(projectId: string): Promise<CodebookWithCodeCount[]> {
  const db = await getDb();
  const result = await db.query<CodebookWithCodeCount>(
    `SELECT cb.*, (SELECT COUNT(*)::int FROM "Code" c WHERE c."codebookId" = cb."id") AS "codeCount"
     FROM "Codebook" cb WHERE cb."projectId" = $1 ORDER BY cb."createdAt" DESC`,
    [projectId],
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

export async function createCodebookForProject(projectId: string, name: string): Promise<Codebook> {
  const db = await getDb();
  const id = newId();
  const result = await db.query<Codebook>(
    `INSERT INTO "Codebook" ("id", "projectId", "name") VALUES ($1, $2, $3) RETURNING *`,
    [id, projectId, name],
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

// Revises a codebook by copying it forward into a new row rather than
// editing in place — the old codebook's codes, taggings, and rejected
// suggestions stay untouched, so reliability history stays attached to the
// version that earned it (see README's "versioned, not edited-in-place").
// listCodesForCodebook orders by createdAt ASC, so a code's parent always
// appears before it — the old-id -> new-id map is always populated by the
// time a child code needs its remapped parentCodeId.
export async function reviseCodebook(codebookId: string): Promise<Codebook> {
  const old = await getCodebookById(codebookId);
  if (!old) throw new Error("Codebook not found");
  if (old.trainingId) {
    const training = await db_getTrainingPhase(old.trainingId);
    if (training === "locked" || training === "verified") {
      throw new Error("This codebook is locked for validation and can no longer be revised");
    }
  }
  const oldCodes = await listCodesForCodebook(codebookId);

  const db = await getDb();
  const newCodebookId = newId();
  await db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO "Codebook" ("id", "gameId", "projectId", "name", "version", "previousVersionId", "trainingId")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [newCodebookId, old.gameId, old.projectId, old.name, old.version + 1, old.id, old.trainingId],
    );
    const idMap = new Map<string, string>();
    for (const code of oldCodes) {
      const newCodeId = newId();
      idMap.set(code.id, newCodeId);
      const newParentId = code.parentCodeId ? (idMap.get(code.parentCodeId) ?? null) : null;
      await tx.query(
        `INSERT INTO "Code" ("id", "codebookId", "label", "description", "color", "parentCodeId")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [newCodeId, newCodebookId, code.label, code.description, code.color, newParentId],
      );
    }
    // Keep the training pointed at whichever codebook version is now active,
    // so the blind-tagging flow and gating always resolve to the latest one.
    if (old.trainingId) {
      await tx.query(`UPDATE "CodebookTraining" SET "currentCodebookId" = $1 WHERE "id" = $2`, [
        newCodebookId,
        old.trainingId,
      ]);
    }
  });
  const created = await getCodebookById(newCodebookId);
  return created!;
}

// Minimal standalone phase lookup — avoids a circular import with
// queries/training.ts (which doesn't need anything from this file).
async function db_getTrainingPhase(trainingId: string): Promise<string | null> {
  const db = await getDb();
  const result = await db.query<{ phase: string }>(`SELECT "phase" FROM "CodebookTraining" WHERE "id" = $1`, [
    trainingId,
  ]);
  return result.rows[0]?.phase ?? null;
}

export async function getNextVersionCodebook(codebookId: string): Promise<Codebook | null> {
  const db = await getDb();
  const result = await db.query<Codebook>(`SELECT * FROM "Codebook" WHERE "previousVersionId" = $1`, [
    codebookId,
  ]);
  return result.rows[0] ?? null;
}

// Same shape as createCodebookWithCodes, scoped to a project instead of a
// single game — used by AI-assisted codebook generation across multiple games.
export async function createCodebookWithCodesForProject(
  projectId: string,
  name: string,
  codes: NewCodeInput[],
): Promise<Codebook> {
  const db = await getDb();
  const codebookId = newId();
  await db.transaction(async (tx) => {
    await tx.query(`INSERT INTO "Codebook" ("id", "projectId", "name") VALUES ($1, $2, $3)`, [
      codebookId,
      projectId,
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

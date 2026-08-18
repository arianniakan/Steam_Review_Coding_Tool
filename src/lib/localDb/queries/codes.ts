import { getDb, newId } from "../client";

export interface Code {
  id: string;
  codebookId: string;
  label: string;
  description: string;
  color: string;
  parentCodeId: string | null;
  createdAt: string;
}

export class DuplicateCodeLabelError extends Error {
  constructor(label: string) {
    super(`A code named "${label}" already exists in this codebook`);
  }
}

export class CircularHierarchyError extends Error {
  constructor() {
    super("This would create a circular code hierarchy");
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export async function listCodesForCodebook(codebookId: string): Promise<Code[]> {
  const db = await getDb();
  const result = await db.query<Code>(
    `SELECT * FROM "Code" WHERE "codebookId" = $1 ORDER BY "createdAt" ASC`,
    [codebookId],
  );
  return result.rows;
}

export async function getCodeById(id: string): Promise<Code | null> {
  const db = await getDb();
  const result = await db.query<Code>(`SELECT * FROM "Code" WHERE "id" = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function createCode(data: {
  codebookId: string;
  label: string;
  description: string;
  color: string;
  parentCodeId: string | null;
}): Promise<Code> {
  const db = await getDb();
  const id = newId();
  try {
    const result = await db.query<Code>(
      `INSERT INTO "Code" ("id", "codebookId", "label", "description", "color", "parentCodeId")
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, data.codebookId, data.label, data.description, data.color, data.parentCodeId],
    );
    return result.rows[0]!;
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateCodeLabelError(data.label);
    throw err;
  }
}

// Walks the proposed parent chain to reject both direct self-parenting and
// deeper cycles (A -> B -> A), which the schema's FK alone can't prevent.
async function assertNoCycle(codeId: string, parentCodeId: string): Promise<void> {
  const db = await getDb();
  let cursor: string | null = parentCodeId;
  while (cursor) {
    if (cursor === codeId) throw new CircularHierarchyError();
    const result: { rows: { parentCodeId: string | null }[] } = await db.query(
      `SELECT "parentCodeId" FROM "Code" WHERE "id" = $1`,
      [cursor],
    );
    cursor = result.rows[0]?.parentCodeId ?? null;
  }
}

export async function updateCode(
  codeId: string,
  patch: {
    label?: string;
    description?: string;
    color?: string;
    parentCodeId?: string | null;
  },
): Promise<Code> {
  const existing = await getCodeById(codeId);
  if (!existing) throw new Error("Code not found");

  const label = patch.label?.trim() || existing.label;
  const description = patch.description?.trim() || existing.description;
  const color = patch.color || existing.color;
  const parentCodeId = patch.parentCodeId === undefined ? existing.parentCodeId : patch.parentCodeId;

  if (parentCodeId) await assertNoCycle(codeId, parentCodeId);

  const db = await getDb();
  try {
    const result = await db.query<Code>(
      `UPDATE "Code" SET "label" = $2, "description" = $3, "color" = $4, "parentCodeId" = $5
       WHERE "id" = $1 RETURNING *`,
      [codeId, label, description, color, parentCodeId],
    );
    return result.rows[0]!;
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateCodeLabelError(label);
    throw err;
  }
}

export async function deleteCode(id: string): Promise<void> {
  // Child codes are automatically detached (parentCodeId -> null) via the
  // schema's ON DELETE SET NULL; taggings using this code cascade-delete.
  const db = await getDb();
  await db.query(`DELETE FROM "Code" WHERE "id" = $1`, [id]);
}

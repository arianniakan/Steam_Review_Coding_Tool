import { getDb, newId } from "../client";
import type { Game } from "./games";

export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

export interface ProjectWithCounts extends Project {
  gameCount: number;
  codebookCount: number;
}

export async function listProjects(): Promise<ProjectWithCounts[]> {
  const db = await getDb();
  const result = await db.query<ProjectWithCounts>(`
    SELECT p.*,
      (SELECT COUNT(*) FROM "ProjectGame" pg WHERE pg."projectId" = p."id")::int AS "gameCount",
      (SELECT COUNT(*) FROM "Codebook" c WHERE c."projectId" = p."id")::int AS "codebookCount"
    FROM "Project" p
    ORDER BY p."createdAt" DESC
  `);
  return result.rows;
}

export async function getProjectById(id: string): Promise<Project | null> {
  const db = await getDb();
  const result = await db.query<Project>(`SELECT * FROM "Project" WHERE "id" = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function createProject(name: string): Promise<Project> {
  const db = await getDb();
  const id = newId();
  const result = await db.query<Project>(
    `INSERT INTO "Project" ("id", "name") VALUES ($1, $2) RETURNING *`,
    [id, name],
  );
  return result.rows[0]!;
}

export async function listGamesForProject(projectId: string): Promise<Game[]> {
  const db = await getDb();
  const result = await db.query<Game>(
    `SELECT g.* FROM "Game" g
     JOIN "ProjectGame" pg ON pg."gameId" = g."id"
     WHERE pg."projectId" = $1
     ORDER BY g."name" ASC`,
    [projectId],
  );
  return result.rows;
}

export async function listGamesNotInProject(projectId: string): Promise<Game[]> {
  const db = await getDb();
  const result = await db.query<Game>(
    `SELECT g.* FROM "Game" g
     WHERE NOT EXISTS (
       SELECT 1 FROM "ProjectGame" pg WHERE pg."projectId" = $1 AND pg."gameId" = g."id"
     )
     ORDER BY g."name" ASC`,
    [projectId],
  );
  return result.rows;
}

export async function listProjectsForGame(gameId: string): Promise<Project[]> {
  const db = await getDb();
  const result = await db.query<Project>(
    `SELECT p.* FROM "Project" p
     JOIN "ProjectGame" pg ON pg."projectId" = p."id"
     WHERE pg."gameId" = $1
     ORDER BY p."name" ASC`,
    [gameId],
  );
  return result.rows;
}

export async function addGameToProject(projectId: string, gameId: string): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO "ProjectGame" ("projectId", "gameId") VALUES ($1, $2)
     ON CONFLICT ("projectId", "gameId") DO NOTHING`,
    [projectId, gameId],
  );
}

export async function removeGameFromProject(projectId: string, gameId: string): Promise<void> {
  const db = await getDb();
  await db.query(`DELETE FROM "ProjectGame" WHERE "projectId" = $1 AND "gameId" = $2`, [
    projectId,
    gameId,
  ]);
}

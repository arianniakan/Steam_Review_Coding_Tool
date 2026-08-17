import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  context: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await context.params;
  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const query = typeof body.query === "string" ? body.query : "";

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  const sample = await prisma.savedSample.create({ data: { gameId, name, query } });
  return NextResponse.json(sample, { status: 201 });
}

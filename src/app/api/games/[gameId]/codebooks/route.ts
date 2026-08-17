import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  context: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await context.params;
  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Codebook name is required" }, { status: 400 });
  }

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const codebook = await prisma.codebook.create({
    data: { gameId, name },
  });

  return NextResponse.json(codebook, { status: 201 });
}

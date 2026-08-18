import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface IncomingCode {
  label: string;
  description: string;
  color: string;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await context.params;
  const body = await request.json().catch(() => ({}) as Record<string, unknown>);

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const codes = Array.isArray(body.codes) ? (body.codes as IncomingCode[]) : [];

  if (!name) {
    return NextResponse.json({ error: "Codebook name is required" }, { status: 400 });
  }
  const cleanCodes = codes
    .map((c) => ({
      label: typeof c.label === "string" ? c.label.trim() : "",
      description: typeof c.description === "string" ? c.description.trim() : "",
      color: typeof c.color === "string" && c.color ? c.color : "#6b7280",
    }))
    .filter((c) => c.label && c.description);
  if (cleanCodes.length === 0) {
    return NextResponse.json({ error: "At least one code is required" }, { status: 400 });
  }

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  const codebook = await prisma.$transaction(async (tx) => {
    const cb = await tx.codebook.create({ data: { gameId, name } });
    await tx.code.createMany({
      data: cleanCodes.map((c) => ({ ...c, codebookId: cb.id })),
      skipDuplicates: true, // in case the AI proposed two codes with the same label
    });
    return cb;
  });

  return NextResponse.json(codebook, { status: 201 });
}

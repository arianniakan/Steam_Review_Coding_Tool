import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export async function POST(
  request: Request,
  context: { params: Promise<{ codebookId: string }> },
) {
  const { codebookId } = await context.params;
  const body = await request.json().catch(() => ({}) as Record<string, unknown>);

  const label = typeof body.label === "string" ? body.label.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const color = typeof body.color === "string" && body.color ? body.color : "#6b7280";
  const parentCodeId = typeof body.parentCodeId === "string" && body.parentCodeId ? body.parentCodeId : null;

  if (!label) {
    return NextResponse.json({ error: "Code label is required" }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json(
      { error: "Code description is required — future coders (and the AI) rely on it to know when to apply this code" },
      { status: 400 },
    );
  }

  const codebook = await prisma.codebook.findUnique({ where: { id: codebookId } });
  if (!codebook) {
    return NextResponse.json({ error: "Codebook not found" }, { status: 404 });
  }

  try {
    const code = await prisma.code.create({
      data: { codebookId, label, description, color, parentCodeId },
    });
    return NextResponse.json(code, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: `A code named "${label}" already exists in this codebook` },
        { status: 409 },
      );
    }
    throw err;
  }
}

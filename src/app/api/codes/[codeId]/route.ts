import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ codeId: string }> },
) {
  const { codeId } = await context.params;
  const body = await request.json().catch(() => ({}) as Record<string, unknown>);

  const existing = await prisma.code.findUnique({ where: { id: codeId } });
  if (!existing) {
    return NextResponse.json({ error: "Code not found" }, { status: 404 });
  }

  const label = typeof body.label === "string" ? body.label.trim() : existing.label;
  const description =
    typeof body.description === "string" ? body.description.trim() : existing.description;
  const color = typeof body.color === "string" && body.color ? body.color : existing.color;
  const parentCodeId =
    body.parentCodeId === null
      ? null
      : typeof body.parentCodeId === "string" && body.parentCodeId
        ? body.parentCodeId
        : existing.parentCodeId;

  if (!label) {
    return NextResponse.json({ error: "Code label is required" }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json(
      { error: "Code description is required — future coders (and the AI) rely on it to know when to apply this code" },
      { status: 400 },
    );
  }

  // Walk the proposed parent chain to reject both direct self-parenting and
  // deeper cycles (A -> B -> A), which the schema's FK alone can't prevent.
  if (parentCodeId) {
    let cursor: string | null = parentCodeId;
    while (cursor) {
      if (cursor === codeId) {
        return NextResponse.json(
          { error: "This would create a circular code hierarchy" },
          { status: 400 },
        );
      }
      const parent: { parentCodeId: string | null } | null = await prisma.code.findUnique({
        where: { id: cursor },
        select: { parentCodeId: true },
      });
      cursor = parent?.parentCodeId ?? null;
    }
  }

  try {
    const code = await prisma.code.update({
      where: { id: codeId },
      data: { label, description, color, parentCodeId },
    });
    return NextResponse.json(code);
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

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ codeId: string }> },
) {
  const { codeId } = await context.params;

  const code = await prisma.code.findUnique({ where: { id: codeId } });
  if (!code) {
    return NextResponse.json({ error: "Code not found" }, { status: 404 });
  }

  // Child codes are automatically detached (parentCodeId -> null) via the
  // schema's ON DELETE SET NULL; taggings using this code cascade-delete.
  await prisma.code.delete({ where: { id: codeId } });

  return NextResponse.json({ ok: true });
}

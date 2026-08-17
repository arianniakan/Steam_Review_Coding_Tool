import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

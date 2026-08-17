import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ taggingId: string }> },
) {
  const { taggingId } = await context.params;

  const tagging = await prisma.tagging.findUnique({ where: { id: taggingId } });
  if (!tagging) {
    return NextResponse.json({ error: "Tagging not found" }, { status: 404 });
  }

  await prisma.tagging.delete({ where: { id: taggingId } });
  return NextResponse.json({ ok: true });
}

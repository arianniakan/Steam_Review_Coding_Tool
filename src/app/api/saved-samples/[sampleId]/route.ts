import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ sampleId: string }> },
) {
  const { sampleId } = await context.params;
  const sample = await prisma.savedSample.findUnique({ where: { id: sampleId } });
  if (!sample) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.savedSample.delete({ where: { id: sampleId } });
  return NextResponse.json({ ok: true });
}

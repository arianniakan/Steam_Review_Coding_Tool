import { NextResponse } from "next/server";
import { envLimit } from "@/lib/rateLimit";

// Exposes the server-only AUTO_CODE_BATCH_SIZE env var to the client the
// same way /api/rate-limit-status exposes rate-limit config — a plain env
// var isn't visible to the browser bundle without a NEXT_PUBLIC_ prefix,
// and this one is deliberately kept server-only so a private deployment can
// raise it without a rebuild.
export async function GET() {
  return NextResponse.json({ batchSize: envLimit("AUTO_CODE_BATCH_SIZE", 25) });
}

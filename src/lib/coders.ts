import { prisma } from "@/lib/prisma";

// Auth is simplified to a single hardcoded researcher for this portfolio
// build (see build plan) — these upserts make that self-healing even if
// `prisma/seed.ts` was never run, rather than requiring a separate step.
const RESEARCHER_EMAIL = "researcher@example.com";
const AI_CODER_EMAIL = "ai@system.local";

export function getDefaultResearcher() {
  return prisma.coder.upsert({
    where: { email: RESEARCHER_EMAIL },
    update: {},
    create: { kind: "HUMAN", name: "Default Researcher", email: RESEARCHER_EMAIL },
  });
}

export function getAiCoder() {
  return prisma.coder.upsert({
    where: { email: AI_CODER_EMAIL },
    update: {},
    create: { kind: "AI", name: "AI Coder", email: AI_CODER_EMAIL },
  });
}

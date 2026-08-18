import type { Prisma } from "@/generated/prisma/client";
import { getPlaytimeTier } from "@/lib/playtimeTiers";

export interface ReviewSearchParams {
  voted?: string; // "up" | "down" | undefined (= all)
  earlyAccess?: string; // "true" | undefined (= all)
  playtime?: string; // one of PLAYTIME_TIERS values
  from?: string; // ISO date
  to?: string; // ISO date
  page?: string;
}

export function buildReviewWhere(
  gameId: string,
  sp: ReviewSearchParams,
): Prisma.ReviewWhereInput {
  const where: Prisma.ReviewWhereInput = { gameId };

  if (sp.voted === "up") where.votedUp = true;
  if (sp.voted === "down") where.votedUp = false;

  if (sp.earlyAccess === "true") where.writtenDuringEarlyAccess = true;

  const tier = sp.playtime ? getPlaytimeTier(sp.playtime) : undefined;
  if (tier) {
    where.playtimeForever = {
      gte: tier.minMinutes,
      ...(tier.maxMinutes !== null ? { lt: tier.maxMinutes } : {}),
    };
  }

  if (sp.from || sp.to) {
    where.timestampCreated = {
      ...(sp.from ? { gte: new Date(sp.from) } : {}),
      ...(sp.to ? { lte: new Date(sp.to) } : {}),
    };
  }

  return where;
}

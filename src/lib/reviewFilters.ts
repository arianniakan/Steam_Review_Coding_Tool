import type { Prisma } from "@/generated/prisma/client";
import { getPlaytimeTier } from "@/lib/playtimeTiers";

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "helpful", label: "Most helpful (Steam quality score)" },
  { value: "votes", label: "Most helpful votes" },
  { value: "longest", label: "Longest review" },
  { value: "playtime_at_review", label: "Most playtime at time of review" },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]["value"];

export interface ReviewSearchParams {
  voted?: string; // "up" | "down" | undefined (= all)
  earlyAccess?: string; // "true" | undefined (= all)
  playtime?: string; // one of PLAYTIME_TIERS values
  from?: string; // ISO date
  to?: string; // ISO date
  purchase?: string; // "verified" | "free" | undefined (= all)
  language?: string; // exact Steam language code
  minVotes?: string; // minimum helpful votes, numeric string
  minLength?: string; // minimum review text length (chars), numeric string
  sort?: string; // one of SORT_OPTIONS values
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

  if (sp.purchase === "verified") where.steamPurchase = true;
  if (sp.purchase === "free") where.receivedForFree = true;

  if (sp.language) where.language = sp.language;

  const minVotes = Number(sp.minVotes);
  if (sp.minVotes && Number.isFinite(minVotes)) {
    where.votesUp = { gte: minVotes };
  }

  const minLength = Number(sp.minLength);
  if (sp.minLength && Number.isFinite(minLength)) {
    where.textLength = { gte: minLength };
  }

  return where;
}

export function buildReviewOrderBy(
  sp: ReviewSearchParams,
): Prisma.ReviewOrderByWithRelationInput {
  switch (sp.sort as SortValue) {
    case "oldest":
      return { timestampCreated: "asc" };
    case "helpful":
      return { weightedVoteScore: "desc" };
    case "votes":
      return { votesUp: "desc" };
    case "longest":
      return { textLength: "desc" };
    case "playtime_at_review":
      return { playtimeAtReview: { sort: "desc", nulls: "last" } };
    case "newest":
    default:
      return { timestampCreated: "desc" };
  }
}

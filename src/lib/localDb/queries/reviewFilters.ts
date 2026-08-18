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
  voted?: string;
  earlyAccess?: string;
  playtime?: string;
  from?: string;
  to?: string;
  purchase?: string;
  language?: string;
  minVotes?: string;
  minLength?: string;
  sort?: string;
  page?: string;
}

// SQL port of the old Prisma-object buildReviewWhere/buildReviewOrderBy —
// same filter semantics, but producing a parameterized WHERE fragment
// instead of a Prisma `where` object, since queries now run directly
// against PGlite rather than through Prisma Client.
export function buildReviewWhereSql(
  gameId: string,
  sp: ReviewSearchParams,
): { sql: string; params: unknown[] } {
  const conditions: string[] = [`"gameId" = $1`];
  const params: unknown[] = [gameId];

  function push(template: string, value: unknown) {
    params.push(value);
    conditions.push(template.replace("?", `$${params.length}`));
  }

  if (sp.voted === "up") push(`"votedUp" = ?`, true);
  if (sp.voted === "down") push(`"votedUp" = ?`, false);

  if (sp.earlyAccess === "true") push(`"writtenDuringEarlyAccess" = ?`, true);

  const tier = sp.playtime ? getPlaytimeTier(sp.playtime) : undefined;
  if (tier) {
    push(`"playtimeForever" >= ?`, tier.minMinutes);
    if (tier.maxMinutes !== null) push(`"playtimeForever" < ?`, tier.maxMinutes);
  }

  if (sp.from) push(`"timestampCreated" >= ?`, new Date(sp.from).toISOString());
  if (sp.to) push(`"timestampCreated" <= ?`, new Date(sp.to).toISOString());

  if (sp.purchase === "verified") push(`"steamPurchase" = ?`, true);
  if (sp.purchase === "free") push(`"receivedForFree" = ?`, true);

  if (sp.language) push(`"language" = ?`, sp.language);

  const minVotes = Number(sp.minVotes);
  if (sp.minVotes && Number.isFinite(minVotes)) push(`"votesUp" >= ?`, minVotes);

  const minLength = Number(sp.minLength);
  if (sp.minLength && Number.isFinite(minLength)) push(`"textLength" >= ?`, minLength);

  return { sql: conditions.join(" AND "), params };
}

export function buildReviewOrderBySql(sp: ReviewSearchParams): string {
  switch (sp.sort as SortValue) {
    case "oldest":
      return `"timestampCreated" ASC`;
    case "helpful":
      return `"weightedVoteScore" DESC`;
    case "votes":
      return `"votesUp" DESC`;
    case "longest":
      return `"textLength" DESC`;
    case "playtime_at_review":
      return `"playtimeAtReview" DESC NULLS LAST`;
    case "newest":
    default:
      return `"timestampCreated" DESC`;
  }
}

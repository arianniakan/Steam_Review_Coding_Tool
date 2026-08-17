// Shared playtime tier definitions used by both the filter form and the
// Prisma query that applies it — one source of truth for the tier cutoffs.

export interface PlaytimeTier {
  value: string;
  label: string;
  minMinutes: number;
  maxMinutes: number | null; // null = no upper bound
}

export const PLAYTIME_TIERS: PlaytimeTier[] = [
  { value: "0-2", label: "Under 2h", minMinutes: 0, maxMinutes: 120 },
  { value: "2-10", label: "2–10h", minMinutes: 120, maxMinutes: 600 },
  { value: "10-50", label: "10–50h", minMinutes: 600, maxMinutes: 3000 },
  { value: "50+", label: "50h+", minMinutes: 3000, maxMinutes: null },
];

export function getPlaytimeTier(value: string): PlaytimeTier | undefined {
  return PLAYTIME_TIERS.find((t) => t.value === value);
}

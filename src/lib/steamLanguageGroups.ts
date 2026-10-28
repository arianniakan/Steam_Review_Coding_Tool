// Steam's review endpoint accepts a comma-separated `language` filter, and
// each group below is fetched as its own independent, concurrently-running
// cursor-paginated stream — that's what makes "All languages (parallel)"
// faster than one sequential "all" stream: Steam's pagination cursor is
// inherently sequential within a single query, so this is the only real way
// to parallelize it. English gets its own group since it's almost always
// the single largest bucket for a game's reviews; the rest of Steam's
// review-language codes are split into two further groups.
export const STEAM_LANGUAGE_GROUPS: string[][] = [
  ["english"],
  ["schinese", "tchinese", "japanese", "koreana", "thai", "russian", "german", "french", "spanish"],
  [
    "latam", "brazilian", "portuguese", "italian", "polish", "turkish", "dutch", "swedish",
    "norwegian", "danish", "finnish", "czech", "hungarian", "romanian", "bulgarian", "greek",
    "ukrainian", "indonesian", "vietnamese",
  ],
];

export function languageGroupKey(group: string[]): string {
  return group.join(",");
}

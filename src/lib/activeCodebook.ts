// "Active codebook" is a per-game concept a researcher carries between the
// Reviews list, a review's tagging view, and Analytics — not something
// re-chosen from scratch on every page. Resolution order: an explicit
// ?codebookId= in the URL (shareable/bookmarkable) wins; otherwise fall back
// to the last one used in this browser for this game; otherwise the first
// codebook. Never a hook — computed once, synchronously, inside whichever
// effect already fetches the codebook list, so it lands in state alongside
// everything else rather than causing an extra render pass.

const KEY_PREFIX = "active-codebook:";

export function getStoredActiveCodebookId(gameId: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY_PREFIX + gameId);
}

export function setStoredActiveCodebookId(gameId: string, codebookId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_PREFIX + gameId, codebookId);
}

export function resolveActiveCodebookId(
  gameId: string,
  codebooks: { id: string }[],
  urlCodebookId: string | null,
): string | undefined {
  if (codebooks.length === 0) return undefined;

  if (urlCodebookId && codebooks.some((cb) => cb.id === urlCodebookId)) {
    setStoredActiveCodebookId(gameId, urlCodebookId);
    return urlCodebookId;
  }

  const stored = getStoredActiveCodebookId(gameId);
  if (stored && codebooks.some((cb) => cb.id === stored)) {
    return stored;
  }

  return codebooks[0]!.id;
}

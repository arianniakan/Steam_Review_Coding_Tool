// Client for Steam's public appreviews and appdetails endpoints.
// No API key required for either — see:
// https://partner.steamgames.com/doc/store/getreviews
//
// The documented `/appreviews/{appid}?json=1` path now 302-redirects to the
// normal store page for every request we've tried — including a real
// browser navigating straight to the URL, not just server-side fetches.
// Watching the actual Hollow Knight store page make its own "load more
// reviews" request (DevTools network tab) showed it calls a different,
// undocumented path instead — `/ajaxappreviews/{appid}` — which still
// returns the exact same JSON shape (`success`/`query_summary`/`reviews`/
// `cursor`) using the same query params we already send, no special
// headers or cookies required. This looks like Steam quietly moved the
// endpoint rather than started anti-bot-gating it; `/ajaxappreviews/` is
// what we use now.

export interface SteamReview {
  recommendationid: string;
  author: {
    steamid: string;
    playtime_forever: number;
    // Not present on every review (added to Steam's API after older
    // reviews were written) — treat as optional.
    playtime_at_review?: number;
    playtime_last_two_weeks?: number;
    num_games_owned?: number;
    num_reviews?: number;
    last_played?: number;
  };
  language: string;
  review: string;
  timestamp_created: number;
  timestamp_updated: number;
  voted_up: boolean;
  votes_up: number;
  votes_funny: number;
  weighted_vote_score: string;
  comment_count: number;
  steam_purchase: boolean;
  received_for_free: boolean;
  written_during_early_access: boolean;
}

interface SteamReviewsResponse {
  success: number;
  query_summary: {
    total_reviews: number;
  };
  reviews: SteamReview[];
  cursor: string;
}

export async function fetchReviewPage(
  appId: number,
  cursor: string,
  numPerPage = 100,
  language = "all",
): Promise<SteamReviewsResponse> {
  const url = new URL(`https://store.steampowered.com/ajaxappreviews/${appId}`);
  url.searchParams.set("json", "1");
  url.searchParams.set("filter", "recent");
  url.searchParams.set("language", language);
  url.searchParams.set("cursor", cursor);
  url.searchParams.set("num_per_page", String(numPerPage));
  url.searchParams.set("purchase_type", "all");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Steam appreviews request failed: ${res.status}`);
  }
  // Defensive leftover from when we were hitting the old, now-redirecting
  // `/appreviews/` path: if Steam ever changes `/ajaxappreviews/` the same
  // way, `fetch` would follow the redirect silently and this is what turns
  // that into a clear error instead of a cryptic "Unexpected token '<'"
  // from JSON.parse on the redirected HTML.
  const contentType = res.headers.get("content-type") ?? "";
  if (res.redirected || !contentType.includes("application/json")) {
    throw new Error(
      "Steam didn't return review data for this request (redirected instead) — try again in a bit",
    );
  }
  return res.json();
}

// Accepts a raw numeric App ID or a Steam store URL in any of its common
// forms (with/without protocol, trailing slug, or query params) and pulls
// out the App ID either way. Returns null if neither pattern matches.
export function parseSteamAppId(input: string): number | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/\/app\/(\d+)/);
  if (urlMatch) return Number(urlMatch[1]);
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return null;
}

export interface SteamAppDetails {
  name: string;
  headerImage: string | null;
  shortDescription: string | null;
  genres: string[];
  releaseDate: string | null;
  developers: string[];
}

export async function fetchAppDetails(appId: number): Promise<SteamAppDetails> {
  const fallback: SteamAppDetails = {
    name: `App ${appId}`,
    headerImage: null,
    shortDescription: null,
    genres: [],
    releaseDate: null,
    developers: [],
  };
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appId}`,
    );
    if (!res.ok) return fallback;
    const data = await res.json();
    const entry = data?.[String(appId)];
    if (!entry?.success || !entry.data) return fallback;
    const d = entry.data;
    return {
      name: typeof d.name === "string" ? d.name : fallback.name,
      headerImage: typeof d.header_image === "string" ? d.header_image : null,
      shortDescription: typeof d.short_description === "string" ? d.short_description : null,
      genres: Array.isArray(d.genres)
        ? d.genres.map((g: { description?: string }) => g.description).filter(Boolean)
        : [],
      releaseDate: typeof d.release_date?.date === "string" ? d.release_date.date : null,
      developers: Array.isArray(d.developers) ? d.developers.filter((x: unknown) => typeof x === "string") : [],
    };
  } catch {
    // appdetails is occasionally flaky/rate-limited — fall back below
    return fallback;
  }
}

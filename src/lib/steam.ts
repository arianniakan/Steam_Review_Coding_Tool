// Client for Steam's public appreviews and appdetails endpoints.
// No API key required for either — see:
// https://partner.steamgames.com/doc/store/getreviews

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
): Promise<SteamReviewsResponse> {
  const url = new URL(`https://store.steampowered.com/appreviews/${appId}`);
  url.searchParams.set("json", "1");
  url.searchParams.set("filter", "recent");
  url.searchParams.set("language", "all");
  url.searchParams.set("cursor", cursor);
  url.searchParams.set("num_per_page", String(numPerPage));
  url.searchParams.set("purchase_type", "all");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Steam appreviews request failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchAppName(appId: number): Promise<string> {
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appId}`,
    );
    if (!res.ok) return `App ${appId}`;
    const data = await res.json();
    const entry = data?.[String(appId)];
    if (entry?.success && entry.data?.name) {
      return entry.data.name as string;
    }
  } catch {
    // appdetails is occasionally flaky/rate-limited — fall back below
  }
  return `App ${appId}`;
}

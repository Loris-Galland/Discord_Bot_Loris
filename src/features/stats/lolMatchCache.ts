import { regionalForMatchId, type MatchDto, type MatchTimelineDto } from "./lol.types";
import { getMatch, getMatchTimeline, RiotApiError } from "./riotApi.service";

// Finished matches never change, and people tend to click through several buttons of the
// same scoreboard in a row — a small in-memory cache saves most of those Riot API calls.
const MAX_ENTRIES = 30;
const matches = new Map<string, MatchDto>();
const timelines = new Map<string, MatchTimelineDto>();

function remember<T>(cache: Map<string, T>, key: string, value: T): T {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
  return value;
}

function requireRegional(matchId: string) {
  const regional = regionalForMatchId(matchId);
  if (!regional) {
    throw new RiotApiError(`Unsupported region for match ${matchId}.`);
  }
  return regional;
}

export async function getCachedMatch(matchId: string): Promise<MatchDto> {
  const cached = matches.get(matchId);
  if (cached) {
    return cached;
  }
  return remember(matches, matchId, await getMatch(requireRegional(matchId), matchId));
}

export async function getCachedTimeline(matchId: string): Promise<MatchTimelineDto> {
  const cached = timelines.get(matchId);
  if (cached) {
    return cached;
  }
  return remember(timelines, matchId, await getMatchTimeline(requireRegional(matchId), matchId));
}

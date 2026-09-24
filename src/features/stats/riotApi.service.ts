import { config } from "../../shared/config/env";
import { createLogger } from "../../shared/logger/logger";
import type {
  CurrentGameInfoDto,
  LeagueEntryDto,
  MatchDto,
  MatchTimelineDto,
  RegionalRouting,
  RiotAccountDto,
} from "./lol.types";

const logger = createLogger("riot-api");

export class RiotApiError extends Error {}

// Separate subclass so callers polling for something that doesn't exist *yet* (a match
// still being played) can tell "not there" apart from a real API failure.
export class RiotNotFoundError extends RiotApiError {}

function requireApiKey(): string {
  if (!config.riotApiKey) {
    throw new RiotApiError("The LoL stats feature requires RIOT_API_KEY in .env.");
  }
  return config.riotApiKey;
}

async function riotFetch<T>(url: string, notFoundMessage: string): Promise<T> {
  logger.debug(`Requesting ${url}`);
  const response = await fetch(url, { headers: { "X-Riot-Token": requireApiKey() } });

  if (response.status === 404) {
    throw new RiotNotFoundError(notFoundMessage);
  }
  if (response.status === 429) {
    throw new RiotApiError("Riot API rate limit reached, try again in a moment.");
  }
  if (!response.ok) {
    throw new RiotApiError(`Riot API error: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

export async function getAccountByRiotId(
  regional: RegionalRouting,
  gameName: string,
  tagLine: string,
): Promise<RiotAccountDto> {
  const url = `https://${regional}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  return riotFetch<RiotAccountDto>(
    url,
    `No Riot account found for ${gameName}#${tagLine} in that region.`,
  );
}

export async function getRankedEntries(platform: string, puuid: string): Promise<LeagueEntryDto[]> {
  const url = `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;
  return riotFetch<LeagueEntryDto[]>(url, "No ranked data found for this account.");
}

export async function getRecentMatchIds(
  regional: RegionalRouting,
  puuid: string,
  count: number,
): Promise<string[]> {
  const url = `https://${regional}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`;
  return riotFetch<string[]>(url, "No match history found for this account.");
}

export async function getMatch(regional: RegionalRouting, matchId: string): Promise<MatchDto> {
  const url = `https://${regional}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
  return riotFetch<MatchDto>(url, "Match not found.");
}

export async function getMatchTimeline(
  regional: RegionalRouting,
  matchId: string,
): Promise<MatchTimelineDto> {
  const url = `https://${regional}.api.riotgames.com/lol/match/v5/matches/${matchId}/timeline`;
  return riotFetch<MatchTimelineDto>(url, "Match timeline not found.");
}

// A 404 here just means the player isn't in a game — the normal, expected case most of
// the time — so it returns null instead of going through riotFetch's throw-on-404 path.
export async function getActiveGame(
  platform: string,
  puuid: string,
): Promise<CurrentGameInfoDto | null> {
  const url = `https://${platform}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${puuid}`;
  const response = await fetch(url, { headers: { "X-Riot-Token": requireApiKey() } });

  if (response.status === 404) {
    return null;
  }
  if (response.status === 429) {
    throw new RiotApiError("Riot API rate limit reached, try again in a moment.");
  }
  if (!response.ok) {
    throw new RiotApiError(`Riot API error: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as CurrentGameInfoDto;
}

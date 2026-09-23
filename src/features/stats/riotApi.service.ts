import { config } from "../../shared/config/env";
import { createLogger } from "../../shared/logger/logger";
import type { LeagueEntryDto, MatchDto, RegionalRouting, RiotAccountDto } from "./lol.types";

const logger = createLogger("riot-api");

export class RiotApiError extends Error {}

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
    throw new RiotApiError(notFoundMessage);
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

export type RegionalRouting = "europe" | "americas" | "asia";

export interface RegionOption {
  label: string;
  platform: string;
  regional: RegionalRouting;
}

// Kept to the regions relevant to this bot's players. To add another, look up its
// platform routing value's regional cluster in Riot's API docs and append it here.
export const LOL_REGIONS: RegionOption[] = [
  { label: "EU West", platform: "euw1", regional: "europe" },
  { label: "EU Nordic & East", platform: "eun1", regional: "europe" },
  { label: "North America", platform: "na1", regional: "americas" },
  { label: "Korea", platform: "kr", regional: "asia" },
  { label: "Brazil", platform: "br1", regional: "americas" },
];

export function findRegion(platform: string): RegionOption | undefined {
  return LOL_REGIONS.find((region) => region.platform === platform);
}

export interface RiotAccountDto {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface LeagueEntryDto {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

export interface RunePerkSelectionDto {
  perk: number;
}

export interface RunePerkStyleDto {
  description: string; // "primaryStyle" | "subStyle"
  style: number;
  selections: RunePerkSelectionDto[];
}

export interface MatchParticipantDto {
  puuid: string;
  riotIdGameName: string;
  riotIdTagline: string;
  teamId: number;
  championName: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  totalDamageDealtToChampions: number;
  champLevel: number;
  summoner1Id: number;
  summoner2Id: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  perks: {
    styles: RunePerkStyleDto[];
  };
  challenges?: {
    killParticipation?: number;
  };
}

export interface MatchDto {
  metadata: {
    matchId: string;
  };
  info: {
    gameCreation: number;
    gameEndTimestamp?: number;
    gameDuration: number;
    gameMode: string;
    queueId: number;
    participants: MatchParticipantDto[];
  };
}

export interface CurrentGameParticipantDto {
  puuid: string;
  championId: number;
  teamId: number;
}

export interface CurrentGameInfoDto {
  gameId: number;
  gameLength: number;
  gameQueueConfigId: number;
  participants: CurrentGameParticipantDto[];
}

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

// Match ids are "<PLATFORM>_<gameId>" (e.g. "EUW1_7123456789"), so the routing needed to
// fetch one can be recovered from the id alone — lets button handlers stay stateless.
export function regionalForMatchId(matchId: string): RegionalRouting | undefined {
  const platform = matchId.split("_")[0]?.toLowerCase();
  return platform ? findRegion(platform)?.regional : undefined;
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
  participantId: number;
  puuid: string;
  riotIdGameName: string;
  riotIdTagline: string;
  teamId: number;
  championId: number;
  championName: string;
  win: boolean;
  gameEndedInEarlySurrender?: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  goldEarned: number;
  visionScore: number;
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

export interface TeamObjectiveDto {
  first: boolean;
  kills: number;
}

export interface MatchTeamDto {
  teamId: number;
  win: boolean;
  objectives: Partial<
    Record<
      "baron" | "champion" | "dragon" | "horde" | "inhibitor" | "riftHerald" | "tower" | "atakhan",
      TeamObjectiveDto
    >
  >;
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
    teams: MatchTeamDto[];
  };
}

export interface TimelineParticipantFrameDto {
  totalGold: number;
}

// Only the event fields this bot reads; Riot sends many more event types (wards, item
// purchases, skill level-ups...) which are simply ignored.
export interface TimelineEventDto {
  type: string;
  timestamp: number;
  killerId?: number;
  victimId?: number;
  killerTeamId?: number;
  teamId?: number;
  monsterType?: string;
  monsterSubType?: string;
  buildingType?: string;
  killType?: string;
  multiKillLength?: number;
}

export interface TimelineFrameDto {
  timestamp: number;
  participantFrames: Record<string, TimelineParticipantFrameDto>;
  events: TimelineEventDto[];
}

export interface MatchTimelineDto {
  info: {
    frames: TimelineFrameDto[];
  };
}

export interface CurrentGameParticipantDto {
  puuid: string;
  riotId?: string;
  championId: number;
  teamId: number;
}

export interface CurrentGameInfoDto {
  gameId: number;
  platformId: string;
  gameLength: number;
  gameQueueConfigId: number;
  participants: CurrentGameParticipantDto[];
}

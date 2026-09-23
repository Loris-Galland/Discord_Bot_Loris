import type { LeagueEntryDto } from "./lol.types";
import { getRankEmoji } from "./lolRankEmoji";

const TIER_ORDER = [
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
];
const DIVISION_VALUE: Record<string, number> = { I: 3, II: 2, III: 1, IV: 0 };
const APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);
const POINTS_PER_TIER = 400;
const POINTS_PER_DIVISION = 100;

// Riot resets LP to 0 at every division/tier change, so a raw LP diff breaks across a
// promotion or demotion. Converting to one monotonically increasing score fixes that: LP
// deltas computed on this scale stay correct across tier/division boundaries.
export function computeRankPoints(entry: LeagueEntryDto): number {
  const tierIndex = Math.max(TIER_ORDER.indexOf(entry.tier), 0);
  const base = tierIndex * POINTS_PER_TIER;

  if (APEX_TIERS.has(entry.tier)) {
    return base + entry.leaguePoints;
  }

  const division = DIVISION_VALUE[entry.rank] ?? 0;
  return base + division * POINTS_PER_DIVISION + entry.leaguePoints;
}

export const RANKED_QUEUE_TYPE_BY_ID: Record<number, string> = {
  420: "RANKED_SOLO_5x5",
  440: "RANKED_FLEX_SR",
};

export const QUEUE_LABELS: Record<string, string> = {
  RANKED_SOLO_5x5: "Solo/Duo",
  RANKED_FLEX_SR: "Flex",
};

// Riot's numeric queue ids (from match-v5/spectator-v5), for queues worth labeling in the
// live panel. Anything else falls back to a generic label rather than growing this list
// to cover every rotating/event queue id.
export const QUEUE_ID_LABELS: Record<number, string> = {
  420: "Solo/Duo",
  440: "Flex",
  400: "Normale (Draft)",
  430: "Normale (Aveugle)",
  450: "ARAM",
  900: "URF",
  1700: "Arena",
};

// Apex tiers (Master+) have no meaningful division, so the API's "rank" field for them
// is a meaningless placeholder — drop it rather than show something like "Challenger IV".
export function formatRank(entry: LeagueEntryDto): string {
  const tier = entry.tier.charAt(0) + entry.tier.slice(1).toLowerCase();
  const division = APEX_TIERS.has(entry.tier) ? "" : ` ${entry.rank}`;
  const emoji = getRankEmoji(entry.tier);
  const prefix = emoji ? `${emoji} ` : "";
  return `${prefix}${tier}${division} · ${entry.leaguePoints} LP (${entry.wins}W ${entry.losses}L)`;
}

import { loadImage, type Image } from "@napi-rs/canvas";
import { createLogger } from "../../shared/logger/logger";
import { getChampionIconUrl, getItemIconUrl, getRuneIconUrl, getSummonerSpellIconUrl } from "./dataDragon.service";
import type { MatchParticipantDto } from "./lol.types";

const logger = createLogger("lol-participant-icons");

export async function loadIconSafe(url: string | null | undefined): Promise<Image | null> {
  if (!url) {
    return null;
  }
  try {
    return await loadImage(url);
  } catch (error) {
    logger.warn(`Failed to load icon ${url}: ${(error as Error).message}`);
    return null;
  }
}

export function findRuneSelection(participant: MatchParticipantDto, description: string): number | undefined {
  const style = participant.perks.styles.find((candidate) => candidate.description === description);
  return style?.selections[0]?.perk;
}

export interface ParticipantIcons {
  champion: Image | null;
  spell1: Image | null;
  spell2: Image | null;
  keystone: Image | null;
  secondary: Image | null;
  items: (Image | null)[]; // item0..item6, length 7
}

// Gathers every icon needed to visually represent one participant (champion, summoner
// spells, keystone + secondary rune tree, full item build including trinket) — shared by
// the loadout image, the full scoreboard image, and the match history image, so a
// participant only needs to be "resolved" into icons once per renderer.
export async function loadParticipantIcons(participant: MatchParticipantDto): Promise<ParticipantIcons> {
  const keystoneId = findRuneSelection(participant, "primaryStyle");
  const secondaryStyle = participant.perks.styles.find((candidate) => candidate.description === "subStyle");

  const urls = await Promise.all([
    getChampionIconUrl(participant.championName),
    getSummonerSpellIconUrl(participant.summoner1Id),
    getSummonerSpellIconUrl(participant.summoner2Id),
    keystoneId ? getRuneIconUrl(keystoneId) : Promise.resolve(null),
    secondaryStyle ? getRuneIconUrl(secondaryStyle.style) : Promise.resolve(null),
    getItemIconUrl(participant.item0),
    getItemIconUrl(participant.item1),
    getItemIconUrl(participant.item2),
    getItemIconUrl(participant.item3),
    getItemIconUrl(participant.item4),
    getItemIconUrl(participant.item5),
    getItemIconUrl(participant.item6),
  ]);

  const [champion, spell1, spell2, keystone, secondary, item0, item1, item2, item3, item4, item5, item6] =
    await Promise.all(urls.map(loadIconSafe));

  return {
    champion: champion ?? null,
    spell1: spell1 ?? null,
    spell2: spell2 ?? null,
    keystone: keystone ?? null,
    secondary: secondary ?? null,
    items: [item0, item1, item2, item3, item4, item5, item6].map((item) => item ?? null),
  };
}

import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { Client } from "discord.js";
import { createLogger } from "../../shared/logger/logger";
import {
  getAllChampionIds,
  getAllSummonerSpellIds,
  getChampionIconUrlById,
  getItemIconUrl,
  getRuneIconUrl,
  getSummonerSpellIconUrl,
} from "./dataDragon.service";
import type { MatchParticipantDto } from "./lol.types";

const logger = createLogger("lol-game-emoji");

// How long a message builder waits for a not-yet-uploaded icon before shipping the text
// without it. The upload keeps going in the background, so the next message has it.
const UPLOAD_WAIT_MS = 8000;
// Discord rejects emoji files above 256 KiB.
const MAX_EMOJI_BYTES = 256 * 1024;
const DOWNSCALED_SIZE = 128;

interface GameEmoji {
  id: string;
  name: string;
}

let client: Client | null = null;
const emojisByName = new Map<string, GameEmoji>();
const pendingUploads = new Map<string, Promise<GameEmoji | null>>();
// Uploads wait until the existing emojis are loaded, otherwise an early message could try
// to re-create an emoji that already exists (names are unique per application).
let markExistingLoaded: () => void = () => {};
const existingLoaded = new Promise<void>((resolve) => {
  markExistingLoaded = resolve;
});

function toMention(emoji: GameEmoji): string {
  return `<:${emoji.name}:${emoji.id}>`;
}

// Short names on purpose ("c266", "i3031"): a scoreboard column packs ~25 emoji mentions
// into one embed field capped at 1024 characters, so every character of the name counts.
async function uploadEmoji(name: string, resolveUrl: () => Promise<string | null>): Promise<GameEmoji | null> {
  await existingLoaded;
  const alreadyThere = emojisByName.get(name);
  if (alreadyThere) {
    return alreadyThere;
  }

  const application = client?.application;
  if (!application) {
    return null;
  }

  const url = await resolveUrl();
  if (!url) {
    return null;
  }

  const response = await fetch(url);
  if (!response.ok) {
    logger.warn(`Could not fetch icon for emoji ${name}: ${response.status} ${response.statusText}`);
    return null;
  }
  let buffer: Buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_EMOJI_BYTES) {
    // A few rune icons are large, detailed PNGs: shrinking them loses nothing at emoji size.
    const image = await loadImage(buffer);
    const canvas = createCanvas(DOWNSCALED_SIZE, DOWNSCALED_SIZE);
    canvas.getContext("2d").drawImage(image, 0, 0, DOWNSCALED_SIZE, DOWNSCALED_SIZE);
    buffer = canvas.toBuffer("image/png");
  }

  const created = await application.emojis.create({ name, attachment: buffer });
  const emoji = { id: created.id, name };
  emojisByName.set(name, emoji);
  return emoji;
}

function ensureEmoji(name: string, resolveUrl: () => Promise<string | null>): Promise<GameEmoji | null> {
  const existing = emojisByName.get(name);
  if (existing) {
    return Promise.resolve(existing);
  }

  let pending = pendingUploads.get(name);
  if (!pending) {
    pending = uploadEmoji(name, resolveUrl)
      .catch((error: Error) => {
        logger.warn(`Failed to upload emoji ${name}: ${error.message}`);
        return null;
      })
      .finally(() => pendingUploads.delete(name));
    pendingUploads.set(name, pending);
  }
  return pending;
}

async function mentionFor(name: string, resolveUrl: () => Promise<string | null>): Promise<string> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), UPLOAD_WAIT_MS));
  const emoji = await Promise.race([ensureEmoji(name, resolveUrl), timeout]);
  return emoji ? toMention(emoji) : "";
}

export function championEmoji(championId: number): Promise<string> {
  return mentionFor(`c${championId}`, () => getChampionIconUrlById(championId));
}

export function summonerSpellEmoji(spellId: number): Promise<string> {
  return mentionFor(`s${spellId}`, () => getSummonerSpellIconUrl(spellId));
}

// Works for both individual runes (keystones) and rune trees (secondary style).
export function runeEmoji(runeOrStyleId: number | undefined): Promise<string> {
  if (!runeOrStyleId) {
    return Promise.resolve("");
  }
  return mentionFor(`r${runeOrStyleId}`, () => getRuneIconUrl(runeOrStyleId));
}

export function itemEmoji(itemId: number): Promise<string> {
  if (!itemId) {
    return Promise.resolve("");
  }
  return mentionFor(`i${itemId}`, () => getItemIconUrl(itemId));
}

// Select-menu options take an emoji object rather than a mention string.
export function parseEmojiMention(mention: string): { id: string; name: string } | undefined {
  const match = /^<:(\w+):(\d+)>$/.exec(mention);
  return match?.[1] && match[2] ? { name: match[1], id: match[2] } : undefined;
}

export interface ParticipantEmojis {
  champion: string;
  spells: string; // both summoner spells
  runes: string; // keystone + secondary tree
  items: string; // item0..item5 + trinket
}

export async function getParticipantEmojis(participant: MatchParticipantDto): Promise<ParticipantEmojis> {
  const primary = participant.perks.styles.find((style) => style.description === "primaryStyle");
  const secondary = participant.perks.styles.find((style) => style.description === "subStyle");
  const itemIds = [
    participant.item0,
    participant.item1,
    participant.item2,
    participant.item3,
    participant.item4,
    participant.item5,
    participant.item6,
  ];

  const [champion, spell1, spell2, keystone, secondaryTree, ...items] = await Promise.all([
    championEmoji(participant.championId),
    summonerSpellEmoji(participant.summoner1Id),
    summonerSpellEmoji(participant.summoner2Id),
    runeEmoji(primary?.selections[0]?.perk),
    runeEmoji(secondary?.style),
    ...itemIds.map(itemEmoji),
  ]);

  return {
    champion: champion ?? "",
    spells: `${spell1 ?? ""}${spell2 ?? ""}`,
    runes: `${keystone ?? ""}${secondaryTree ?? ""}`,
    items: items.join(""),
  };
}

// Loads the bot's existing application emojis, then uploads every champion and summoner
// spell icon that's still missing, one at a time in the background. Runes and items are
// uploaded lazily the first time a message needs them (there are far more of them and
// most never show up). Best-effort: anything that fails is simply shown without an icon.
export async function initGameEmojis(readyClient: Client): Promise<void> {
  client = readyClient;
  const application = readyClient.application;
  if (!application) {
    logger.warn("Client application not ready, skipping game emoji setup.");
    return;
  }

  try {
    const existing = await application.emojis.fetch();
    for (const emoji of existing.values()) {
      if (emoji.name) {
        emojisByName.set(emoji.name, { id: emoji.id, name: emoji.name });
      }
    }
  } finally {
    markExistingLoaded();
  }

  const [championIds, spellIds] = await Promise.all([getAllChampionIds(), getAllSummonerSpellIds()]);
  const wanted: [string, () => Promise<string | null>][] = [
    ...championIds.map((id): [string, () => Promise<string | null>] => [
      `c${id}`,
      () => getChampionIconUrlById(id),
    ]),
    ...spellIds.map((id): [string, () => Promise<string | null>] => [
      `s${id}`,
      () => getSummonerSpellIconUrl(id),
    ]),
  ];
  const missing = wanted.filter(([name]) => !emojisByName.has(name));
  if (missing.length === 0) {
    return;
  }

  logger.info(`Uploading ${missing.length} champion/summoner spell emojis in the background...`);
  for (const [name, resolveUrl] of missing) {
    await ensureEmoji(name, resolveUrl);
  }
  logger.info("Champion/summoner spell emojis ready.");
}

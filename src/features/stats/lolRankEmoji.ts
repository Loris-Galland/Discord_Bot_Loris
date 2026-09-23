import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { Client } from "discord.js";
import { createLogger } from "../../shared/logger/logger";

const logger = createLogger("lol-rank-emoji");
const EMOJI_RASTER_SIZE = 128;

const TIERS = [
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

function emojiNameForTier(tier: string): string {
  return `rank_${tier.toLowerCase()}`;
}

// Data Dragon doesn't host ranked tier emblems (only champions/items/spells/runes), so
// this uses Community Dragon, the widely-used community mirror of Riot's game assets.
// The "mini-crests" set (not "ranked-emblem", which is a 2560x1440 splash with decorative
// wings and a tiny crest in the middle — looks distorted/microscopic at icon size) is a
// properly square crest per tier, available as SVG for every tier including Emerald.
export function getRankEmblemUrl(tier: string): string {
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${tier.toLowerCase()}.svg`;
}

const emojiMentionByTier: Record<string, string> = {};

export function getRankEmoji(tier: string): string {
  return emojiMentionByTier[tier] ?? "";
}

// Uploads one Discord "application emoji" per rank tier (bot-wide, usable in every embed
// in every server the bot is in) the first time the bot ever runs. On later startups it
// just re-fetches the existing ones instead of re-uploading. Best-effort: if Community
// Dragon or the upload fails, rank text is shown without an icon rather than blocking startup.
export async function initRankEmojis(client: Client): Promise<void> {
  const application = client.application;
  if (!application) {
    logger.warn("Client application not ready, skipping rank emoji setup.");
    return;
  }

  try {
    const existing = await application.emojis.fetch();
    for (const tier of TIERS) {
      const found = existing.find((emoji) => emoji.name === emojiNameForTier(tier));
      if (found) {
        emojiMentionByTier[tier] = `<:${found.name}:${found.id}>`;
      }
    }
  } catch (error) {
    logger.error("Failed to fetch existing rank emojis.", error);
    return;
  }

  const missingTiers = TIERS.filter((tier) => !emojiMentionByTier[tier]);
  for (const tier of missingTiers) {
    try {
      const response = await fetch(getRankEmblemUrl(tier));
      if (!response.ok) {
        logger.warn(
          `Could not fetch rank emblem for ${tier}: ${response.status} ${response.statusText}`,
        );
        continue;
      }
      // Discord emoji uploads must be raster (PNG/JPEG/GIF), so the source SVG is rendered
      // onto a canvas first — this stays crisp since SVG is vector, unlike scaling a raster.
      const svgBuffer = Buffer.from(await response.arrayBuffer());
      const image = await loadImage(svgBuffer);
      const canvas = createCanvas(EMOJI_RASTER_SIZE, EMOJI_RASTER_SIZE);
      canvas.getContext("2d").drawImage(image, 0, 0, EMOJI_RASTER_SIZE, EMOJI_RASTER_SIZE);
      const pngBuffer = canvas.toBuffer("image/png");

      const created = await application.emojis.create({
        name: emojiNameForTier(tier),
        attachment: pngBuffer,
      });
      emojiMentionByTier[tier] = `<:${created.name}:${created.id}>`;
      logger.info(`Uploaded rank emoji for ${tier}.`);
    } catch (error) {
      logger.warn(`Failed to upload rank emoji for ${tier}: ${(error as Error).message}`);
    }
  }
}

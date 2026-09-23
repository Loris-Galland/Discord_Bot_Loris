import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { createLogger } from "../../shared/logger/logger";
import { getItemIconUrl, getRuneIconUrl, getSummonerSpellIconUrl } from "./dataDragon.service";
import type { MatchParticipantDto } from "./lol.types";

const logger = createLogger("lol-loadout-image");

const ICON_SIZE = 32;
const ROW_GAP = 2;
const COL_GAP = 2;
const BLOCK_GAP = 14;
const BACKGROUND_COLOR = "#2b2d31"; // Discord's dark embed background, so empty slots blend in
const EMPTY_SLOT_COLOR = "#1e1f22";
const DIVIDER_COLOR = "#4e5058";

async function loadIconSafe(url: string | null): Promise<Image | null> {
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

function findRuneSelection(
  participant: MatchParticipantDto,
  description: string,
): number | undefined {
  const style = participant.perks.styles.find((candidate) => candidate.description === description);
  return style?.selections[0]?.perk;
}

function drawIcon(ctx: SKRSContext2D, image: Image | null | undefined, x: number, y: number): void {
  if (image) {
    ctx.drawImage(image, x, y, ICON_SIZE, ICON_SIZE);
  } else {
    ctx.strokeStyle = EMPTY_SLOT_COLOR;
    ctx.strokeRect(x + 0.5, y + 0.5, ICON_SIZE - 1, ICON_SIZE - 1);
  }
}

function drawDivider(ctx: SKRSContext2D, x: number, height: number): void {
  ctx.strokeStyle = DIVIDER_COLOR;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
}

// Builds a single loadout image, grouped into three visually separated blocks (summoner
// spells + runes, items, trinket) the way most LoL stat sites lay it out — a Discord
// embed can only carry one image, so this is the only way to show icons for everything.
// The rank is shown separately as an inline emoji next to the rank text, not here.
export async function buildLoadoutImage(participant: MatchParticipantDto): Promise<Buffer> {
  const keystoneId = findRuneSelection(participant, "primaryStyle");
  const secondaryStyle = participant.perks.styles.find(
    (candidate) => candidate.description === "subStyle",
  );

  const [spell1Url, spell2Url, keystoneUrl, secondaryUrl, ...itemUrls] = await Promise.all([
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

  const [spell1, spell2, keystone, secondary, item0, item1, item2, item3, item4, item5, trinket] =
    await Promise.all(
      [spell1Url, spell2Url, keystoneUrl, secondaryUrl, ...itemUrls].map(loadIconSafe),
    );

  const blockAWidth = 2 * ICON_SIZE + COL_GAP;
  const blockBWidth = 3 * ICON_SIZE + 2 * COL_GAP;
  const trinketWidth = ICON_SIZE;
  const height = 2 * ICON_SIZE + ROW_GAP;
  const width = blockAWidth + BLOCK_GAP + blockBWidth + BLOCK_GAP + trinketWidth;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, width, height);

  // Block A: summoner spells on top, runes (keystone + secondary tree) below.
  drawIcon(ctx, spell1, 0, 0);
  drawIcon(ctx, spell2, ICON_SIZE + COL_GAP, 0);
  drawIcon(ctx, keystone, 0, ICON_SIZE + ROW_GAP);
  drawIcon(ctx, secondary, ICON_SIZE + COL_GAP, ICON_SIZE + ROW_GAP);

  const blockBX = blockAWidth + BLOCK_GAP;
  drawDivider(ctx, blockAWidth + BLOCK_GAP / 2, height);

  // Block B: the 6 build items, 3 columns x 2 rows.
  [item0, item1, item2, item3, item4, item5].forEach((image, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    drawIcon(ctx, image, blockBX + col * (ICON_SIZE + COL_GAP), row * (ICON_SIZE + ROW_GAP));
  });

  const trinketX = blockBX + blockBWidth + BLOCK_GAP;
  drawDivider(ctx, blockBX + blockBWidth + BLOCK_GAP / 2, height);

  // Trinket, set apart and vertically centered.
  drawIcon(ctx, trinket, trinketX, (height - ICON_SIZE) / 2);

  return canvas.toBuffer("image/png");
}

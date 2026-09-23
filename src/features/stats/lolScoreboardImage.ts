import { createCanvas, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import type { MatchDto, MatchParticipantDto } from "./lol.types";
import { loadParticipantIcons, type ParticipantIcons } from "./lolParticipantIcons";

const CHAMPION_SIZE = 40;
const SMALL_ICON = 16;
const ITEM_SIZE = 20;
const ROW_HEIGHT = 54;
const TEAM_HEADER_HEIGHT = 30;
const COLUMN_WIDTH = 460;
const COLUMN_GAP = 16;
const PADDING = 10;

const BACKGROUND = "#1e1f22";
const ROW_ALT_BACKGROUND = "#26282c";
const TRACKED_HIGHLIGHT = "rgba(88, 101, 242, 0.25)";
const WIN_COLOR = "#3ba55d";
const LOSE_COLOR = "#ed4245";
const TEXT_COLOR = "#f2f3f5";
const TRACKED_TEXT_COLOR = "#f5c542";
const SUBTEXT_COLOR = "#b5bac1";
const EMPTY_SLOT_COLOR = "#3a3c42";

const BLUE_TEAM_ID = 100;

function drawIcon(ctx: SKRSContext2D, image: Image | null | undefined, x: number, y: number, size: number): void {
  if (image) {
    ctx.drawImage(image, x, y, size, size);
  } else {
    ctx.strokeStyle = EMPTY_SLOT_COLOR;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  }
}

function drawTeamHeader(ctx: SKRSContext2D, x: number, y: number, label: string, won: boolean): void {
  ctx.font = "bold 14px sans-serif";
  ctx.fillStyle = won ? WIN_COLOR : LOSE_COLOR;
  ctx.fillText(`${label} — ${won ? "Victoire" : "Défaite"}`, x, y);
}

function drawRow(
  ctx: SKRSContext2D,
  columnX: number,
  rowY: number,
  participant: MatchParticipantDto,
  icons: ParticipantIcons,
  trackedPuuid: string,
  rowIndex: number,
): void {
  if (rowIndex % 2 === 1) {
    ctx.fillStyle = ROW_ALT_BACKGROUND;
    ctx.fillRect(columnX, rowY, COLUMN_WIDTH, ROW_HEIGHT);
  }

  const isTracked = participant.puuid === trackedPuuid;
  if (isTracked) {
    ctx.fillStyle = TRACKED_HIGHLIGHT;
    ctx.fillRect(columnX, rowY, COLUMN_WIDTH, ROW_HEIGHT);
  }

  const centerY = rowY + ROW_HEIGHT / 2;
  let x = columnX + PADDING;

  drawIcon(ctx, icons.champion, x, rowY + (ROW_HEIGHT - CHAMPION_SIZE) / 2, CHAMPION_SIZE);
  x += CHAMPION_SIZE + 6;

  drawIcon(ctx, icons.spell1, x, centerY - SMALL_ICON - 1, SMALL_ICON);
  drawIcon(ctx, icons.spell2, x, centerY + 1, SMALL_ICON);
  x += SMALL_ICON + 4;

  drawIcon(ctx, icons.keystone, x, centerY - SMALL_ICON - 1, SMALL_ICON);
  drawIcon(ctx, icons.secondary, x, centerY + 1, SMALL_ICON);
  x += SMALL_ICON + 10;

  const cs = participant.totalMinionsKilled + participant.neutralMinionsKilled;
  const damageK = (participant.totalDamageDealtToChampions / 1000).toFixed(1);
  const name = participant.riotIdGameName.length > 14 ? `${participant.riotIdGameName.slice(0, 13)}…` : participant.riotIdGameName;

  ctx.fillStyle = isTracked ? TRACKED_TEXT_COLOR : TEXT_COLOR;
  ctx.font = "bold 14px sans-serif";
  ctx.fillText(`${participant.championName} — ${name}`, x, centerY - 4);

  ctx.fillStyle = SUBTEXT_COLOR;
  ctx.font = "12px sans-serif";
  ctx.fillText(
    `${participant.kills}/${participant.deaths}/${participant.assists} · ${cs} CS · ${damageK}k dmg`,
    x,
    centerY + 14,
  );

  const itemsWidth = icons.items.length * ITEM_SIZE + (icons.items.length - 1) * 2;
  let itemX = columnX + COLUMN_WIDTH - PADDING - itemsWidth;
  const itemY = rowY + (ROW_HEIGHT - ITEM_SIZE) / 2;
  for (const item of icons.items) {
    drawIcon(ctx, item, itemX, itemY, ITEM_SIZE);
    itemX += ITEM_SIZE + 2;
  }
}

// Renders the full 10-player scoreboard (both teams, champion/spells/runes/items/KDA/CS/
// damage for everyone) as a single composite image, since a Discord embed can only carry
// one image and a text-only table isn't readable at a glance.
export async function buildScoreboardImage(match: MatchDto, trackedPuuid: string): Promise<Buffer> {
  const blueTeam = match.info.participants.filter((entry) => entry.teamId === BLUE_TEAM_ID);
  const redTeam = match.info.participants.filter((entry) => entry.teamId !== BLUE_TEAM_ID);
  const blueWon = blueTeam[0]?.win ?? false;

  const iconsByPuuid = new Map<string, ParticipantIcons>();
  await Promise.all(
    match.info.participants.map(async (participant) => {
      iconsByPuuid.set(participant.puuid, await loadParticipantIcons(participant));
    }),
  );

  const rowCount = Math.max(blueTeam.length, redTeam.length);
  const width = COLUMN_WIDTH * 2 + COLUMN_GAP;
  const height = TEAM_HEADER_HEIGHT + rowCount * ROW_HEIGHT;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, width, height);

  const col0X = 0;
  const col1X = COLUMN_WIDTH + COLUMN_GAP;

  drawTeamHeader(ctx, col0X + PADDING, 20, "Équipe Bleue", blueWon);
  drawTeamHeader(ctx, col1X + PADDING, 20, "Équipe Rouge", !blueWon);

  for (let index = 0; index < rowCount; index += 1) {
    const rowY = TEAM_HEADER_HEIGHT + index * ROW_HEIGHT;

    const bluePlayer = blueTeam[index];
    if (bluePlayer) {
      const icons = iconsByPuuid.get(bluePlayer.puuid);
      if (icons) {
        drawRow(ctx, col0X, rowY, bluePlayer, icons, trackedPuuid, index);
      }
    }

    const redPlayer = redTeam[index];
    if (redPlayer) {
      const icons = iconsByPuuid.get(redPlayer.puuid);
      if (icons) {
        drawRow(ctx, col1X, rowY, redPlayer, icons, trackedPuuid, index);
      }
    }
  }

  return canvas.toBuffer("image/png");
}

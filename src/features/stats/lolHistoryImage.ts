import { createCanvas, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import type { MatchParticipantDto } from "./lol.types";
import { loadParticipantIcons } from "./lolParticipantIcons";

const CHAMPION_SIZE = 40;
const SMALL_ICON = 16;
const ITEM_SIZE = 20;
const ROW_HEIGHT = 54;
const WIDTH = 640;
const PADDING = 12;
const RESULT_BAR_WIDTH = 4;

const BACKGROUND = "#1e1f22";
const ROW_ALT_BACKGROUND = "#26282c";
const WIN_COLOR = "#3ba55d";
const LOSE_COLOR = "#ed4245";
const TEXT_COLOR = "#f2f3f5";
const SUBTEXT_COLOR = "#b5bac1";
const EMPTY_SLOT_COLOR = "#3a3c42";

export interface HistoryRow {
  participant: MatchParticipantDto;
  queueLabel: string;
  relativeTime: string;
}

function drawIcon(ctx: SKRSContext2D, image: Image | null | undefined, x: number, y: number, size: number): void {
  if (image) {
    ctx.drawImage(image, x, y, size, size);
  } else {
    ctx.strokeStyle = EMPTY_SLOT_COLOR;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  }
}

// Renders a compact table, one row per match, each with the played champion, summoner
// spells + runes, full item build, KDA, queue and how long ago it was — a Discord embed
// can only carry one image, and a text-only list isn't readable at a glance.
export async function buildHistoryImage(rows: HistoryRow[]): Promise<Buffer> {
  const allIcons = await Promise.all(rows.map((row) => loadParticipantIcons(row.participant)));

  const height = rows.length * ROW_HEIGHT;
  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, WIDTH, height);

  rows.forEach((row, index) => {
    const rowY = index * ROW_HEIGHT;
    const centerY = rowY + ROW_HEIGHT / 2;

    if (index % 2 === 1) {
      ctx.fillStyle = ROW_ALT_BACKGROUND;
      ctx.fillRect(0, rowY, WIDTH, ROW_HEIGHT);
    }

    ctx.fillStyle = row.participant.win ? WIN_COLOR : LOSE_COLOR;
    ctx.fillRect(0, rowY, RESULT_BAR_WIDTH, ROW_HEIGHT);

    const icons = allIcons[index];
    if (!icons) {
      return;
    }

    let x = PADDING + RESULT_BAR_WIDTH;
    drawIcon(ctx, icons.champion, x, rowY + (ROW_HEIGHT - CHAMPION_SIZE) / 2, CHAMPION_SIZE);
    x += CHAMPION_SIZE + 6;

    drawIcon(ctx, icons.spell1, x, centerY - SMALL_ICON - 1, SMALL_ICON);
    drawIcon(ctx, icons.spell2, x, centerY + 1, SMALL_ICON);
    x += SMALL_ICON + 4;

    drawIcon(ctx, icons.keystone, x, centerY - SMALL_ICON - 1, SMALL_ICON);
    drawIcon(ctx, icons.secondary, x, centerY + 1, SMALL_ICON);
    x += SMALL_ICON + 10;

    const cs = row.participant.totalMinionsKilled + row.participant.neutralMinionsKilled;

    ctx.fillStyle = row.participant.win ? WIN_COLOR : LOSE_COLOR;
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(row.participant.championName, x, centerY - 4);

    ctx.fillStyle = TEXT_COLOR;
    ctx.font = "12px sans-serif";
    ctx.fillText(`${row.participant.kills}/${row.participant.deaths}/${row.participant.assists}`, x + 90, centerY - 4);

    ctx.fillStyle = SUBTEXT_COLOR;
    ctx.font = "11px sans-serif";
    ctx.fillText(`${row.queueLabel} · ${cs} CS · ${row.relativeTime}`, x, centerY + 14);

    const itemsWidth = icons.items.length * ITEM_SIZE + (icons.items.length - 1) * 2;
    let itemX = WIDTH - PADDING - itemsWidth;
    const itemY = rowY + (ROW_HEIGHT - ITEM_SIZE) / 2;
    for (const item of icons.items) {
      drawIcon(ctx, item, itemX, itemY, ITEM_SIZE);
      itemX += ITEM_SIZE + 2;
    }
  });

  return canvas.toBuffer("image/png");
}

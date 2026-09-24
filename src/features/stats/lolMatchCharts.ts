import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { createLogger } from "../../shared/logger/logger";
import { getChampionIconUrlById } from "./dataDragon.service";

const logger = createLogger("lol-match-charts");

// Drawn at 2x and let Discord scale it down, so text and lines stay crisp on HiDPI screens.
const SCALE = 2;
// Discord's dark embed background so the chart blends into the embed; team colors were
// checked for colorblind separation and contrast against exactly this surface.
const SURFACE = "#2b2d31";
const INK = "#f2f3f5";
const INK_SECONDARY = "#b5bac1";
const INK_MUTED = "#949ba4";
const GRID = "#3f4147";
const BASELINE = "#6d6f78";
const BLUE = "#3987e5";
const RED = "#e66767";
// Named families first: the canvas doesn't map the generic "sans-serif" on Windows and
// silently falls back to a serif face.
const FONT = `"Segoe UI", Arial, "DejaVu Sans", sans-serif`;

function setupCanvas(width: number, height: number) {
  const canvas = createCanvas(width * SCALE, height * SCALE);
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

function niceStep(maxValue: number): number {
  const steps = [500, 1000, 2000, 2500, 5000, 10000, 20000];
  return steps.find((step) => maxValue / step <= 4) ?? 20000;
}

function formatGold(value: number): string {
  if (value === 0) {
    return "0";
  }
  const sign = value > 0 ? "+" : "−";
  const abs = Math.abs(value);
  return `${sign}${abs >= 1000 ? `${Number((abs / 1000).toFixed(1))}k` : abs}`;
}

function drawLegendSwatch(ctx: SKRSContext2D, x: number, y: number, color: string, label: string): number {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y - 5, 10, 10, 2);
  ctx.fill();
  ctx.fillStyle = INK_SECONDARY;
  ctx.font = `12px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 16, y);
  return x + 16 + ctx.measureText(label).width + 18;
}

// Blue-minus-red team gold per minute: above the zero line blue is ahead, below red is.
// Diverging encoding, so the area takes each team's color on its own side of zero.
export async function renderGoldDiffChart(differences: number[]): Promise<Buffer> {
  const width = 640;
  const height = 300;
  const padding = { top: 36, right: 56, bottom: 34, left: 52 };
  const { canvas, ctx } = setupCanvas(width, height);

  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const lastMinute = Math.max(differences.length - 1, 1);
  const step = niceStep(Math.max(1, ...differences.map(Math.abs)));
  const range = Math.max(step, Math.ceil(Math.max(1, ...differences.map(Math.abs)) / step) * step);

  const xFor = (minute: number) => padding.left + (minute / lastMinute) * plotWidth;
  const yFor = (value: number) => padding.top + ((range - value) / (2 * range)) * plotHeight;
  const zeroY = yFor(0);

  // Recessive grid + y labels.
  ctx.font = `11px ${FONT}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let value = -range; value <= range; value += step) {
    const y = Math.round(yFor(value)) + 0.5;
    ctx.strokeStyle = value === 0 ? BASELINE : GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = INK_MUTED;
    ctx.fillText(formatGold(value), padding.left - 8, y);
  }

  // X labels every 5 minutes.
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let minute = 0; minute <= lastMinute; minute += 5) {
    ctx.fillStyle = INK_MUTED;
    ctx.fillText(`${minute}`, xFor(minute), height - padding.bottom + 8);
  }
  ctx.textAlign = "right";
  ctx.fillText("min", width - padding.right, height - padding.bottom + 8);

  const tracePath = () => {
    ctx.beginPath();
    differences.forEach((value, minute) => {
      if (minute === 0) {
        ctx.moveTo(xFor(minute), yFor(value));
      } else {
        ctx.lineTo(xFor(minute), yFor(value));
      }
    });
  };

  // Each side of zero gets its own clip, so the same path is filled/stroked blue above
  // and red below — the color flips exactly where the lead changes hands.
  const sides: [number, number, string][] = [
    [padding.top, zeroY - padding.top, BLUE],
    [zeroY, height - padding.bottom - zeroY, RED],
  ];
  for (const [clipY, clipHeight, color] of sides) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(padding.left, clipY, plotWidth, clipHeight);
    ctx.clip();

    tracePath();
    ctx.lineTo(xFor(lastMinute), zeroY);
    ctx.lineTo(xFor(0), zeroY);
    ctx.closePath();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;

    tracePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
  }

  // Direct label on the endpoint only — the final gold gap.
  const finalValue = differences[differences.length - 1] ?? 0;
  const endX = xFor(lastMinute);
  const endY = yFor(finalValue);
  ctx.fillStyle = finalValue >= 0 ? BLUE : RED;
  ctx.strokeStyle = SURFACE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(endX, endY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = `bold 12px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(formatGold(finalValue), endX + 8, endY);

  // Legend.
  let legendX = padding.left;
  legendX = drawLegendSwatch(ctx, legendX, 16, BLUE, "Avance bleue");
  drawLegendSwatch(ctx, legendX, 16, RED, "Avance rouge");

  return canvas.toBuffer("image/png");
}

export interface DamageRow {
  championId: number;
  name: string;
  teamId: number;
  damage: number;
  highlighted: boolean;
}

async function loadChampionIcon(championId: number): Promise<Image | null> {
  try {
    const url = await getChampionIconUrlById(championId);
    return url ? await loadImage(url) : null;
  } catch (error) {
    logger.warn(`Failed to load champion icon ${championId}: ${(error as Error).message}`);
    return null;
  }
}

function truncate(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

// Horizontal bars, one per player, blue team on top and red below, all on one shared
// scale so bars compare across teams. Team header text doubles as the legend.
export async function renderDamageChart(rows: DamageRow[]): Promise<Buffer> {
  const width = 640;
  const rowHeight = 28;
  const iconSize = 22;
  const headerHeight = 24;
  const teamGap = 10;
  const padding = { top: 8, right: 56, bottom: 10, left: 12 };
  const nameWidth = 110;

  const teams = [
    { teamId: 100, label: "Équipe bleue", color: BLUE },
    { teamId: 200, label: "Équipe rouge", color: RED },
  ].map((team) => ({ ...team, rows: rows.filter((row) => row.teamId === team.teamId) }));

  const height =
    padding.top +
    padding.bottom +
    teams.reduce((sum, team) => sum + headerHeight + team.rows.length * rowHeight, 0) +
    teamGap;
  const { canvas, ctx } = setupCanvas(width, height);

  const icons = await Promise.all(rows.map((row) => loadChampionIcon(row.championId)));
  const iconByRow = new Map(rows.map((row, index) => [row, icons[index] ?? null]));

  const barX = padding.left + iconSize + 8 + nameWidth + 8;
  const barMaxWidth = width - padding.right - barX;
  const maxDamage = Math.max(1, ...rows.map((row) => row.damage));

  let y = padding.top;
  for (const team of teams) {
    ctx.fillStyle = team.color;
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(team.label, padding.left, y + headerHeight / 2);
    const teamTotal = team.rows.reduce((sum, row) => sum + row.damage, 0);
    ctx.fillStyle = INK_MUTED;
    ctx.font = `11px ${FONT}`;
    ctx.fillText(`${(teamTotal / 1000).toFixed(1)}k au total`, barX + 8, y + headerHeight / 2);
    y += headerHeight;
    const rowsTop = y;

    for (const row of team.rows) {
      const centerY = y + rowHeight / 2;

      const icon = iconByRow.get(row) ?? null;
      if (icon) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(padding.left, centerY - iconSize / 2, iconSize, iconSize, 4);
        ctx.clip();
        ctx.drawImage(icon, padding.left, centerY - iconSize / 2, iconSize, iconSize);
        ctx.restore();
      }

      ctx.font = row.highlighted ? `bold 12px ${FONT}` : `12px ${FONT}`;
      ctx.fillStyle = row.highlighted ? INK : INK_SECONDARY;
      ctx.textAlign = "left";
      ctx.fillText(truncate(ctx, row.name, nameWidth), padding.left + iconSize + 8, centerY);

      // Thin bar, square at the baseline and rounded only at the data end.
      const barWidth = Math.max(2, (row.damage / maxDamage) * barMaxWidth);
      const barHeight = 12;
      ctx.fillStyle = team.color;
      ctx.beginPath();
      ctx.roundRect(barX, centerY - barHeight / 2, barWidth, barHeight, [0, 4, 4, 0]);
      ctx.fill();

      ctx.fillStyle = row.highlighted ? INK : INK_SECONDARY;
      ctx.font = row.highlighted ? `bold 11px ${FONT}` : `11px ${FONT}`;
      ctx.fillText(`${(row.damage / 1000).toFixed(1)}k`, barX + barWidth + 6, centerY);

      y += rowHeight;
    }

    // Baseline the team's bars grow from.
    ctx.strokeStyle = BASELINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(barX) + 0.5, rowsTop);
    ctx.lineTo(Math.round(barX) + 0.5, y);
    ctx.stroke();

    y += teamGap;
  }

  return canvas.toBuffer("image/png");
}

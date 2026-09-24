import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  EmbedBuilder,
  escapeMarkdown,
} from "discord.js";
import type { MatchDto, MatchParticipantDto, MatchTimelineDto, TimelineEventDto } from "./lol.types";
import { renderDamageChart, renderGoldDiffChart } from "./lolMatchCharts";
import { championEmoji, getParticipantEmojis, type ParticipantEmojis } from "./lolGameEmoji";
import { QUEUE_ID_LABELS } from "./lolRank";

export const BLUE_TEAM_ID = 100;
export const RED_TEAM_ID = 200;
const ARENA_QUEUE_ID = 1700;
const NAME_MAX_LENGTH = 11;

export const MATCH_BUTTON_PREFIX = "lolm";
export type MatchView = "scoreboard" | "details" | "gold" | "damage" | "items" | "events";

export interface MatchViewMessage {
  embeds: EmbedBuilder[];
  files?: AttachmentBuilder[];
  components?: ActionRowBuilder<ButtonBuilder>[];
}

const BUTTONS: Record<MatchView, { label: string; emoji: string }> = {
  scoreboard: { label: "Scoreboard", emoji: "📋" },
  details: { label: "Détails", emoji: "➕" },
  gold: { label: "Golds", emoji: "💰" },
  damage: { label: "Dégâts", emoji: "⚔️" },
  items: { label: "Items", emoji: "🛡️" },
  events: { label: "Événements", emoji: "📜" },
};

// Everything a button needs is packed into its custom id (100 chars max): the match id
// gives the region and the match, the participant index says whose game it is. That keeps
// buttons working forever, even on old messages after a bot restart.
export function buildMatchButtons(
  matchId: string,
  trackedIndex: number,
  views: MatchView[],
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const view of views) {
    const { label, emoji } = BUTTONS[view];
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${MATCH_BUTTON_PREFIX}:${view}:${matchId}:${trackedIndex}`)
        .setLabel(label)
        .setEmoji(emoji)
        .setStyle(view === "scoreboard" || view === "details" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );
  }
  return row;
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatThousands(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${value}`;
}

function fullName(participant: MatchParticipantDto): string {
  return escapeMarkdown(participant.riotIdGameName || participant.championName);
}

// Same budget as Zoé: 5 icons + ~10 characters is what fits in a third of an embed.
function shortName(participant: MatchParticipantDto): string {
  const name = participant.riotIdGameName || participant.championName;
  const cut = name.length > NAME_MAX_LENGTH ? `${name.slice(0, NAME_MAX_LENGTH - 1).trimEnd()}…` : name;
  return escapeMarkdown(cut);
}

function kda(participant: MatchParticipantDto): string {
  return `${participant.kills}/${participant.deaths}/${participant.assists}`;
}

function teamOf(match: MatchDto, teamId: number): MatchParticipantDto[] {
  return match.info.participants.filter((participant) => participant.teamId === teamId);
}

function teamWon(match: MatchDto, teamId: number): boolean {
  return match.info.teams.find((team) => team.teamId === teamId)?.win ?? false;
}

function teamHeader(match: MatchDto, teamId: number): string {
  const side = teamId === BLUE_TEAM_ID ? "🔵 Bleue" : "🔴 Rouge";
  return `${side} — ${teamWon(match, teamId) ? "Victoire" : "Défaite"}`;
}

function title(match: MatchDto, tracked: MatchParticipantDto | undefined): string {
  const queue = QUEUE_ID_LABELS[match.info.queueId] ?? "Partie";
  const duration = formatDuration(match.info.gameDuration);
  const outcome = tracked ? ` · ${tracked.win ? "Victoire" : "Défaite"}` : "";
  return `${queue} · ${duration}${outcome}`;
}

function baseEmbed(match: MatchDto, tracked: MatchParticipantDto | undefined): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(tracked ? (tracked.win ? Colors.Green : Colors.Red) : Colors.Blurple)
    .setTitle(title(match, tracked))
    .setTimestamp(match.info.gameEndTimestamp ?? match.info.gameCreation);
  if (tracked) {
    embed.setAuthor({ name: `${tracked.riotIdGameName}#${tracked.riotIdTagline}` });
  }
  return embed;
}

async function emojisFor(participants: MatchParticipantDto[]): Promise<ParticipantEmojis[]> {
  return Promise.all(participants.map(getParticipantEmojis));
}

function championOrName(emojis: ParticipantEmojis, participant: MatchParticipantDto): string {
  return emojis.champion || participant.championName;
}

function objectivesLine(match: MatchDto, teamId: number): string {
  const team = match.info.teams.find((candidate) => candidate.teamId === teamId);
  const gold = teamOf(match, teamId).reduce((sum, participant) => sum + participant.goldEarned, 0);
  const objectives = team?.objectives ?? {};
  const side = teamId === BLUE_TEAM_ID ? "🔵" : "🔴";
  return (
    `${side} **${objectives.champion?.kills ?? 0}** kills · ${formatThousands(gold)} or · ` +
    `🗼 ${objectives.tower?.kills ?? 0} · 🐉 ${objectives.dragon?.kills ?? 0} · ` +
    `🪲 ${objectives.horde?.kills ?? 0} · 🟣 ${objectives.baron?.kills ?? 0}`
  );
}

export async function buildScoreboardView(match: MatchDto, trackedIndex: number): Promise<MatchViewMessage> {
  const tracked = match.info.participants[trackedIndex];
  const embed = baseEmbed(match, tracked);

  if (match.info.queueId === ARENA_QUEUE_ID) {
    embed.setDescription("Le scoreboard n'est pas disponible pour l'Arena.");
    return { embeds: [embed] };
  }

  // Zoé-style: three inline columns (blue | scores | red), one row per lane. Bots can't
  // widen an embed, so names are cut short to keep every row on one line — a wrapped row
  // would shift all the rows below it out of line with the score column. Icons come
  // first on both sides so they stack in straight columns whatever the name length.
  const blue = teamOf(match, BLUE_TEAM_ID);
  const red = teamOf(match, RED_TEAM_ID);
  const [blueEmojis, redEmojis] = await Promise.all([emojisFor(blue), emojisFor(red)]);
  const isTracked = (participant: MatchParticipantDto | undefined) =>
    participant !== undefined && participant.puuid === tracked?.puuid;
  const playerLine = (participant: MatchParticipantDto | undefined, emoji: ParticipantEmojis | undefined) => {
    if (!participant || !emoji) {
      return "​";
    }
    const name = shortName(participant);
    return `${championOrName(emoji, participant)}${emoji.spells}${emoji.runes} ${isTracked(participant) ? `**${name}**` : name}`;
  };
  const scoreOf = (participant: MatchParticipantDto | undefined) =>
    !participant ? "-" : isTracked(participant) ? `**${kda(participant)}**` : kda(participant);

  const rows = Math.max(blue.length, red.length);
  const blueLines: string[] = [];
  const scoreLines: string[] = [];
  const redLines: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    blueLines.push(playerLine(blue[row], blueEmojis[row]));
    redLines.push(playerLine(red[row], redEmojis[row]));
    scoreLines.push(`${scoreOf(blue[row])} | ${scoreOf(red[row])}`);
  }

  embed.addFields(
    { name: teamHeader(match, BLUE_TEAM_ID), value: blueLines.join("\n"), inline: true },
    { name: "Score", value: scoreLines.join("\n"), inline: true },
    { name: teamHeader(match, RED_TEAM_ID), value: redLines.join("\n"), inline: true },
  );

  return { embeds: [embed] };
}

export async function buildDetailsView(match: MatchDto, trackedIndex: number): Promise<MatchViewMessage> {
  const tracked = match.info.participants[trackedIndex];
  const embed = baseEmbed(match, tracked);
  const minutes = Math.max(match.info.gameDuration / 60, 1);

  // Moved here from the scoreboard, which now only carries the Zoé-style columns.
  embed.addFields({
    name: "Objectifs",
    value: `${objectivesLine(match, BLUE_TEAM_ID)}\n${objectivesLine(match, RED_TEAM_ID)}`,
  });

  for (const teamId of [BLUE_TEAM_ID, RED_TEAM_ID]) {
    const players = teamOf(match, teamId);
    const emojis = await emojisFor(players);
    const lines = players.map((participant, index) => {
      const cs = participant.totalMinionsKilled + participant.neutralMinionsKilled;
      const kp = participant.challenges?.killParticipation;
      const name = fullName(participant);
      const emoji = emojis[index];
      return (
        `${emoji ? championOrName(emoji, participant) : ""} ` +
        `${participant.puuid === tracked?.puuid ? `**${name}**` : name} · ` +
        `niv. ${participant.champLevel} · ${kda(participant)}${kp !== undefined ? ` (${Math.round(kp * 100)}% KP)` : ""}\n` +
        ` ⚔️ ${formatThousands(participant.totalDamageDealtToChampions)} · ` +
        `🛡️ ${formatThousands(participant.totalDamageTaken)} · ` +
        `💰 ${formatThousands(participant.goldEarned)} · ` +
        `🌾 ${cs} (${(cs / minutes).toFixed(1)}/min) · 👁️ ${participant.visionScore}`
      );
    });
    if (lines.length > 0) {
      embed.addFields({ name: teamHeader(match, teamId), value: lines.join("\n") });
    }
  }

  embed.setFooter({ text: "⚔️ dégâts infligés · 🛡️ dégâts subis · 💰 or · 🌾 CS · 👁️ vision" });
  return { embeds: [embed] };
}

export async function buildItemsView(match: MatchDto, trackedIndex: number): Promise<MatchViewMessage> {
  const tracked = match.info.participants[trackedIndex];
  const embed = baseEmbed(match, tracked);

  // The description (4096 chars) rather than fields (1024): 8 icons per player x 10
  // players doesn't fit in a field.
  const sections: string[] = [];
  for (const teamId of [BLUE_TEAM_ID, RED_TEAM_ID]) {
    const players = teamOf(match, teamId);
    const emojis = await emojisFor(players);
    const lines = players.map((participant, index) => {
      const emoji = emojis[index];
      const name = fullName(participant);
      return `${emoji ? championOrName(emoji, participant) : ""} ${emoji?.items ?? ""} ${
        participant.puuid === tracked?.puuid ? `**${name}**` : name
      }`;
    });
    sections.push(`**${teamHeader(match, teamId)}**\n${lines.join("\n")}`);
  }

  embed.setDescription(sections.join("\n\n"));
  return { embeds: [embed] };
}

const DRAGON_LABELS: Record<string, string> = {
  FIRE_DRAGON: "Dragon infernal",
  WATER_DRAGON: "Dragon de l'océan",
  EARTH_DRAGON: "Dragon de la montagne",
  AIR_DRAGON: "Dragon des nuages",
  HEXTECH_DRAGON: "Dragon hextech",
  CHEMTECH_DRAGON: "Dragon chemtech",
  ELDER_DRAGON: "Dragon ancestral",
};

const MULTI_KILL_LABELS: Record<number, string> = {
  3: "Triple kill",
  4: "Quadra kill",
  5: "PENTAKILL",
};

interface EventLine {
  timestamp: number;
  // Consecutive events with the same key (e.g. two towers in one push, a pack of void
  // grubs) are merged into one "×N" line so the list stays readable.
  key: string;
  text: string;
  count: number;
}

// Sums every player's gold per team at each one-minute timeline frame.
export function goldDifferenceByMinute(match: MatchDto, timeline: MatchTimelineDto): number[] {
  const teamByParticipantId = new Map(
    match.info.participants.map((participant) => [participant.participantId, participant.teamId]),
  );
  return timeline.info.frames.map((frame) => {
    let difference = 0;
    for (const [participantId, participantFrame] of Object.entries(frame.participantFrames)) {
      const teamId = teamByParticipantId.get(Number(participantId));
      difference += teamId === BLUE_TEAM_ID ? participantFrame.totalGold : -participantFrame.totalGold;
    }
    return difference;
  });
}

async function describeEvent(
  event: TimelineEventDto,
  championById: Map<number, string>,
  teamByParticipantId: Map<number, number>,
): Promise<Omit<EventLine, "timestamp" | "count"> | null> {
  const sideDot = (teamId: number | undefined) => (teamId === BLUE_TEAM_ID ? "🔵" : "🔴");
  const champion = (participantId: number | undefined) =>
    (participantId !== undefined && championById.get(participantId)) || "❔";

  switch (event.type) {
    case "CHAMPION_SPECIAL_KILL": {
      const team = sideDot(teamByParticipantId.get(event.killerId ?? 0));
      if (event.killType === "KILL_FIRST_BLOOD") {
        return { key: "", text: `${team} 🩸 First blood — ${champion(event.killerId)}` };
      }
      const label = MULTI_KILL_LABELS[event.multiKillLength ?? 0];
      if (event.killType === "KILL_MULTI" && label) {
        return { key: `multi:${event.killerId}`, text: `${team} 💥 **${label}** — ${champion(event.killerId)}` };
      }
      return null;
    }
    case "ELITE_MONSTER_KILL": {
      const team = sideDot(event.killerTeamId);
      switch (event.monsterType) {
        case "DRAGON":
          return { key: "", text: `${team} 🐉 ${DRAGON_LABELS[event.monsterSubType ?? ""] ?? "Dragon"}` };
        case "BARON_NASHOR":
          return { key: "", text: `${team} 🟣 **Baron Nashor**` };
        case "RIFTHERALD":
          return { key: "", text: `${team} 👁️ Héraut de la Faille` };
        case "HORDE":
          return { key: `horde:${event.killerTeamId}`, text: `${team} 🪲 Larve du Néant` };
        case "ATAKHAN":
          return { key: "", text: `${team} 🦇 **Atakhan**` };
        default:
          return null;
      }
    }
    case "BUILDING_KILL": {
      // teamId is the team that *owned* the building, so the credit goes to the other side.
      const team = sideDot(event.teamId === BLUE_TEAM_ID ? RED_TEAM_ID : BLUE_TEAM_ID);
      if (event.buildingType === "TOWER_BUILDING") {
        return { key: `tower:${event.teamId}`, text: `${team} 🗼 Tour détruite` };
      }
      if (event.buildingType === "INHIBITOR_BUILDING") {
        return { key: `inhib:${event.teamId}`, text: `${team} 🏚️ Inhibiteur détruit` };
      }
      return null;
    }
    default:
      return null;
  }
}

const MERGE_WINDOW_MS = 90 * 1000;
const DESCRIPTION_LIMIT = 4000;

export async function buildEventsView(
  match: MatchDto,
  timeline: MatchTimelineDto,
  trackedIndex: number,
): Promise<MatchViewMessage> {
  const tracked = match.info.participants[trackedIndex];
  const embed = baseEmbed(match, tracked);

  const championEmojis = await Promise.all(
    match.info.participants.map(async (participant) => [
      participant.participantId,
      (await championEmoji(participant.championId)) || participant.championName,
    ] as const),
  );
  const championById = new Map(championEmojis);
  const teamByParticipantId = new Map(
    match.info.participants.map((participant) => [participant.participantId, participant.teamId]),
  );

  const lines: EventLine[] = [];
  for (const frame of timeline.info.frames) {
    for (const event of frame.events) {
      const described = await describeEvent(event, championById, teamByParticipantId);
      if (!described) {
        continue;
      }
      const previous = lines[lines.length - 1];
      if (
        described.key &&
        previous?.key === described.key &&
        event.timestamp - previous.timestamp <= MERGE_WINDOW_MS
      ) {
        // Riot logs a triple then a quadra for the same streak: keep only the biggest.
        if (described.key.startsWith("multi:")) {
          previous.text = described.text;
        } else {
          previous.count += 1;
        }
        continue;
      }
      lines.push({ ...described, timestamp: event.timestamp, count: 1 });
    }
  }

  let description = "";
  for (const line of lines) {
    const text = `\`${formatDuration(line.timestamp / 1000)}\` ${line.text}${line.count > 1 ? ` ×${line.count}` : ""}\n`;
    if (description.length + text.length > DESCRIPTION_LIMIT) {
      description += "…";
      break;
    }
    description += text;
  }

  embed.setDescription(description || "Aucun événement marquant.");
  return { embeds: [embed] };
}

export async function buildGoldView(
  match: MatchDto,
  timeline: MatchTimelineDto,
  trackedIndex: number,
): Promise<MatchViewMessage> {
  const tracked = match.info.participants[trackedIndex];
  const differences = goldDifferenceByMinute(match, timeline);
  const attachment = new AttachmentBuilder(await renderGoldDiffChart(differences), { name: "gold.png" });

  const describeLead = (sign: 1 | -1) => {
    let best = 0;
    let minute = 0;
    differences.forEach((difference, index) => {
      if (difference * sign > best) {
        best = difference * sign;
        minute = index;
      }
    });
    return best > 0 ? `+${formatThousands(best)} à ${minute} min` : "jamais devant";
  };

  const embed = baseEmbed(match, tracked)
    .setDescription(
      "Différence d'or entre les deux équipes, minute par minute.\n" +
        `🔵 Plus grosse avance bleue : **${describeLead(1)}**\n` +
        `🔴 Plus grosse avance rouge : **${describeLead(-1)}**`,
    )
    .setImage("attachment://gold.png");
  return { embeds: [embed], files: [attachment] };
}

export async function buildDamageView(match: MatchDto, trackedIndex: number): Promise<MatchViewMessage> {
  const tracked = match.info.participants[trackedIndex];
  const players = [...teamOf(match, BLUE_TEAM_ID), ...teamOf(match, RED_TEAM_ID)];
  const image = await renderDamageChart(
    players.map((participant) => ({
      championId: participant.championId,
      name: participant.riotIdGameName || participant.championName,
      teamId: participant.teamId,
      damage: participant.totalDamageDealtToChampions,
      highlighted: participant.puuid === tracked?.puuid,
    })),
  );
  const attachment = new AttachmentBuilder(image, { name: "damage.png" });

  const embed = baseEmbed(match, tracked)
    .setDescription("Dégâts infligés aux champions.")
    .setImage("attachment://damage.png");
  return { embeds: [embed], files: [attachment] };
}

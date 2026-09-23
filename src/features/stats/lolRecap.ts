import { ChannelType, Colors, EmbedBuilder, type Client } from "discord.js";
import { createLogger } from "../../shared/logger/logger";
import { guildConfigRepository } from "../../shared/storage/guildConfigRepository";
import { lolLinkRepository, type RecapPeriod } from "./lolLinkRepository";
import { QUEUE_LABELS } from "./lolRank";

const logger = createLogger("lol-recap");

export interface RecapEntry {
  discordUserId: string;
  riotId: string;
  queueLabel: string;
  lpDelta: number;
  games: number;
}

export function todayLocalDate(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function toDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

export function collectRecapEntries(period: RecapPeriod): RecapEntry[] {
  const entries: RecapEntry[] = [];
  for (const [discordUserId, link] of lolLinkRepository.all()) {
    for (const [queueType, progress] of Object.entries(link.queueProgress ?? {})) {
      const stats = progress[period];
      if (stats.games === 0) {
        continue;
      }
      entries.push({
        discordUserId,
        riotId: `${link.gameName}#${link.tagLine}`,
        queueLabel: QUEUE_LABELS[queueType] ?? queueType,
        lpDelta: stats.lpDelta,
        games: stats.games,
      });
    }
  }
  return entries;
}

function formatEntry(discordDisplayName: string, entry: RecapEntry): string {
  const emoji = entry.lpDelta >= 0 ? "📈" : "📉";
  const sign = entry.lpDelta >= 0 ? "+" : "";
  const gameWord = entry.games > 1 ? "parties" : "partie";
  return `${emoji} ${sign}${entry.lpDelta} PL : ${discordDisplayName} (${entry.riotId}) | ${entry.games} ${gameWord} / ${entry.queueLabel}`;
}

async function buildRecapEmbedForGuild(
  client: Client,
  guildId: string,
  entries: RecapEntry[],
  title: string,
  description: string,
): Promise<EmbedBuilder | null> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    return null;
  }

  const memberEntries: { entry: RecapEntry; displayName: string }[] = [];
  for (const entry of entries) {
    const member = await guild.members.fetch(entry.discordUserId).catch(() => null);
    if (member) {
      memberEntries.push({ entry, displayName: member.displayName });
    }
  }

  if (memberEntries.length === 0) {
    return null;
  }

  const gainers = memberEntries
    .filter(({ entry }) => entry.lpDelta > 0)
    .sort((a, b) => b.entry.lpDelta - a.entry.lpDelta);
  const losers = memberEntries
    .filter(({ entry }) => entry.lpDelta < 0)
    .sort((a, b) => a.entry.lpDelta - b.entry.lpDelta);

  const embed = new EmbedBuilder()
    .setColor(Colors.Gold)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();

  if (gainers.length > 0) {
    embed.addFields({
      name: "Joueurs les plus performants",
      value: gainers.map(({ entry, displayName }) => formatEntry(displayName, entry)).join("\n"),
    });
  }
  if (losers.length > 0) {
    embed.addFields({
      name: "Joueurs les moins performants",
      value: losers.map(({ entry, displayName }) => formatEntry(displayName, entry)).join("\n"),
    });
  }

  return embed;
}

export async function postRecap(
  client: Client,
  entries: RecapEntry[],
  title: string,
  description: string,
): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  for (const guild of client.guilds.cache.values()) {
    const channelId = guildConfigRepository.getStatsChannelId(guild.id);
    if (!channelId) {
      continue;
    }

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
      continue;
    }

    const embed = await buildRecapEmbedForGuild(client, guild.id, entries, title, description);
    if (embed) {
      await channel.send({ embeds: [embed] }).catch((error) => {
        logger.error(`Failed to send LoL recap to guild ${guild.id}.`, error);
      });
    }
  }
}

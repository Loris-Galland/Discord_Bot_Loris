import { ChannelType, Colors, EmbedBuilder, type Client } from "discord.js";
import { createLogger } from "../../shared/logger/logger";
import { guildConfigRepository } from "../../shared/storage/guildConfigRepository";
import { getChampionNameById } from "./dataDragon.service";
import { lolLinkRepository } from "./lolLinkRepository";
import { formatRank, QUEUE_ID_LABELS, RANKED_QUEUE_TYPE_BY_ID } from "./lolRank";
import { getActiveGame, getRankedEntries, RiotApiError } from "./riotApi.service";

const logger = createLogger("lol-live-panel");

interface LiveEntry {
  displayName: string;
  championName: string;
  queueLabel: string;
  rankText: string;
  minutesElapsed: number;
}

async function buildLiveEntry(
  discordUserId: string,
  displayName: string,
): Promise<LiveEntry | null> {
  const link = lolLinkRepository.get(discordUserId);
  if (!link) {
    return null;
  }

  const game = await getActiveGame(link.platform, link.puuid);
  if (!game) {
    return null;
  }

  const participant = game.participants.find((entry) => entry.puuid === link.puuid);
  if (!participant) {
    return null;
  }

  const championName = (await getChampionNameById(participant.championId)) ?? "Champion inconnu";
  const queueLabel = QUEUE_ID_LABELS[game.gameQueueConfigId] ?? "Partie";

  let rankText = "";
  const rankedQueueType = RANKED_QUEUE_TYPE_BY_ID[game.gameQueueConfigId];
  if (rankedQueueType) {
    const rankedEntries = await getRankedEntries(link.platform, link.puuid).catch(() => []);
    const entry = rankedEntries.find((candidate) => candidate.queueType === rankedQueueType);
    if (entry) {
      rankText = ` — ${formatRank(entry)}`;
    }
  }

  return {
    displayName,
    championName,
    queueLabel,
    rankText,
    minutesElapsed: Math.max(0, Math.floor(game.gameLength / 60)),
  };
}

function formatLiveEntry(entry: LiveEntry): string {
  return `🟢 **${entry.displayName}** — ${entry.championName} (${entry.queueLabel})${entry.rankText} — en jeu depuis ${entry.minutesElapsed} min`;
}

async function buildPanelEmbed(guildId: string, client: Client): Promise<EmbedBuilder | null> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    return null;
  }

  const lines: string[] = [];
  for (const [discordUserId] of lolLinkRepository.all()) {
    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member) {
      continue;
    }

    try {
      const entry = await buildLiveEntry(discordUserId, member.displayName);
      if (entry) {
        lines.push(formatLiveEntry(entry));
      }
    } catch (error) {
      if (error instanceof RiotApiError) {
        logger.warn(
          `Riot API error while checking live status for ${discordUserId}: ${error.message}`,
        );
        continue;
      }
      logger.error(`Failed to check live status for ${discordUserId}.`, error);
    }
  }

  return new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setTitle("Qui joue en ce moment")
    .setDescription(lines.length > 0 ? lines.join("\n") : "Personne n'est en jeu actuellement.")
    .setTimestamp();
}

export async function updateLivePanels(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    const panel = guildConfigRepository.getLivePanel(guild.id);
    if (!panel) {
      continue;
    }

    const channel = await guild.channels.fetch(panel.channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
      continue;
    }

    const message = await channel.messages.fetch(panel.messageId).catch(() => null);
    if (!message) {
      logger.warn(`Live panel message missing in guild ${guild.id}, run /lol-live-panel again.`);
      continue;
    }

    const embed = await buildPanelEmbed(guild.id, client);
    if (!embed) {
      continue;
    }

    await message.edit({ embeds: [embed] }).catch((error) => {
      logger.error(`Failed to update live panel for guild ${guild.id}.`, error);
    });
  }
}

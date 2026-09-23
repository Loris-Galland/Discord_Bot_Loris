import { AttachmentBuilder, Colors, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Command } from "../../shared/discord/command.types";
import { createLogger } from "../../shared/logger/logger";
import { buildHistoryImage, type HistoryRow } from "./lolHistoryImage";
import { lolLinkRepository } from "./lolLinkRepository";
import { QUEUE_ID_LABELS } from "./lolRank";
import { getMatch, getRecentMatchIds, RiotApiError } from "./riotApi.service";

const logger = createLogger("lol-history-command");
const DEFAULT_COUNT = 10;
const MAX_COUNT = 15;
const HISTORY_ATTACHMENT_NAME = "history.png";

function formatRelativeTime(timestampMs: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - timestampMs) / 60000));
  if (minutes < 60) {
    return `il y a ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `il y a ${hours}h`;
  }
  return `il y a ${Math.floor(hours / 24)}j`;
}

export const lolHistoryCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("lol-history")
    .setDescription("Show recent LoL match history (wins/losses) for a linked account.")
    .addUserOption((option) =>
      option.setName("player").setDescription("Whose linked account to check (defaults to you)."),
    )
    .addIntegerOption((option) =>
      option
        .setName("count")
        .setDescription(`How many recent matches to show (default ${DEFAULT_COUNT}, max ${MAX_COUNT}).`)
        .setMinValue(1)
        .setMaxValue(MAX_COUNT),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("player") ?? interaction.user;
    const count = interaction.options.getInteger("count") ?? DEFAULT_COUNT;
    const link = lolLinkRepository.get(target.id);

    if (!link) {
      const who = target.id === interaction.user.id ? "You haven't" : `${target.username} hasn't`;
      await interaction.reply({
        content: `${who} linked a Riot account yet. Use \`/lol-link\`.`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const matchIds = await getRecentMatchIds(link.regional, link.puuid, count);
      if (matchIds.length === 0) {
        await interaction.editReply("No recent matches found for this account.");
        return;
      }

      const rows: HistoryRow[] = [];
      let wins = 0;

      for (const matchId of matchIds) {
        const match = await getMatch(link.regional, matchId);
        const participant = match.info.participants.find((entry) => entry.puuid === link.puuid);
        if (!participant) {
          continue;
        }

        if (participant.win) {
          wins += 1;
        }

        const endTimestamp = match.info.gameEndTimestamp ?? match.info.gameCreation + match.info.gameDuration * 1000;
        rows.push({
          participant,
          queueLabel: QUEUE_ID_LABELS[match.info.queueId] ?? "Partie",
          relativeTime: formatRelativeTime(endTimestamp),
        });
      }

      if (rows.length === 0) {
        await interaction.editReply("Could not read this player's recent matches.");
        return;
      }

      const losses = rows.length - wins;
      const imageBuffer = await buildHistoryImage(rows);
      const attachment = new AttachmentBuilder(imageBuffer, { name: HISTORY_ATTACHMENT_NAME });

      const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setAuthor({ name: target.displayName })
        .setTitle(`Historique récent — ${wins}V / ${losses}D`)
        .setImage(`attachment://${HISTORY_ATTACHMENT_NAME}`)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], files: [attachment] });
    } catch (error) {
      if (error instanceof RiotApiError) {
        await interaction.editReply(error.message);
        return;
      }
      logger.error("Failed to fetch LoL history.", error);
      await interaction.editReply("An unexpected error occurred.");
    }
  },
};

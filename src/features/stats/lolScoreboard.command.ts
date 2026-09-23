import { AttachmentBuilder, Colors, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Command } from "../../shared/discord/command.types";
import { createLogger } from "../../shared/logger/logger";
import { lolLinkRepository } from "./lolLinkRepository";
import { QUEUE_ID_LABELS } from "./lolRank";
import { buildScoreboardImage } from "./lolScoreboardImage";
import { getMatch, getRecentMatchIds, RiotApiError } from "./riotApi.service";

const logger = createLogger("lol-scoreboard-command");
const SCOREBOARD_ATTACHMENT_NAME = "scoreboard.png";

export const lolScoreboardCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("lol-scoreboard")
    .setDescription("Show the full 10-player scoreboard for a linked account's most recent match.")
    .addUserOption((option) =>
      option.setName("player").setDescription("Whose linked account's last match to show (defaults to you)."),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("player") ?? interaction.user;
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
      const [latestMatchId] = await getRecentMatchIds(link.regional, link.puuid, 1);
      if (!latestMatchId) {
        await interaction.editReply("No recent matches found for this account.");
        return;
      }

      const match = await getMatch(link.regional, latestMatchId);
      const trackedParticipant = match.info.participants.find((entry) => entry.puuid === link.puuid);
      if (!trackedParticipant) {
        await interaction.editReply("Could not find this player in their most recent match.");
        return;
      }

      const durationMinutes = Math.round(match.info.gameDuration / 60);
      const queueLabel = QUEUE_ID_LABELS[match.info.queueId] ?? "Partie";

      const imageBuffer = await buildScoreboardImage(match, link.puuid);
      const attachment = new AttachmentBuilder(imageBuffer, { name: SCOREBOARD_ATTACHMENT_NAME });

      const embed = new EmbedBuilder()
        .setColor(trackedParticipant.win ? Colors.Green : Colors.Red)
        .setTitle(`Scoreboard — ${queueLabel} — ${durationMinutes} min`)
        .setImage(`attachment://${SCOREBOARD_ATTACHMENT_NAME}`)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], files: [attachment] });
    } catch (error) {
      if (error instanceof RiotApiError) {
        await interaction.editReply(error.message);
        return;
      }
      logger.error("Failed to fetch LoL scoreboard.", error);
      await interaction.editReply("An unexpected error occurred.");
    }
  },
};

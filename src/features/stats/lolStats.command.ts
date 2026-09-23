import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../shared/discord/command.types";
import { createLogger } from "../../shared/logger/logger";
import { buildMatchSummaryEmbed } from "./lolEmbed";
import { lolLinkRepository } from "./lolLinkRepository";
import { getMatch, getRankedEntries, getRecentMatchIds, RiotApiError } from "./riotApi.service";

const logger = createLogger("lol-stats-command");

export const lolStatsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("lol-stats")
    .setDescription("Show the most recent LoL match for a linked account.")
    .addUserOption((option) =>
      option.setName("player").setDescription("Whose linked account to check (defaults to you)."),
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
      const participant = match.info.participants.find((entry) => entry.puuid === link.puuid);
      if (!participant) {
        await interaction.editReply("Could not find this player in their most recent match.");
        return;
      }

      // Ranked standing is supplementary: don't fail the whole command if it can't be fetched.
      const rankedEntries = await getRankedEntries(link.platform, link.puuid).catch(() => []);

      const embed = await buildMatchSummaryEmbed(target.displayName, match, participant, rankedEntries);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      if (error instanceof RiotApiError) {
        await interaction.editReply(error.message);
        return;
      }
      logger.error("Failed to fetch LoL stats.", error);
      await interaction.editReply("An unexpected error occurred.");
    }
  },
};

import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../shared/discord/command.types";
import { createLogger } from "../../shared/logger/logger";
import { lolLinkRepository } from "./lolLinkRepository";
import { renderMatchView } from "./lolMatchButtons.component";
import { getCachedMatch } from "./lolMatchCache";
import { getRecentMatchIds, RiotApiError } from "./riotApi.service";

const logger = createLogger("lol-scoreboard-command");

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

      const match = await getCachedMatch(latestMatchId);
      const trackedIndex = match.info.participants.findIndex((entry) => entry.puuid === link.puuid);
      if (trackedIndex === -1) {
        await interaction.editReply("Could not find this player in their most recent match.");
        return;
      }

      await interaction.editReply(await renderMatchView("scoreboard", latestMatchId, trackedIndex));
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

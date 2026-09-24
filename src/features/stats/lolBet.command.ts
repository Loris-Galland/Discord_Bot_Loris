import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../shared/discord/command.types";
import { lolBetRepository } from "./lolBetRepository";
import { placeWager, refreshBetMessage } from "./lolBetting.service";
import { lolLinkRepository } from "./lolLinkRepository";
import { BLUE_TEAM_ID, RED_TEAM_ID } from "./lolMatchViews";

export const lolBetCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("lol-bet")
    .setDescription("Bet jetons on a friend's ongoing LoL game.")
    .addUserOption((option) =>
      option
        .setName("player")
        .setDescription("The linked player whose game you're betting on.")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("side")
        .setDescription("Which side you're betting on.")
        .setRequired(true)
        .addChoices(
          { name: "Son équipe", value: "own" },
          { name: "L'équipe adverse", value: "enemy" },
        ),
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("How many jetons to wager.")
        .setRequired(true)
        .setMinValue(1),
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "This command only works in a server.", ephemeral: true });
      return;
    }

    const target = interaction.options.getUser("player", true);
    const side = interaction.options.getString("side", true) as "own" | "enemy";
    const amount = interaction.options.getInteger("amount", true);

    const link = lolLinkRepository.get(target.id);
    const bet = link ? lolBetRepository.findOpenForPlayer(interaction.guildId, link.puuid) : undefined;
    const targetTeamId = link ? bet?.participantTeams[link.puuid] : undefined;
    if (!bet || targetTeamId === undefined) {
      await interaction.reply({
        content: `Aucun pari ouvert sur une partie de ${target.username} en ce moment.`,
        ephemeral: true,
      });
      return;
    }

    const teamId = side === "own" ? targetTeamId : targetTeamId === BLUE_TEAM_ID ? RED_TEAM_ID : BLUE_TEAM_ID;
    const result = placeWager(bet, interaction.user.id, teamId, amount);
    await interaction.reply({ content: result.message, ephemeral: true });

    const updated = lolBetRepository.get(interaction.guildId, bet.gameId);
    if (result.ok && updated) {
      await refreshBetMessage(interaction.client, updated, "open");
    }
  },
};

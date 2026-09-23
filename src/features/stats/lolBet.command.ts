import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../shared/discord/command.types";
import { lolBetRepository } from "./lolBetRepository";
import { lolLinkRepository } from "./lolLinkRepository";
import { lolWalletRepository } from "./lolWalletRepository";

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
    if (!link || link.lastKnownGameId === undefined) {
      await interaction.reply({
        content: `${target.username} isn't currently in a tracked game.`,
        ephemeral: true,
      });
      return;
    }

    const bet = lolBetRepository.get(interaction.guildId, link.lastKnownGameId);
    if (!bet) {
      await interaction.reply({ content: "No open bet for that game.", ephemeral: true });
      return;
    }
    if (bet.closed || Date.now() >= bet.closesAt) {
      await interaction.reply({ content: "Betting is closed for this game.", ephemeral: true });
      return;
    }

    const bettorLink = lolLinkRepository.get(interaction.user.id);
    if (bettorLink && bet.participantPuuids.includes(bettorLink.puuid)) {
      await interaction.reply({
        content: "You can't bet on a game you're playing in.",
        ephemeral: true,
      });
      return;
    }

    if (bet.wagers.some((wager) => wager.discordUserId === interaction.user.id)) {
      await interaction.reply({ content: "You already bet on this game.", ephemeral: true });
      return;
    }

    const balance = lolWalletRepository.getBalance(interaction.user.id);
    if (amount > balance) {
      await interaction.reply({ content: `You only have ${balance} 🪙.`, ephemeral: true });
      return;
    }

    lolWalletRepository.adjustBalance(interaction.user.id, -amount);
    bet.wagers.push({ discordUserId: interaction.user.id, side, amount });
    lolBetRepository.set(bet);

    const sideLabel =
      side === "own" ? `l'équipe de ${target.username}` : `l'équipe adverse à ${target.username}`;
    const remaining = lolWalletRepository.getBalance(interaction.user.id);
    await interaction.reply({
      content: `Pari placé : **${amount} 🪙** sur ${sideLabel}. Solde restant : ${remaining} 🪙.`,
      ephemeral: true,
    });
  },
};

import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../shared/discord/command.types";
import { lolWalletRepository } from "./lolWalletRepository";

export const lolWalletCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("lol-wallet")
    .setDescription("Check your (or someone else's) betting balance.")
    .addUserOption((option) =>
      option.setName("player").setDescription("Whose balance to check (defaults to you)."),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("player") ?? interaction.user;
    const balance = lolWalletRepository.getBalance(target.id);
    const who = target.id === interaction.user.id ? "Tu as" : `${target.username} a`;

    await interaction.reply({ content: `${who} **${balance} 🪙**.`, ephemeral: true });
  },
};

import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../shared/discord/command.types";
import { lolLinkRepository } from "./lolLinkRepository";

export const lolUnlinkCommand: Command = {
  data: new SlashCommandBuilder().setName("lol-unlink").setDescription("Unlink your Riot account."),

  async execute(interaction) {
    const existing = lolLinkRepository.get(interaction.user.id);
    if (!existing) {
      await interaction.reply({
        content: "You don't have a linked Riot account.",
        ephemeral: true,
      });
      return;
    }

    lolLinkRepository.remove(interaction.user.id);
    await interaction.reply({ content: "Riot account unlinked.", ephemeral: true });
  },
};

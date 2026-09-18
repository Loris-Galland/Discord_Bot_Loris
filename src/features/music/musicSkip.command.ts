import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../shared/discord/command.types";
import { MusicPlaybackError, skipTrack } from "./musicPlayer.service";

export const musicSkipCommand: Command = {
  data: new SlashCommandBuilder().setName("skip").setDescription("Skip the current track."),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "This command only works in a server.", ephemeral: true });
      return;
    }

    try {
      skipTrack(interaction.guildId);
      await interaction.reply({ content: "Skipped.", ephemeral: true });
    } catch (error) {
      if (error instanceof MusicPlaybackError) {
        await interaction.reply({ content: error.message, ephemeral: true });
        return;
      }
      throw error;
    }
  },
};

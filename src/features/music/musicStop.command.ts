import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../shared/discord/command.types";
import { MusicPlaybackError, stopPlayback } from "./musicPlayer.service";

export const musicStopCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stop playback, clear the queue, and leave the voice channel."),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "This command only works in a server.", ephemeral: true });
      return;
    }

    try {
      stopPlayback(interaction.guildId);
      await interaction.reply({ content: "Stopped and left the voice channel.", ephemeral: true });
    } catch (error) {
      if (error instanceof MusicPlaybackError) {
        await interaction.reply({ content: error.message, ephemeral: true });
        return;
      }
      throw error;
    }
  },
};

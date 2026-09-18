import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../shared/discord/command.types";
import { getQueue } from "./musicQueueManager";

export const musicQueueCommand: Command = {
  data: new SlashCommandBuilder().setName("queue").setDescription("Show the current music queue."),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "This command only works in a server.", ephemeral: true });
      return;
    }

    const queue = getQueue(interaction.guildId);
    if (!queue || (!queue.currentTrack && queue.tracks.length === 0)) {
      await interaction.reply({ content: "The queue is empty.", ephemeral: true });
      return;
    }

    const nowPlaying = queue.currentTrack
      ? `Now playing: **${queue.currentTrack.title}**`
      : "Nothing is playing.";
    const upNext = queue.tracks.map((track, index) => `${index + 1}. ${track.title}`).join("\n");

    await interaction.reply({
      content: upNext ? `${nowPlaying}\n\n${upNext}` : nowPlaying,
      ephemeral: true,
    });
  },
};

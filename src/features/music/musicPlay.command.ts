import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../shared/discord/command.types";
import { createLogger } from "../../shared/logger/logger";
import { MusicPlaybackError, enqueueTrack, ensureQueue } from "./musicPlayer.service";
import { MusicResolutionError, resolveTrack } from "./musicResolver.service";

const logger = createLogger("music-play-command");

export const musicPlayCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a track from a YouTube link, a Spotify link, or a search term.")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("YouTube URL, Spotify track URL, or search term.")
        .setRequired(true),
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "This command only works in a server.", ephemeral: true });
      return;
    }

    await interaction.deferReply();
    const query = interaction.options.getString("query", true);

    try {
      // Join the voice channel first so a bad query still leaves the bot connected and ready.
      await ensureQueue(interaction);
      const track = await resolveTrack(query, interaction.user.tag);
      enqueueTrack(interaction.guildId, track);
      await interaction.editReply(`Queued **${track.title}**.`);
    } catch (error) {
      if (error instanceof MusicPlaybackError || error instanceof MusicResolutionError) {
        await interaction.editReply(error.message);
        return;
      }
      logger.error("Failed to play track.", error);
      await interaction.editReply("An unexpected error occurred.");
    }
  },
};

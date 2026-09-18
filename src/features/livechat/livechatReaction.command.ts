import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../shared/discord/command.types";
import { createLogger } from "../../shared/logger/logger";
import { guildConfigRepository } from "../../shared/storage/guildConfigRepository";
import { LivechatRelayError, ReactionPayload, relayReaction } from "./livechatRelay.service";

const logger = createLogger("livechat-reaction-command");

export const livechatReactionCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("react")
    .setDescription("Send a live reaction to the streamer's livechat.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("gif")
        .setDescription("Send a gif.")
        .addAttachmentOption((option) => option.setName("file").setDescription("Gif file."))
        .addStringOption((option) => option.setName("url").setDescription("URL of the gif.")),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("image")
        .setDescription("Send an image.")
        .addAttachmentOption((option) => option.setName("file").setDescription("Image file."))
        .addStringOption((option) => option.setName("url").setDescription("URL of the image.")),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("video")
        .setDescription("Send a video.")
        .addAttachmentOption((option) => option.setName("file").setDescription("Video file."))
        .addStringOption((option) => option.setName("url").setDescription("URL of the video.")),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("text")
        .setDescription("Send a text message.")
        .addStringOption((option) =>
          option.setName("message").setDescription("The message to display.").setRequired(true),
        ),
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "This command only works in a server.", ephemeral: true });
      return;
    }

    const channelId = guildConfigRepository.getLivechatChannelId(interaction.guildId);
    if (!channelId) {
      await interaction.reply({
        content: "No livechat channel is configured yet. Ask an admin to run /livechat-config.",
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const payload = buildPayload(subcommand, interaction);

    try {
      await relayReaction(interaction, channelId, payload);
      await interaction.reply({ content: "Reaction sent.", ephemeral: true });
    } catch (error) {
      if (error instanceof LivechatRelayError) {
        await interaction.reply({ content: error.message, ephemeral: true });
        return;
      }
      logger.error("Failed to send a livechat reaction.", error);
      await interaction.reply({ content: "An unexpected error occurred.", ephemeral: true });
    }
  },
};

function buildPayload(
  subcommand: string,
  interaction: Parameters<Command["execute"]>[0],
): ReactionPayload {
  if (subcommand === "text") {
    return { type: "text", message: interaction.options.getString("message", true) };
  }

  return {
    type: subcommand as "gif" | "image" | "video",
    attachment: interaction.options.getAttachment("file"),
    url: interaction.options.getString("url"),
  };
}

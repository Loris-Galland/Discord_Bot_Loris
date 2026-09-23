import {
  ChannelType,
  Colors,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../../shared/discord/command.types";
import { createLogger } from "../../shared/logger/logger";
import { guildConfigRepository } from "../../shared/storage/guildConfigRepository";

const logger = createLogger("lol-live-panel-command");

export const lolLivePanelCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("lol-live-panel")
    .setDescription("Set up (or move) the pinned live panel showing who's currently in a LoL game.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Text channel where the panel will be pinned.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({ content: "This command only works in a server.", ephemeral: true });
      return;
    }

    const channel = interaction.options.getChannel("channel", true);
    const textChannel = await interaction.guild.channels.fetch(channel.id);
    if (!textChannel || textChannel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: "Pick a text channel.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const existingPanel = guildConfigRepository.getLivePanel(interaction.guildId);
    if (existingPanel) {
      const oldChannel = await interaction.guild.channels
        .fetch(existingPanel.channelId)
        .catch(() => null);
      if (oldChannel?.type === ChannelType.GuildText) {
        const oldMessage = await oldChannel.messages
          .fetch(existingPanel.messageId)
          .catch(() => null);
        await oldMessage
          ?.delete()
          .catch((error) =>
            logger.warn(`Could not delete old live panel: ${(error as Error).message}`),
          );
      }
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle("Qui joue en ce moment")
      .setDescription("En attente de la prochaine mise à jour (jusqu'à 5 minutes)...");

    const message = await textChannel.send({ embeds: [embed] });
    await message
      .pin()
      .catch((error) => logger.warn(`Could not pin live panel: ${(error as Error).message}`));

    guildConfigRepository.setLivePanel(interaction.guildId, textChannel.id, message.id);

    await interaction.editReply(`Live panel set up in <#${textChannel.id}>.`);
  },
};

import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../../shared/discord/command.types";
import { guildConfigRepository } from "../../shared/storage/guildConfigRepository";

export const livechatConfigCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("livechat-config")
    .setDescription("Configure the channel where livechat reactions get relayed.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Text channel where the streamer will watch reactions live.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "This command only works in a server.", ephemeral: true });
      return;
    }

    const channel = interaction.options.getChannel("channel", true);
    guildConfigRepository.setLivechatChannelId(interaction.guildId, channel.id);

    await interaction.reply({
      content: `Livechat reactions will now be relayed to <#${channel.id}>.`,
      ephemeral: true,
    });
  },
};

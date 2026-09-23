import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../../shared/discord/command.types";
import { guildConfigRepository } from "../../shared/storage/guildConfigRepository";

export const lolConfigCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("lol-config")
    .setDescription("Configure the channel where new LoL match results get announced.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Text channel where match results will be posted.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "This command only works in a server.", ephemeral: true });
      return;
    }

    const channel = interaction.options.getChannel("channel", true);
    guildConfigRepository.setStatsChannelId(interaction.guildId, channel.id);

    await interaction.reply({
      content: `New LoL match results will now be posted to <#${channel.id}>.`,
      ephemeral: true,
    });
  },
};

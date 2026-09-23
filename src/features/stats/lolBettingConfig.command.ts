import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../../shared/discord/command.types";
import { guildConfigRepository } from "../../shared/storage/guildConfigRepository";

export const lolBettingConfigCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("lol-betting-config")
    .setDescription("Configure the channel where LoL bets get opened, closed and resolved.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Text channel where bets will be posted.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "This command only works in a server.", ephemeral: true });
      return;
    }

    const channel = interaction.options.getChannel("channel", true);
    guildConfigRepository.setBettingChannelId(interaction.guildId, channel.id);

    await interaction.reply({
      content: `Bets will now be posted to <#${channel.id}>.`,
      ephemeral: true,
    });
  },
};

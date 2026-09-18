import {
  ApplicationCommandOptionType,
  Colors,
  EmbedBuilder,
  SlashCommandBuilder,
  type ApplicationCommand,
} from "discord.js";
import type { Command } from "../../shared/discord/command.types";

export const helpCommand: Command = {
  data: new SlashCommandBuilder().setName("help").setDescription("List all available commands."),

  async execute(interaction) {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({ content: "This command only works in a server.", ephemeral: true });
      return;
    }

    // Pulled live from Discord instead of hardcoded, so this list can never drift out of
    // sync with what's actually deployed.
    const applicationCommands = await interaction.guild.commands.fetch();
    if (applicationCommands.size === 0) {
      await interaction.reply({ content: "No commands are registered yet.", ephemeral: true });
      return;
    }

    const lines = [...applicationCommands.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((command) => describeCommand(command));

    const embed = new EmbedBuilder()
      .setTitle("Available commands")
      .setDescription(lines.join("\n\n"))
      .setColor(Colors.Blurple);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

function describeCommand(command: ApplicationCommand): string {
  const hasOnlySubcommands = command.options.every(
    (option) => option.type === ApplicationCommandOptionType.Subcommand,
  );

  if (command.options.length > 0 && hasOnlySubcommands) {
    const subcommandUsages = command.options.map((option) => `\`/${command.name} ${option.name}\``).join(", ");
    return `**/${command.name}** — ${command.description}\n${subcommandUsages}`;
  }

  return `**/${command.name}** — ${command.description}`;
}

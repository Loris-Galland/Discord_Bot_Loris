import type { Client, Interaction } from "discord.js";
import type { Command } from "../shared/discord/command.types";
import { createLogger } from "../shared/logger/logger";

const logger = createLogger("interaction-router");

export function registerInteractionRouter(client: Client, commands: Command[]): void {
  const commandsByName = new Map(commands.map((command) => [command.data.name, command]));

  client.on("interactionCreate", async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = commandsByName.get(interaction.commandName);
    if (!command) {
      logger.warn(`Received unknown command: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error(`Error while executing /${interaction.commandName}`, error);
      const reply = { content: "An unexpected error occurred.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  });
}

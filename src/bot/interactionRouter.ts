import type { Client, Interaction } from "discord.js";
import type { Command } from "../shared/discord/command.types";
import type { ComponentHandler, ComponentInteraction } from "../shared/discord/component.types";
import { createLogger } from "../shared/logger/logger";

const logger = createLogger("interaction-router");

async function replyWithError(interaction: ComponentInteraction | Interaction): Promise<void> {
  if (!interaction.isRepliable()) {
    return;
  }
  const reply = { content: "An unexpected error occurred.", ephemeral: true };
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(reply).catch(() => {});
  } else {
    await interaction.reply(reply).catch(() => {});
  }
}

export function registerInteractionRouter(
  client: Client,
  commands: Command[],
  componentHandlers: ComponentHandler[],
): void {
  const commandsByName = new Map(commands.map((command) => [command.data.name, command]));
  const handlersByPrefix = new Map(componentHandlers.map((handler) => [handler.prefix, handler]));

  client.on("interactionCreate", async (interaction: Interaction) => {
    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
      const prefix = interaction.customId.split(":")[0] ?? "";
      const handler = handlersByPrefix.get(prefix);
      if (!handler) {
        logger.warn(`Received unknown component: ${interaction.customId}`);
        return;
      }
      try {
        await handler.handle(interaction);
      } catch (error) {
        logger.error(`Error while handling component ${interaction.customId}`, error);
        await replyWithError(interaction);
      }
      return;
    }

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
      await replyWithError(interaction);
    }
  });
}

import { REST, Routes } from "discord.js";
import { commands } from "../features";
import { config } from "../shared/config/env";
import { createLogger } from "../shared/logger/logger";

const logger = createLogger("deploy-commands");

async function deployCommands(): Promise<void> {
  const rest = new REST().setToken(config.discordToken);
  const body = commands.map((command) => command.data.toJSON());

  const route = config.discordGuildId
    ? Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId)
    : Routes.applicationCommands(config.discordClientId);

  const target = config.discordGuildId
    ? `guild ${config.discordGuildId}`
    : "all guilds (global)";

  logger.info(`Deploying ${body.length} command(s) to ${target}...`);
  await rest.put(route, { body });
  logger.info("Deployment complete.");
}

deployCommands().catch((error) => {
  logger.error("Failed to deploy commands.", error);
  process.exitCode = 1;
});

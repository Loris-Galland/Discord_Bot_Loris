import { Client, GatewayIntentBits } from "discord.js";
import { commands } from "../features";
import { config } from "../shared/config/env";
import { createLogger } from "../shared/logger/logger";
import { registerInteractionRouter } from "./interactionRouter";

const logger = createLogger("bot-client");

export function createBotClient(): Client {
  // GuildVoiceStates is required to join voice channels for the music feature.
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

  registerInteractionRouter(client, commands);

  client.once("ready", (readyClient) => {
    logger.info(`Logged in as ${readyClient.user.tag}.`);
  });

  return client;
}

export async function startBot(): Promise<void> {
  const client = createBotClient();
  await client.login(config.discordToken);
}

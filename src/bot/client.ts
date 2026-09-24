import { Client, GatewayIntentBits } from "discord.js";
import { commands, componentHandlers } from "../features";
import { initGameEmojis } from "../features/stats/lolGameEmoji";
import { startLolMatchTracker } from "../features/stats/lolMatchTracker.service";
import { initRankEmojis } from "../features/stats/lolRankEmoji";
import { config } from "../shared/config/env";
import { createLogger } from "../shared/logger/logger";
import { registerInteractionRouter } from "./interactionRouter";

const logger = createLogger("bot-client");

export function createBotClient(): Client {
  // GuildVoiceStates is required to join voice channels for the music feature.
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  registerInteractionRouter(client, commands, componentHandlers);

  client.once("ready", (readyClient) => {
    logger.info(`Logged in as ${readyClient.user.tag}.`);
    startLolMatchTracker(readyClient);
    // One after the other so both don't hammer Discord's emoji upload endpoint at once.
    initRankEmojis(readyClient)
      .catch((error) => logger.error("Failed to initialize rank emojis.", error))
      .then(() => initGameEmojis(readyClient))
      .catch((error) => logger.error("Failed to initialize game emojis.", error));
  });

  return client;
}

export async function startBot(): Promise<void> {
  const client = createBotClient();
  await client.login(config.discordToken);
}

import { startBot } from "./bot/client";
import { createLogger } from "./shared/logger/logger";

const logger = createLogger("bootstrap");

startBot().catch((error) => {
  logger.error("Failed to start the bot.", error);
  process.exitCode = 1;
});

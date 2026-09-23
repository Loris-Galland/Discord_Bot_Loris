import type { Client } from "discord.js";
import { createLogger } from "../../shared/logger/logger";
import { lolLinkRepository } from "./lolLinkRepository";
import { collectRecapEntries, postRecap, toDisplayDate, todayLocalDate } from "./lolRecap";
import { lolRecapState } from "./lolRecapState";

const logger = createLogger("lol-daily-recap");

// Local wall-clock hour the nightly recap fires at. Uses the bot process's local time
// (the machine/server's own timezone), so no extra config needed for a single-timezone
// friend group.
const RECAP_HOUR = 22;

export async function maybeRunDailyRecap(client: Client): Promise<void> {
  const now = new Date();
  if (now.getHours() < RECAP_HOUR) {
    return;
  }

  const today = todayLocalDate();
  if (lolRecapState.getLastDate("daily") === today) {
    return;
  }

  const fromDate = lolRecapState.getLastDate("daily") ?? today;
  const entries = collectRecapEntries("daily");

  await postRecap(
    client,
    entries,
    "Récap quotidien des classées",
    `Changements de classement entre ${toDisplayDate(fromDate)} et ${toDisplayDate(today)}`,
  );

  lolRecapState.setLastDate("daily", today);
  lolLinkRepository.resetPeriodProgress("daily");
  logger.info(`Daily LoL recap processed for ${today}.`);
}

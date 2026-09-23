import type { Client } from "discord.js";
import { createLogger } from "../../shared/logger/logger";
import { lolLinkRepository } from "./lolLinkRepository";
import { collectRecapEntries, postRecap, toDisplayDate, todayLocalDate } from "./lolRecap";
import { lolRecapState } from "./lolRecapState";

const logger = createLogger("lol-monthly-recap");
const RECAP_HOUR = 22;
const RECAP_DAY_OF_MONTH = 1;

export async function maybeRunMonthlyRecap(client: Client): Promise<void> {
  const now = new Date();
  if (now.getDate() !== RECAP_DAY_OF_MONTH || now.getHours() < RECAP_HOUR) {
    return;
  }

  const today = todayLocalDate();
  if (lolRecapState.getLastDate("monthly") === today) {
    return;
  }

  const fromDate = lolRecapState.getLastDate("monthly") ?? today;
  const entries = collectRecapEntries("monthly");

  await postRecap(
    client,
    entries,
    "Récap mensuel des classées",
    `Changements de classement entre ${toDisplayDate(fromDate)} et ${toDisplayDate(today)}`,
  );

  lolRecapState.setLastDate("monthly", today);
  lolLinkRepository.resetPeriodProgress("monthly");
  logger.info(`Monthly LoL recap processed for ${today}.`);
}

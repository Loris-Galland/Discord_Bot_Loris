import type { Client } from "discord.js";
import { createLogger } from "../../shared/logger/logger";
import { lolLinkRepository } from "./lolLinkRepository";
import { collectRecapEntries, postRecap, toDisplayDate, todayLocalDate } from "./lolRecap";
import { lolRecapState } from "./lolRecapState";

const logger = createLogger("lol-weekly-recap");
const RECAP_HOUR = 22;
const RECAP_WEEKDAY = 1; // Monday (Date#getDay(): 0 = Sunday)

export async function maybeRunWeeklyRecap(client: Client): Promise<void> {
  const now = new Date();
  if (now.getDay() !== RECAP_WEEKDAY || now.getHours() < RECAP_HOUR) {
    return;
  }

  const today = todayLocalDate();
  if (lolRecapState.getLastDate("weekly") === today) {
    return;
  }

  const fromDate = lolRecapState.getLastDate("weekly") ?? today;
  const entries = collectRecapEntries("weekly");

  await postRecap(
    client,
    entries,
    "Récap hebdomadaire des classées",
    `Changements de classement entre ${toDisplayDate(fromDate)} et ${toDisplayDate(today)}`,
  );

  lolRecapState.setLastDate("weekly", today);
  lolLinkRepository.resetPeriodProgress("weekly");
  logger.info(`Weekly LoL recap processed for ${today}.`);
}

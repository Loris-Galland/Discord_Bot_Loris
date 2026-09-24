import { ChannelType, type Client } from "discord.js";
import { createLogger } from "../../shared/logger/logger";
import { guildConfigRepository } from "../../shared/storage/guildConfigRepository";
import { closeExpiredBets, openBetsForNewGames, resolveFinishedBets } from "./lolBetting.service";
import { maybeRunDailyRecap } from "./lolDailyRecap.service";
import { buildMatchSummaryEmbed } from "./lolEmbed";
import { lolLinkRepository, type PeriodStats } from "./lolLinkRepository";
import { updateLivePanels } from "./lolLivePanel.service";
import { computeRankPoints, RANKED_QUEUE_TYPE_BY_ID } from "./lolRank";
import type { LeagueEntryDto } from "./lol.types";
import { maybeRunMonthlyRecap } from "./lolMonthlyRecap.service";
import { maybeRunWeeklyRecap } from "./lolWeeklyRecap.service";
import { getMatch, getRankedEntries, getRecentMatchIds, RiotApiError } from "./riotApi.service";

const logger = createLogger("lol-match-tracker");
const POLL_INTERVAL_MS = 5 * 60 * 1000;

function addDelta(stats: PeriodStats, delta: number): PeriodStats {
  return { lpDelta: stats.lpDelta + delta, games: stats.games + 1 };
}

// Records the LP change for the ranked queue this match was played in, so the daily/
// weekly/monthly recaps can report gains/losses. The first time we see a queue, there's
// no prior point total to diff against, so we just record the baseline instead of
// counting a delta.
function trackRankChange(
  discordUserId: string,
  queueType: string,
  rankedEntries: LeagueEntryDto[],
): void {
  const entry = rankedEntries.find((candidate) => candidate.queueType === queueType);
  if (!entry) {
    return;
  }

  const link = lolLinkRepository.get(discordUserId);
  if (!link) {
    return;
  }

  const points = computeRankPoints(entry);
  const previous = link.queueProgress?.[queueType];
  const zero: PeriodStats = { lpDelta: 0, games: 0 };

  if (!previous) {
    lolLinkRepository.setQueueProgress(discordUserId, queueType, {
      lastPoints: points,
      daily: zero,
      weekly: zero,
      monthly: zero,
    });
    return;
  }

  const delta = points - previous.lastPoints;
  lolLinkRepository.setQueueProgress(discordUserId, queueType, {
    lastPoints: points,
    daily: addDelta(previous.daily, delta),
    weekly: addDelta(previous.weekly, delta),
    monthly: addDelta(previous.monthly, delta),
  });
}

async function announceMatch(
  client: Client,
  discordUserId: string,
  displayName: string,
  matchId: string,
): Promise<void> {
  const link = lolLinkRepository.get(discordUserId);
  if (!link) {
    return;
  }

  const match = await getMatch(link.regional, matchId);
  const participant = match.info.participants.find((entry) => entry.puuid === link.puuid);
  if (!participant) {
    return;
  }

  const rankedEntries = await getRankedEntries(link.platform, link.puuid).catch(() => []);

  const queueType = RANKED_QUEUE_TYPE_BY_ID[match.info.queueId];
  if (queueType) {
    trackRankChange(discordUserId, queueType, rankedEntries);
  }

  const summary = await buildMatchSummaryEmbed(
    displayName,
    match,
    participant,
    rankedEntries,
  );

  for (const guild of client.guilds.cache.values()) {
    const channelId = guildConfigRepository.getStatsChannelId(guild.id);
    if (!channelId) {
      continue;
    }

    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member) {
      continue;
    }

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
      continue;
    }

    await channel.send(summary);
  }
}

async function checkLink(client: Client, discordUserId: string): Promise<void> {
  const link = lolLinkRepository.get(discordUserId);
  if (!link) {
    return;
  }

  const [latestMatchId] = await getRecentMatchIds(link.regional, link.puuid, 1);
  if (!latestMatchId || latestMatchId === link.lastSeenMatchId) {
    return;
  }

  const isFirstCheck = !link.lastSeenMatchId;
  lolLinkRepository.setLastSeenMatchId(discordUserId, latestMatchId);

  // First time we see this account: just record the baseline. Otherwise linking an
  // account with existing match history would announce an old game on the next poll.
  if (isFirstCheck) {
    return;
  }

  await announceMatch(client, discordUserId, `${link.gameName}#${link.tagLine}`, latestMatchId);
}

async function pollAll(client: Client): Promise<void> {
  for (const [discordUserId] of lolLinkRepository.all()) {
    try {
      await checkLink(client, discordUserId);
    } catch (error) {
      if (error instanceof RiotApiError) {
        logger.warn(`Riot API error while polling ${discordUserId}: ${error.message}`);
        continue;
      }
      logger.error(`Failed to poll LoL match for ${discordUserId}.`, error);
    }
  }
}

export function startLolMatchTracker(client: Client): void {
  setInterval(() => {
    pollAll(client)
      .then(() => updateLivePanels(client))
      .then(() => openBetsForNewGames(client))
      .then(() => closeExpiredBets(client))
      .then(() => resolveFinishedBets(client))
      .then(() => maybeRunDailyRecap(client))
      .then(() => maybeRunWeeklyRecap(client))
      .then(() => maybeRunMonthlyRecap(client))
      .catch((error) => logger.error("LoL match tracker poll failed.", error));
  }, POLL_INTERVAL_MS);
  logger.info(`LoL match tracker started (polling every ${POLL_INTERVAL_MS / 60000} min).`);
}

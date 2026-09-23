import { ChannelType, type Client } from "discord.js";
import { createLogger } from "../../shared/logger/logger";
import { guildConfigRepository } from "../../shared/storage/guildConfigRepository";
import { buildMatchSummaryEmbed } from "./lolEmbed";
import { lolLinkRepository } from "./lolLinkRepository";
import { getMatch, getRankedEntries, getRecentMatchIds, RiotApiError } from "./riotApi.service";

const logger = createLogger("lol-match-tracker");
const POLL_INTERVAL_MS = 5 * 60 * 1000;

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
  const embed = await buildMatchSummaryEmbed(displayName, match, participant, rankedEntries);

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

    await channel.send({ embeds: [embed] });
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
    pollAll(client).catch((error) => logger.error("LoL match tracker poll failed.", error));
  }, POLL_INTERVAL_MS);
  logger.info(`LoL match tracker started (polling every ${POLL_INTERVAL_MS / 60000} min).`);
}

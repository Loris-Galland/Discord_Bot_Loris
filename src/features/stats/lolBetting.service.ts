import { ChannelType, Colors, EmbedBuilder, type Client } from "discord.js";
import { createLogger } from "../../shared/logger/logger";
import { guildConfigRepository } from "../../shared/storage/guildConfigRepository";
import type { MatchParticipantDto } from "./lol.types";
import { lolBetRepository, type OpenBet } from "./lolBetRepository";
import { lolLinkRepository } from "./lolLinkRepository";
import { QUEUE_ID_LABELS } from "./lolRank";
import { lolWalletRepository } from "./lolWalletRepository";
import { getActiveGame, RiotApiError } from "./riotApi.service";

const logger = createLogger("lol-betting");

const BET_WINDOW_MS = 5 * 60 * 1000;
// Flat placeholder odds for both sides (no win-probability model yet — see
// feedback_lol_stats_scope memory: this can be swapped for a real one later without
// touching the storage shape or the resolution logic).
export const PAYOUT_MULTIPLIER = 1.9;

// Detects a linked player starting a new game (their active-game id changed since the
// last check) and opens a bet in every guild with a betting channel where they're a member.
export async function openBetsForNewGames(client: Client): Promise<void> {
  for (const [discordUserId, link] of lolLinkRepository.all()) {
    try {
      const game = await getActiveGame(link.platform, link.puuid);

      if (!game) {
        if (link.lastKnownGameId !== undefined) {
          lolLinkRepository.setLastKnownGameId(discordUserId, undefined);
        }
        continue;
      }

      if (link.lastKnownGameId === game.gameId) {
        continue;
      }
      lolLinkRepository.setLastKnownGameId(discordUserId, game.gameId);

      const participant = game.participants.find((entry) => entry.puuid === link.puuid);
      if (!participant) {
        continue;
      }

      const now = Date.now();
      const queueLabel = QUEUE_ID_LABELS[game.gameQueueConfigId] ?? "Partie";

      for (const guild of client.guilds.cache.values()) {
        const channelId = guildConfigRepository.getBettingChannelId(guild.id);
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

        const embed = new EmbedBuilder()
          .setColor(Colors.Blurple)
          .setTitle(`🎲 Paris ouverts — ${member.displayName} a lancé une partie (${queueLabel})`)
          .setDescription(
            `\`/lol-bet player:@${member.user.username} side:<son équipe|équipe adverse> amount:<jetons>\`\n` +
              `Cote x${PAYOUT_MULTIPLIER} des deux côtés. Les joueurs de la partie ne peuvent pas parier dessus.\n` +
              `Paris fermés dans 5 minutes.`,
          )
          .setTimestamp();

        const message = await channel.send({ embeds: [embed] });

        const bet: OpenBet = {
          gameId: game.gameId,
          guildId: guild.id,
          channelId: channel.id,
          messageId: message.id,
          trackedDiscordUserId: discordUserId,
          trackedRiotId: `${link.gameName}#${link.tagLine}`,
          trackedTeamId: participant.teamId,
          participantPuuids: game.participants.map((entry) => entry.puuid),
          opensAt: now,
          closesAt: now + BET_WINDOW_MS,
          closed: false,
          wagers: [],
        };
        lolBetRepository.set(bet);
      }
    } catch (error) {
      if (error instanceof RiotApiError) {
        logger.warn(
          `Riot API error while checking for new games for ${discordUserId}: ${error.message}`,
        );
        continue;
      }
      logger.error(`Failed to check for a new game for ${discordUserId}.`, error);
    }
  }
}

// Marks expired-but-unresolved bets as closed and edits their message, so bettors see the
// window shut even before the tracked game finishes and the payout resolves.
export async function closeExpiredBets(client: Client): Promise<void> {
  const now = Date.now();
  for (const bet of lolBetRepository.all()) {
    if (bet.closed || now < bet.closesAt) {
      continue;
    }

    const guild = client.guilds.cache.get(bet.guildId);
    const channel = guild ? await guild.channels.fetch(bet.channelId).catch(() => null) : null;
    if (channel?.type === ChannelType.GuildText) {
      const message = await channel.messages.fetch(bet.messageId).catch(() => null);
      const existingEmbed = message?.embeds[0];
      if (message && existingEmbed) {
        const embed = EmbedBuilder.from(existingEmbed).setFooter({
          text: `Paris fermés — ${bet.wagers.length} pari(s) placé(s). En attente du résultat.`,
        });
        await message.edit({ embeds: [embed] }).catch(() => {});
      }
    }

    lolBetRepository.set({ ...bet, closed: true });
  }
}

// Called whenever a tracked player's match completes: resolves any open bet(s) tied to
// that game id (in whichever guild(s) they were opened) and pays out winners.
export async function resolveBetsForMatch(
  client: Client,
  matchId: string,
  participant: MatchParticipantDto,
): Promise<void> {
  const gameIdPart = matchId.split("_")[1];
  const gameId = gameIdPart ? Number(gameIdPart) : NaN;
  if (!Number.isFinite(gameId)) {
    return;
  }

  const winningSide: "own" | "enemy" = participant.win ? "own" : "enemy";

  for (const bet of lolBetRepository.all()) {
    if (bet.gameId !== gameId) {
      continue;
    }

    try {
      const resultLines: string[] = [];
      for (const wager of bet.wagers) {
        if (wager.side === winningSide) {
          const payout = Math.round(wager.amount * PAYOUT_MULTIPLIER);
          lolWalletRepository.adjustBalance(wager.discordUserId, payout);
          resultLines.push(
            `✅ <@${wager.discordUserId}> gagne **${payout} 🪙** (misé ${wager.amount})`,
          );
        } else {
          resultLines.push(`❌ <@${wager.discordUserId}> perd **${wager.amount} 🪙**`);
        }
      }

      const guild = client.guilds.cache.get(bet.guildId);
      const channel = guild ? await guild.channels.fetch(bet.channelId).catch(() => null) : null;
      if (channel?.type === ChannelType.GuildText) {
        const embed = new EmbedBuilder()
          .setColor(participant.win ? Colors.Green : Colors.Red)
          .setTitle(`🎲 Résultat des paris — ${bet.trackedRiotId}`)
          .setDescription(
            resultLines.length > 0
              ? resultLines.join("\n")
              : "Personne n'a parié sur cette partie.",
          )
          .setTimestamp();
        await channel.send({ embeds: [embed] }).catch((error) => {
          logger.error(`Failed to send bet results for guild ${bet.guildId}.`, error);
        });
      }
    } finally {
      lolBetRepository.remove(bet.guildId, bet.gameId);
    }
  }
}

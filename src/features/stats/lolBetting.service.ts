import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Colors,
  EmbedBuilder,
  escapeMarkdown,
  type Client,
  type TextChannel,
} from "discord.js";
import { createLogger } from "../../shared/logger/logger";
import { guildConfigRepository } from "../../shared/storage/guildConfigRepository";
import { regionalForMatchId, type CurrentGameInfoDto, type MatchDto } from "./lol.types";
import { lolBetRepository, type OpenBet } from "./lolBetRepository";
import { championEmoji } from "./lolGameEmoji";
import { lolLinkRepository } from "./lolLinkRepository";
import { BLUE_TEAM_ID, RED_TEAM_ID } from "./lolMatchViews";
import { QUEUE_ID_LABELS } from "./lolRank";
import { lolWalletRepository } from "./lolWalletRepository";
import { getActiveGame, getMatch, RiotApiError, RiotNotFoundError } from "./riotApi.service";

const logger = createLogger("lol-betting");

export const BET_BUTTON_PREFIX = "lolbet";
const BET_WINDOW_MS = 5 * 60 * 1000;
// Custom games (queue 0) never show up in match-v5, so a bet on one could never resolve.
const CUSTOM_GAME_QUEUE_ID = 0;
// A game that ends this early is a remake: nobody wins, every wager is refunded.
const REMAKE_MAX_DURATION_S = 5 * 60;
// If a match still isn't in match-v5 after this long, something went wrong (Riot outage,
// game never recorded): refund instead of keeping the jetons locked forever.
const STALE_BET_MS = 6 * 60 * 60 * 1000;
// Flat placeholder odds for both sides (no win-probability model yet): can be swapped for
// a real one later without touching the storage shape or the resolution logic.
export const PAYOUT_MULTIPLIER = 1.9;

function teamLabel(teamId: number): string {
  return teamId === BLUE_TEAM_ID ? "🔵 Équipe bleue" : "🔴 Équipe rouge";
}

function poolLine(bet: OpenBet, teamId: number): string {
  const wagers = bet.wagers.filter((wager) => wager.teamId === teamId);
  const total = wagers.reduce((sum, wager) => sum + wager.amount, 0);
  return `${teamId === BLUE_TEAM_ID ? "🔵" : "🔴"} ${wagers.length} pari${wagers.length > 1 ? "s" : ""} · ${total} 🪙`;
}

function buildBetButtons(bet: OpenBet): ActionRowBuilder<ButtonBuilder> {
  const button = (teamId: number) => {
    const owner = teamId === bet.trackedTeamId ? ` (équipe de ${bet.trackedDisplayName})` : "";
    const side = teamId === BLUE_TEAM_ID ? "Bleue" : "Rouge";
    return new ButtonBuilder()
      .setCustomId(`${BET_BUTTON_PREFIX}:pick:${bet.gameId}:${teamId}`)
      .setLabel(`Parier sur ${side}${owner}`.slice(0, 80))
      .setEmoji(teamId === BLUE_TEAM_ID ? "🔵" : "🔴")
      .setStyle(teamId === BLUE_TEAM_ID ? ButtonStyle.Primary : ButtonStyle.Danger);
  };
  return new ActionRowBuilder<ButtonBuilder>().addComponents(button(BLUE_TEAM_ID), button(RED_TEAM_ID));
}

function buildBetEmbed(bet: OpenBet, status: "open" | "closed" | "done"): EmbedBuilder {
  const closesAtSeconds = Math.floor(bet.closesAt / 1000);
  const description =
    status === "open"
      ? `Clique sur une équipe pour parier (ou \`/lol-bet\`). Cote **x${PAYOUT_MULTIPLIER}**.\n` +
        `Fermeture des paris <t:${closesAtSeconds}:R>. Les joueurs de la partie ne peuvent pas parier.`
      : status === "closed"
        ? "Paris fermés — en attente de la fin de la partie."
        : "Partie terminée — résultats ci-dessous.";

  return new EmbedBuilder()
    .setColor(status === "open" ? Colors.Blurple : Colors.Grey)
    .setTitle(`🎲 ${bet.trackedDisplayName} est en game (${bet.queueLabel})`)
    .setDescription(description)
    .addFields(
      { name: teamLabel(BLUE_TEAM_ID), value: bet.teamLines[BLUE_TEAM_ID] || "​", inline: true },
      { name: teamLabel(RED_TEAM_ID), value: bet.teamLines[RED_TEAM_ID] || "​", inline: true },
      { name: "Mises", value: `${poolLine(bet, BLUE_TEAM_ID)}\n${poolLine(bet, RED_TEAM_ID)}` },
    )
    .setTimestamp(bet.opensAt);
}

async function fetchBetChannel(client: Client, bet: OpenBet): Promise<TextChannel | null> {
  const guild = client.guilds.cache.get(bet.guildId);
  const channel = guild ? await guild.channels.fetch(bet.channelId).catch(() => null) : null;
  return channel?.type === ChannelType.GuildText ? channel : null;
}

export async function refreshBetMessage(client: Client, bet: OpenBet, status: "open" | "closed" | "done"): Promise<void> {
  const channel = await fetchBetChannel(client, bet);
  const message = channel ? await channel.messages.fetch(bet.messageId).catch(() => null) : null;
  if (!message) {
    return;
  }
  await message
    .edit({ embeds: [buildBetEmbed(bet, status)], components: status === "open" ? [buildBetButtons(bet)] : [] })
    .catch((error) => logger.warn(`Failed to edit bet message ${bet.messageId}: ${(error as Error).message}`));
}

async function buildTeamLines(game: CurrentGameInfoDto): Promise<Record<string, string>> {
  const lines: Record<string, string> = {};
  for (const teamId of [BLUE_TEAM_ID, RED_TEAM_ID]) {
    const players = game.participants.filter((participant) => participant.teamId === teamId);
    const rendered = await Promise.all(
      players.map(async (participant) => {
        const emoji = await championEmoji(participant.championId);
        const name = participant.riotId?.split("#")[0] ?? "?";
        return `${emoji} ${escapeMarkdown(name)}`;
      }),
    );
    lines[teamId] = rendered.join("\n");
  }
  return lines;
}

async function closeBet(client: Client, guildId: string, gameId: number): Promise<void> {
  const bet = lolBetRepository.get(guildId, gameId);
  if (!bet || bet.closed) {
    return;
  }
  const closed = { ...bet, closed: true };
  lolBetRepository.set(closed);
  await refreshBetMessage(client, closed, "closed");
}

function scheduleClose(client: Client, bet: OpenBet): void {
  setTimeout(
    () => {
      closeBet(client, bet.guildId, bet.gameId).catch((error) =>
        logger.error(`Failed to close bet ${bet.guildId}:${bet.gameId}.`, error),
      );
    },
    Math.max(0, bet.closesAt - Date.now()),
  );
}

// Detects a linked player starting a new game (their active-game id changed since the
// last check) and opens a bet in every guild with a betting channel where they're a member.
// If two linked friends are in the same game, only the first one detected opens a bet.
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
      if (!participant || game.gameQueueConfigId === CUSTOM_GAME_QUEUE_ID) {
        continue;
      }

      let teamLines: Record<string, string> | null = null;

      for (const guild of client.guilds.cache.values()) {
        const channelId = guildConfigRepository.getBettingChannelId(guild.id);
        if (!channelId || lolBetRepository.get(guild.id, game.gameId)) {
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

        teamLines ??= await buildTeamLines(game);
        const now = Date.now();
        const bet: OpenBet = {
          gameId: game.gameId,
          matchId: `${game.platformId}_${game.gameId}`,
          guildId: guild.id,
          channelId: channel.id,
          messageId: "",
          trackedDiscordUserId: discordUserId,
          trackedDisplayName: member.displayName,
          trackedTeamId: participant.teamId,
          queueLabel: QUEUE_ID_LABELS[game.gameQueueConfigId] ?? "Partie",
          participantTeams: Object.fromEntries(game.participants.map((entry) => [entry.puuid, entry.teamId])),
          teamLines,
          opensAt: now,
          closesAt: now + BET_WINDOW_MS,
          closed: false,
          wagers: [],
        };

        const message = await channel.send({ embeds: [buildBetEmbed(bet, "open")], components: [buildBetButtons(bet)] });
        const stored = { ...bet, messageId: message.id };
        lolBetRepository.set(stored);
        scheduleClose(client, stored);
      }
    } catch (error) {
      if (error instanceof RiotApiError) {
        logger.warn(`Riot API error while checking for new games for ${discordUserId}: ${error.message}`);
        continue;
      }
      logger.error(`Failed to check for a new game for ${discordUserId}.`, error);
    }
  }
}

// Safety net for close timers lost to a bot restart during the betting window.
export async function closeExpiredBets(client: Client): Promise<void> {
  const now = Date.now();
  for (const bet of lolBetRepository.all()) {
    if (!bet.closed && now >= bet.closesAt) {
      await closeBet(client, bet.guildId, bet.gameId);
    }
  }
}

export type WagerResult = { ok: true; message: string } | { ok: false; message: string };

// Shared by the bet buttons and /lol-bet, so both enforce exactly the same rules.
export function placeWager(bet: OpenBet, discordUserId: string, teamId: number, amount: number): WagerResult {
  if (bet.closed || Date.now() >= bet.closesAt) {
    return { ok: false, message: "Les paris sont fermés pour cette partie." };
  }
  if (!Number.isInteger(amount) || amount < 1) {
    return { ok: false, message: "La mise doit être un nombre entier positif." };
  }

  const bettorLink = lolLinkRepository.get(discordUserId);
  if (bettorLink && bet.participantTeams[bettorLink.puuid] !== undefined) {
    return { ok: false, message: "Tu ne peux pas parier sur une partie où tu joues." };
  }
  if (bet.wagers.some((wager) => wager.discordUserId === discordUserId)) {
    return { ok: false, message: "Tu as déjà parié sur cette partie." };
  }

  const balance = lolWalletRepository.getBalance(discordUserId);
  if (amount > balance) {
    return { ok: false, message: `Tu n'as que ${balance} 🪙.` };
  }

  lolWalletRepository.adjustBalance(discordUserId, -amount);
  lolBetRepository.set({ ...bet, wagers: [...bet.wagers, { discordUserId, teamId, amount }] });

  const remaining = lolWalletRepository.getBalance(discordUserId);
  return {
    ok: true,
    message:
      `Pari placé : **${amount} 🪙** sur ${teamLabel(teamId).toLowerCase()} ` +
      `(gain possible : ${Math.round(amount * PAYOUT_MULTIPLIER)} 🪙). Solde restant : ${remaining} 🪙.`,
  };
}

async function postResults(client: Client, bet: OpenBet, title: string, color: number, lines: string[]): Promise<void> {
  await refreshBetMessage(client, bet, "done");
  const channel = await fetchBetChannel(client, bet);
  if (!channel) {
    return;
  }
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(lines.length > 0 ? lines.join("\n") : "Personne n'a parié sur cette partie.")
    .setTimestamp();
  await channel
    .send({ embeds: [embed], reply: { messageReference: bet.messageId, failIfNotExists: false } })
    .catch((error) => logger.error(`Failed to send bet results for guild ${bet.guildId}.`, error));
}

async function refundBet(client: Client, bet: OpenBet, reason: string): Promise<void> {
  const lines = bet.wagers.map((wager) => {
    lolWalletRepository.adjustBalance(wager.discordUserId, wager.amount);
    return `↩️ <@${wager.discordUserId}> récupère **${wager.amount} 🪙**`;
  });
  await postResults(client, bet, `🎲 Paris remboursés — ${reason}`, Colors.Grey, lines);
}

async function payOutBet(client: Client, bet: OpenBet, match: MatchDto): Promise<void> {
  const winningTeamId = match.info.teams.find((team) => team.win)?.teamId;
  const lines = bet.wagers.map((wager) => {
    if (wager.teamId === winningTeamId) {
      const payout = Math.round(wager.amount * PAYOUT_MULTIPLIER);
      lolWalletRepository.adjustBalance(wager.discordUserId, payout);
      return `✅ <@${wager.discordUserId}> gagne **${payout} 🪙** (misé ${wager.amount})`;
    }
    return `❌ <@${wager.discordUserId}> perd **${wager.amount} 🪙**`;
  });

  const trackedWon = winningTeamId === bet.trackedTeamId;
  await postResults(
    client,
    bet,
    `🎲 ${winningTeamId ? teamLabel(winningTeamId) : "Aucune équipe"} gagne — ${bet.trackedDisplayName} ${trackedWon ? "a gagné" : "a perdu"}`,
    winningTeamId === BLUE_TEAM_ID ? Colors.Blue : Colors.Red,
    lines,
  );
}

// Checks closed bets against match-v5 directly (the match appears there a minute or so
// after the game ends), so resolution doesn't depend on the tracked player's own
// end-of-game announcement having picked up that exact game.
export async function resolveFinishedBets(client: Client): Promise<void> {
  for (const bet of lolBetRepository.all()) {
    if (!bet.closed) {
      continue;
    }
    // Still in that game according to the Spectator API: no point asking match-v5 yet.
    if (lolLinkRepository.get(bet.trackedDiscordUserId)?.lastKnownGameId === bet.gameId) {
      continue;
    }

    try {
      const regional = regionalForMatchId(bet.matchId);
      if (!regional) {
        lolBetRepository.remove(bet.guildId, bet.gameId);
        await refundBet(client, bet, "région non supportée");
        continue;
      }

      let match: MatchDto;
      try {
        match = await getMatch(regional, bet.matchId);
      } catch (error) {
        if (error instanceof RiotNotFoundError) {
          if (Date.now() - bet.opensAt > STALE_BET_MS) {
            lolBetRepository.remove(bet.guildId, bet.gameId);
            await refundBet(client, bet, "résultat introuvable");
          }
          continue;
        }
        throw error;
      }

      // Removed before paying out, so a Discord hiccup while posting results can never
      // lead to the same bet being paid twice on the next poll.
      lolBetRepository.remove(bet.guildId, bet.gameId);
      const isRemake =
        match.info.gameDuration < REMAKE_MAX_DURATION_S ||
        match.info.participants.some((participant) => participant.gameEndedInEarlySurrender);
      if (isRemake) {
        await refundBet(client, bet, "remake");
      } else {
        await payOutBet(client, bet, match);
      }
    } catch (error) {
      if (error instanceof RiotApiError) {
        logger.warn(`Riot API error while resolving bet ${bet.matchId}: ${error.message}`);
        continue;
      }
      logger.error(`Failed to resolve bet ${bet.matchId}.`, error);
    }
  }
}

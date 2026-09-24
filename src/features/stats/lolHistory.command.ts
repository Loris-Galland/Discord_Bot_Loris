import {
  ActionRowBuilder,
  Colors,
  EmbedBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import type { Command } from "../../shared/discord/command.types";
import type { ComponentHandler } from "../../shared/discord/component.types";
import { createLogger } from "../../shared/logger/logger";
import { championEmoji, parseEmojiMention, runeEmoji } from "./lolGameEmoji";
import { lolLinkRepository } from "./lolLinkRepository";
import { renderMatchView } from "./lolMatchButtons.component";
import { getCachedMatch } from "./lolMatchCache";
import { formatDuration } from "./lolMatchViews";
import { QUEUE_ID_LABELS } from "./lolRank";
import { getRecentMatchIds, RiotApiError } from "./riotApi.service";

const logger = createLogger("lol-history-command");
const DEFAULT_COUNT = 10;
const MAX_COUNT = 15;
const HISTORY_SELECT_PREFIX = "lolh";

function formatRelativeTime(timestampMs: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - timestampMs) / 60000));
  if (minutes < 60) {
    return `il y a ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `il y a ${hours}h`;
  }
  return `il y a ${Math.floor(hours / 24)}j`;
}

export const lolHistoryCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("lol-history")
    .setDescription("Show recent LoL match history (wins/losses) for a linked account.")
    .addUserOption((option) =>
      option.setName("player").setDescription("Whose linked account to check (defaults to you)."),
    )
    .addIntegerOption((option) =>
      option
        .setName("count")
        .setDescription(`How many recent matches to show (default ${DEFAULT_COUNT}, max ${MAX_COUNT}).`)
        .setMinValue(1)
        .setMaxValue(MAX_COUNT),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("player") ?? interaction.user;
    const count = interaction.options.getInteger("count") ?? DEFAULT_COUNT;
    const link = lolLinkRepository.get(target.id);

    if (!link) {
      const who = target.id === interaction.user.id ? "You haven't" : `${target.username} hasn't`;
      await interaction.reply({
        content: `${who} linked a Riot account yet. Use \`/lol-link\`.`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const matchIds = await getRecentMatchIds(link.regional, link.puuid, count);
      if (matchIds.length === 0) {
        await interaction.editReply("No recent matches found for this account.");
        return;
      }

      const lines: string[] = [];
      const menu = new StringSelectMenuBuilder()
        .setCustomId(HISTORY_SELECT_PREFIX)
        .setPlaceholder("Voir le scoreboard d'une partie…");
      let wins = 0;

      for (const matchId of matchIds) {
        const match = await getCachedMatch(matchId);
        const index = match.info.participants.findIndex((entry) => entry.puuid === link.puuid);
        const participant = match.info.participants[index];
        if (!participant) {
          continue;
        }
        if (participant.win) {
          wins += 1;
        }

        const keystone = participant.perks.styles.find((style) => style.description === "primaryStyle")
          ?.selections[0]?.perk;
        const [champion, rune] = await Promise.all([
          championEmoji(participant.championId),
          runeEmoji(keystone),
        ]);
        const endTimestamp =
          match.info.gameEndTimestamp ?? match.info.gameCreation + match.info.gameDuration * 1000;
        const cs = participant.totalMinionsKilled + participant.neutralMinionsKilled;
        const queueLabel = QUEUE_ID_LABELS[match.info.queueId] ?? "Partie";
        const kda = `${participant.kills}/${participant.deaths}/${participant.assists}`;

        lines.push(
          `${participant.win ? "✅" : "❌"} ${champion || participant.championName}${rune} ` +
            `**${kda}** · ${cs} CS · ${queueLabel} · ${formatDuration(match.info.gameDuration)} · ` +
            `<t:${Math.floor(endTimestamp / 1000)}:R>`,
        );

        const option = new StringSelectMenuOptionBuilder()
          .setLabel(`${participant.win ? "Victoire" : "Défaite"} · ${participant.championName} ${kda}`)
          .setDescription(`${queueLabel} · ${formatRelativeTime(endTimestamp)}`)
          .setValue(`${matchId}:${index}`);
        const emoji = parseEmojiMention(champion);
        if (emoji) {
          option.setEmoji(emoji);
        }
        menu.addOptions(option);
      }

      if (lines.length === 0) {
        await interaction.editReply("Could not read this player's recent matches.");
        return;
      }

      const losses = lines.length - wins;
      const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setAuthor({ name: `${link.gameName}#${link.tagLine}` })
        .setTitle(`Historique récent — ${wins}V / ${losses}D`)
        .setDescription(lines.join("\n"))
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed],
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
      });
    } catch (error) {
      if (error instanceof RiotApiError) {
        await interaction.editReply(error.message);
        return;
      }
      logger.error("Failed to fetch LoL history.", error);
      await interaction.editReply("An unexpected error occurred.");
    }
  },
};

// Picking a game in the history menu opens its scoreboard (with the graph buttons) for
// whoever picked it.
export const lolHistorySelectHandler: ComponentHandler = {
  prefix: HISTORY_SELECT_PREFIX,

  async handle(interaction) {
    if (!interaction.isStringSelectMenu()) {
      return;
    }

    const [matchId, indexRaw] = (interaction.values[0] ?? "").split(":");
    if (!matchId) {
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      await interaction.editReply(await renderMatchView("scoreboard", matchId, Number(indexRaw ?? -1)));
    } catch (error) {
      if (error instanceof RiotApiError) {
        await interaction.editReply(error.message);
        return;
      }
      logger.error(`Failed to render scoreboard for ${matchId}.`, error);
      await interaction.editReply("An unexpected error occurred.");
    }
  },
};

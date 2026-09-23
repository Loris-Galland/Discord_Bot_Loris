import { Colors, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Command } from "../../shared/discord/command.types";
import { createLogger } from "../../shared/logger/logger";
import type { LeagueEntryDto } from "./lol.types";
import { lolLinkRepository } from "./lolLinkRepository";
import { computeRankPoints, formatRank, QUEUE_LABELS } from "./lolRank";
import { getRankedEntries, RiotApiError } from "./riotApi.service";

const logger = createLogger("lol-leaderboard-command");
const MEDALS = ["🥇", "🥈", "🥉"];
const MAX_ENTRIES = 25;

interface LeaderboardRow {
  discordUserId: string;
  entry: LeagueEntryDto;
  points: number;
}

function pickBestEntry(entries: LeagueEntryDto[]): LeaderboardRow["entry"] | null {
  const ranked = entries.filter((entry) => entry.queueType in QUEUE_LABELS);
  if (ranked.length === 0) {
    return null;
  }
  return ranked.reduce((best, entry) =>
    computeRankPoints(entry) > computeRankPoints(best) ? entry : best,
  );
}

export const lolLeaderboardCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("lol-leaderboard")
    .setDescription("Show the server's ranked LoL leaderboard for linked accounts."),

  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({ content: "This command only works in a server.", ephemeral: true });
      return;
    }

    await interaction.deferReply();

    const guild = interaction.guild;
    const rows: LeaderboardRow[] = [];

    for (const [discordUserId, link] of lolLinkRepository.all()) {
      const member = await guild.members.fetch(discordUserId).catch(() => null);
      if (!member) {
        continue;
      }

      try {
        const rankedEntries = await getRankedEntries(link.platform, link.puuid);
        const best = pickBestEntry(rankedEntries);
        if (best) {
          rows.push({ discordUserId, entry: best, points: computeRankPoints(best) });
        }
      } catch (error) {
        if (error instanceof RiotApiError) {
          logger.warn(`Skipping ${discordUserId} in leaderboard: ${error.message}`);
          continue;
        }
        logger.error(`Failed to fetch ranked entries for ${discordUserId}.`, error);
      }
    }

    if (rows.length === 0) {
      await interaction.editReply("No ranked linked accounts found in this server.");
      return;
    }

    rows.sort((a, b) => b.points - a.points);

    const lines = rows.slice(0, MAX_ENTRIES).map((row, index) => {
      const rank = MEDALS[index] ?? `${index + 1}.`;
      const queueLabel = QUEUE_LABELS[row.entry.queueType] ?? row.entry.queueType;
      return `${rank} <@${row.discordUserId}> — ${formatRank(row.entry)} (${queueLabel})`;
    });

    const embed = new EmbedBuilder()
      .setColor(Colors.Gold)
      .setTitle("Classement du serveur")
      .setDescription(lines.join("\n"))
      .setFooter({
        text: `${rows.length} joueur(s) classé(s) · meilleure queue affichée par joueur`,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

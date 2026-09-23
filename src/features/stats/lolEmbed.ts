import { Colors, EmbedBuilder } from "discord.js";
import { getChampionIconUrl } from "./dataDragon.service";
import type { LeagueEntryDto, MatchDto, MatchParticipantDto } from "./lol.types";
import { buildScoreMessage } from "./scoreMessage";

const apexTiers = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

// Apex tiers (Master+) have no meaningful division, so the API's "rank" field for them
// is a meaningless placeholder — drop it rather than show something like "Challenger IV".
function formatRank(entry: LeagueEntryDto): string {
  const tier = entry.tier.charAt(0) + entry.tier.slice(1).toLowerCase();
  const division = apexTiers.has(entry.tier) ? "" : ` ${entry.rank}`;
  return `${tier}${division} · ${entry.leaguePoints} LP (${entry.wins}W ${entry.losses}L)`;
}

export async function buildMatchSummaryEmbed(
  displayName: string,
  match: MatchDto,
  participant: MatchParticipantDto,
  rankedEntries: LeagueEntryDto[],
): Promise<EmbedBuilder> {
  const cs = participant.totalMinionsKilled + participant.neutralMinionsKilled;
  const durationMinutes = Math.round(match.info.gameDuration / 60);
  const message = buildScoreMessage(
    {
      win: participant.win,
      kills: participant.kills,
      deaths: participant.deaths,
      assists: participant.assists,
    },
    participant.championName,
  );

  const embed = new EmbedBuilder()
    .setColor(participant.win ? Colors.Green : Colors.Red)
    .setAuthor({ name: displayName })
    .setTitle(participant.win ? "Victoire" : "Défaite")
    .setDescription(message)
    .addFields(
      { name: "Champion", value: participant.championName, inline: true },
      {
        name: "KDA",
        value: `${participant.kills}/${participant.deaths}/${participant.assists}`,
        inline: true,
      },
      { name: "CS", value: `${cs}`, inline: true },
      { name: "Durée", value: `${durationMinutes} min`, inline: true },
    )
    .setTimestamp();

  const soloQueueEntry = rankedEntries.find((entry) => entry.queueType === "RANKED_SOLO_5x5");
  if (soloQueueEntry) {
    embed.addFields({ name: "Solo/Duo", value: formatRank(soloQueueEntry), inline: false });
  }

  try {
    embed.setThumbnail(await getChampionIconUrl(participant.championName));
  } catch {
    // Data Dragon unreachable: ship the embed without the icon rather than fail the whole thing.
  }

  return embed;
}

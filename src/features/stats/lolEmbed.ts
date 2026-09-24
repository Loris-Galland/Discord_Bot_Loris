import { ActionRowBuilder, ButtonBuilder, Colors, EmbedBuilder } from "discord.js";
import { getChampionIconUrlById } from "./dataDragon.service";
import type { LeagueEntryDto, MatchDto, MatchParticipantDto } from "./lol.types";
import { getParticipantEmojis } from "./lolGameEmoji";
import { buildMatchButtons, formatDuration } from "./lolMatchViews";
import { formatRank } from "./lolRank";
import { buildScoreMessage } from "./scoreMessage";

export interface MatchSummaryMessage {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}

export async function buildMatchSummaryEmbed(
  displayName: string,
  match: MatchDto,
  participant: MatchParticipantDto,
  rankedEntries: LeagueEntryDto[],
): Promise<MatchSummaryMessage> {
  const cs = participant.totalMinionsKilled + participant.neutralMinionsKilled;
  const killParticipation = participant.challenges?.killParticipation;
  const emojis = await getParticipantEmojis(participant);
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
      {
        name: "Champion",
        value: `${emojis.champion} ${participant.championName} (niv. ${participant.champLevel})`,
        inline: true,
      },
      {
        name: "KDA",
        value: `${participant.kills}/${participant.deaths}/${participant.assists}`,
        inline: true,
      },
      { name: "CS", value: `${cs}`, inline: true },
      { name: "Durée", value: formatDuration(match.info.gameDuration), inline: true },
    )
    .setTimestamp();

  if (killParticipation !== undefined) {
    embed.addFields({ name: "KP", value: `${Math.round(killParticipation * 100)}%`, inline: true });
  }

  const build = `${emojis.spells} ${emojis.runes} ${emojis.items}`.trim();
  if (build) {
    embed.addFields({ name: "Build", value: build, inline: false });
  }

  const soloQueueEntry = rankedEntries.find((entry) => entry.queueType === "RANKED_SOLO_5x5");
  if (soloQueueEntry) {
    embed.addFields({ name: "Solo/Duo", value: formatRank(soloQueueEntry), inline: false });
  }

  try {
    const iconUrl = await getChampionIconUrlById(participant.championId);
    if (iconUrl) {
      embed.setThumbnail(iconUrl);
    }
  } catch {
    // Data Dragon unreachable: ship the embed without the icon rather than fail the whole thing.
  }

  const trackedIndex = match.info.participants.indexOf(participant);
  const buttons = buildMatchButtons(match.metadata.matchId, trackedIndex, [
    "scoreboard",
    "gold",
    "damage",
    "items",
    "events",
  ]);

  return { embeds: [embed], components: [buttons] };
}

import { AttachmentBuilder, Colors, EmbedBuilder } from "discord.js";
import { createLogger } from "../../shared/logger/logger";
import { getChampionIconUrl } from "./dataDragon.service";
import type { LeagueEntryDto, MatchDto, MatchParticipantDto } from "./lol.types";
import { formatRank } from "./lolRank";
import { buildLoadoutImage } from "./lolLoadoutImage";
import { buildScoreMessage } from "./scoreMessage";

const logger = createLogger("lol-embed");
const LOADOUT_ATTACHMENT_NAME = "loadout.png";

export interface MatchSummaryMessage {
  embed: EmbedBuilder;
  files: AttachmentBuilder[];
}

export async function buildMatchSummaryEmbed(
  displayName: string,
  match: MatchDto,
  participant: MatchParticipantDto,
  rankedEntries: LeagueEntryDto[],
): Promise<MatchSummaryMessage> {
  const cs = participant.totalMinionsKilled + participant.neutralMinionsKilled;
  const durationMinutes = Math.round(match.info.gameDuration / 60);
  const killParticipation = participant.challenges?.killParticipation;
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
        value: `${participant.championName} (niv. ${participant.champLevel})`,
        inline: true,
      },
      {
        name: "KDA",
        value: `${participant.kills}/${participant.deaths}/${participant.assists}`,
        inline: true,
      },
      { name: "CS", value: `${cs}`, inline: true },
      { name: "Durée", value: `${durationMinutes} min`, inline: true },
    )
    .setTimestamp();

  if (killParticipation !== undefined) {
    embed.addFields({ name: "KP", value: `${Math.round(killParticipation * 100)}%`, inline: true });
  }

  const soloQueueEntry = rankedEntries.find((entry) => entry.queueType === "RANKED_SOLO_5x5");
  if (soloQueueEntry) {
    embed.addFields({ name: "Solo/Duo", value: formatRank(soloQueueEntry), inline: false });
  }

  try {
    embed.setThumbnail(await getChampionIconUrl(participant.championName));
  } catch {
    // Data Dragon unreachable: ship the embed without the icon rather than fail the whole thing.
  }

  const files: AttachmentBuilder[] = [];
  try {
    const loadoutBuffer = await buildLoadoutImage(participant);
    const attachment = new AttachmentBuilder(loadoutBuffer, { name: LOADOUT_ATTACHMENT_NAME });
    embed.setImage(`attachment://${LOADOUT_ATTACHMENT_NAME}`);
    files.push(attachment);
  } catch (error) {
    logger.warn("Failed to build loadout image, shipping the embed without it.", error);
  }

  return { embed, files };
}

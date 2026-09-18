import {
  Attachment,
  ChannelType,
  ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  Guild,
  TextChannel,
} from "discord.js";

export type ReactionType = "gif" | "image" | "video" | "text";

export interface MediaReactionPayload {
  type: "gif" | "image" | "video";
  attachment: Attachment | null;
  url: string | null;
}

export interface TextReactionPayload {
  type: "text";
  message: string;
}

export type ReactionPayload = MediaReactionPayload | TextReactionPayload;

export class LivechatRelayError extends Error {}

const colorByType: Record<ReactionType, number> = {
  gif: Colors.Fuchsia,
  image: Colors.Blurple,
  video: Colors.Red,
  text: Colors.Greyple,
};

// A media reaction must come from either an attachment or a URL, never both nor neither.
function assertExactlyOneMediaSource(attachment: Attachment | null, url: string | null): void {
  if (!attachment && !url) {
    throw new LivechatRelayError("Provide a file or a URL.");
  }
  if (attachment && url) {
    throw new LivechatRelayError("Provide either a file or a URL, not both.");
  }
}

async function resolveRelayChannel(guild: Guild, channelId: string): Promise<TextChannel> {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new LivechatRelayError(
      "The configured livechat channel no longer exists or isn't a text channel. Reconfigure it with /livechat-config.",
    );
  }
  return channel;
}

function buildReactionEmbed(
  interaction: ChatInputCommandInteraction,
  payload: ReactionPayload,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(colorByType[payload.type])
    .setAuthor({
      name: interaction.user.displayName,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setTimestamp();

  if (payload.type === "text") {
    embed.setDescription(payload.message);
    return embed;
  }

  const mediaUrl = payload.attachment?.url ?? payload.url;
  if (payload.type === "video") {
    embed.setDescription(mediaUrl ?? "");
  } else {
    embed.setImage(mediaUrl ?? null);
  }
  return embed;
}

export async function relayReaction(
  interaction: ChatInputCommandInteraction,
  channelId: string,
  payload: ReactionPayload,
): Promise<void> {
  if (payload.type !== "text") {
    assertExactlyOneMediaSource(payload.attachment, payload.url);
  }

  const guild = interaction.guild;
  if (!guild) {
    throw new LivechatRelayError("This command only works in a server.");
  }

  const relayChannel = await resolveRelayChannel(guild, channelId);
  const embed = buildReactionEmbed(interaction, payload);
  const attachment = payload.type !== "text" ? payload.attachment : null;

  await relayChannel.send({
    embeds: [embed],
    files: attachment ? [attachment] : undefined,
  });
}

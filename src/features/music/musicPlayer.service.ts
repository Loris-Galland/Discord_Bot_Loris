import {
  AudioPlayerStatus,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from "@discordjs/voice";
import type { ChatInputCommandInteraction, GuildMember, VoiceBasedChannel } from "discord.js";
import { createLogger } from "../../shared/logger/logger";
import { createQueue, deleteQueue, getQueue } from "./musicQueueManager";
import { createTrackAudioStream } from "./musicStream.service";
import type { GuildMusicQueue, Track } from "./music.types";

const logger = createLogger("music-player");

export class MusicPlaybackError extends Error {}

// Connects the bot to the requester's voice channel, creating the guild's queue on first use.
// Subsequent /play calls in the same guild reuse the existing connection and queue.
export async function ensureQueue(interaction: ChatInputCommandInteraction): Promise<GuildMusicQueue> {
  const guildId = interaction.guildId;
  if (!guildId) {
    throw new MusicPlaybackError("This command only works in a server.");
  }

  const existing = getQueue(guildId);
  if (existing) {
    return existing;
  }

  const voiceChannel = getMemberVoiceChannel(interaction);
  const audioPlayer = createAudioPlayer();
  const queue = createQueue(guildId, interaction.channelId, audioPlayer);

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
  });
  await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
  connection.subscribe(audioPlayer);
  queue.voiceConnection = connection;

  // Move to the next track whenever the current one finishes, errors, or gets skipped.
  audioPlayer.on(AudioPlayerStatus.Idle, () => {
    void playNext(guildId);
  });
  audioPlayer.on("error", (error) => {
    logger.error("Audio player error, skipping track.", error);
    void playNext(guildId);
  });

  return queue;
}

function getMemberVoiceChannel(interaction: ChatInputCommandInteraction): VoiceBasedChannel {
  const member = interaction.member as GuildMember | null;
  const voiceChannel = member?.voice.channel;
  if (!voiceChannel) {
    throw new MusicPlaybackError("Join a voice channel first.");
  }
  return voiceChannel;
}

export function enqueueTrack(guildId: string, track: Track): void {
  const queue = getQueue(guildId);
  if (!queue) {
    throw new MusicPlaybackError("No active queue for this server.");
  }

  queue.tracks.push(track);

  if (!queue.currentTrack) {
    void playNext(guildId);
  }
}

async function playNext(guildId: string): Promise<void> {
  const queue = getQueue(guildId);
  if (!queue) {
    return;
  }

  killCurrentProcess(queue);
  const nextTrack = queue.tracks.shift();
  queue.currentTrack = nextTrack ?? null;

  if (!nextTrack) {
    return;
  }

  try {
    const ffmpegProcess = await createTrackAudioStream(nextTrack.url);
    queue.currentProcess = ffmpegProcess;
    const resource = createAudioResource(ffmpegProcess.stdout, { inputType: StreamType.Raw });
    queue.audioPlayer.play(resource);
  } catch (error) {
    logger.error(`Failed to stream track "${nextTrack.title}", skipping.`, error);
    void playNext(guildId);
  }
}

// ffmpeg keeps transcoding in the background even past the point Discord stops reading
// from it, so we kill it explicitly on every track transition to avoid orphaned processes.
function killCurrentProcess(queue: GuildMusicQueue): void {
  queue.currentProcess?.kill("SIGKILL");
  queue.currentProcess = null;
}

export function skipTrack(guildId: string): void {
  const queue = getQueue(guildId);
  if (!queue) {
    throw new MusicPlaybackError("No active queue for this server.");
  }
  queue.audioPlayer.stop();
}

export function stopPlayback(guildId: string): void {
  const queue = getQueue(guildId);
  if (!queue) {
    throw new MusicPlaybackError("No active queue for this server.");
  }

  killCurrentProcess(queue);
  queue.tracks = [];
  queue.currentTrack = null;
  queue.voiceConnection?.destroy();
  deleteQueue(guildId);
}

import type { AudioPlayer } from "@discordjs/voice";
import type { GuildMusicQueue } from "./music.types";

// One queue per guild, kept in memory. If the process restarts, playback simply stops
// and users re-run /play — there's no need to persist this to disk.
const queues = new Map<string, GuildMusicQueue>();

export function getQueue(guildId: string): GuildMusicQueue | undefined {
  return queues.get(guildId);
}

export function createQueue(guildId: string, textChannelId: string, audioPlayer: AudioPlayer): GuildMusicQueue {
  const queue: GuildMusicQueue = {
    tracks: [],
    currentTrack: null,
    currentProcess: null,
    audioPlayer,
    voiceConnection: null,
    textChannelId,
  };
  queues.set(guildId, queue);
  return queue;
}

export function deleteQueue(guildId: string): void {
  queues.delete(guildId);
}

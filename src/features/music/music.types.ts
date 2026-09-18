import type { AudioPlayer, VoiceConnection } from "@discordjs/voice";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

export interface Track {
  title: string;
  url: string;
  durationSeconds: number;
  requestedByTag: string;
}

export interface GuildMusicQueue {
  tracks: Track[];
  currentTrack: Track | null;
  currentProcess: ChildProcessWithoutNullStreams | null;
  audioPlayer: AudioPlayer;
  voiceConnection: VoiceConnection | null;
  textChannelId: string;
}

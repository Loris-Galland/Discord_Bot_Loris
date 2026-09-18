import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { createLogger } from "../../shared/logger/logger";
import { runYtDlp } from "./ytdlp";

const logger = createLogger("music-stream");

// yt-dlp resolves a short-lived direct CDN URL for the track's best audio format.
// We re-resolve this right before playback instead of caching it, since these URLs expire.
async function resolveDirectAudioUrl(youtubeUrl: string): Promise<string> {
  const stdout = await runYtDlp(["-f", "bestaudio", "-g", "--no-playlist", youtubeUrl]);
  const directUrl = stdout.trim().split("\n")[0];
  if (!directUrl) {
    throw new Error("Could not resolve an audio stream for this track.");
  }
  return directUrl;
}

// ffmpeg reads the direct CDN URL and transcodes it to raw PCM on stdout, which
// @discordjs/voice then encodes to Opus (via opusscript) before sending it to Discord.
function spawnFfmpegStream(directUrl: string): ChildProcessWithoutNullStreams {
  if (!ffmpegPath) {
    throw new Error("ffmpeg binary not found. Reinstall the ffmpeg-static dependency.");
  }

  const ffmpegProcess = spawn(ffmpegPath, [
    "-reconnect",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_delay_max",
    "5",
    "-i",
    directUrl,
    "-analyzeduration",
    "0",
    "-loglevel",
    "warning",
    "-f",
    "s16le",
    "-ar",
    "48000",
    "-ac",
    "2",
    "pipe:1",
  ]);

  ffmpegProcess.stderr.on("data", (chunk: Buffer) => logger.debug(chunk.toString().trim()));

  return ffmpegProcess;
}

export async function createTrackAudioStream(youtubeUrl: string): Promise<ChildProcessWithoutNullStreams> {
  const directUrl = await resolveDirectAudioUrl(youtubeUrl);
  return spawnFfmpegStream(directUrl);
}

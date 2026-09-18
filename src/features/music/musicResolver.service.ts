import { getSpotifyTrackMetadata, parseSpotifyTrackId } from "./spotifyClient.service";
import { runYtDlp } from "./ytdlp";
import type { Track } from "./music.types";

export class MusicResolutionError extends Error {}

const youtubeUrlPattern = /(?:youtube\.com|youtu\.be)\//i;

interface YtDlpVideoInfo {
  title?: string;
  webpage_url?: string;
  duration?: number;
  entries?: YtDlpVideoInfo[];
}

// Turns a raw user query (YouTube URL, Spotify track URL, or free text) into a single
// playable track. Playlists aren't supported yet — only single tracks.
export async function resolveTrack(query: string, requestedByTag: string): Promise<Track> {
  const spotifyTrackId = parseSpotifyTrackId(query);
  if (spotifyTrackId) {
    const metadata = await getSpotifyTrackMetadata(spotifyTrackId);
    return searchYoutube(`${metadata.artist} - ${metadata.title}`, requestedByTag);
  }

  if (youtubeUrlPattern.test(query)) {
    return lookupYoutubeUrl(query, requestedByTag);
  }

  return searchYoutube(query, requestedByTag);
}

async function lookupYoutubeUrl(url: string, requestedByTag: string): Promise<Track> {
  const stdout = await runYtDlp(["--dump-single-json", "--no-playlist", "--no-warnings", url]);
  const info = JSON.parse(stdout) as YtDlpVideoInfo;

  if (!info.webpage_url) {
    throw new MusicResolutionError("Could not read that YouTube link.");
  }

  return toTrack(info, requestedByTag);
}

// yt-dlp treats "ytsearch1:<query>" as a virtual URL and resolves it to the top result,
// wrapped in a one-entry playlist object.
async function searchYoutube(query: string, requestedByTag: string): Promise<Track> {
  const stdout = await runYtDlp([
    "--dump-single-json",
    "--no-playlist",
    "--no-warnings",
    `ytsearch1:${query}`,
  ]);
  const info = JSON.parse(stdout) as YtDlpVideoInfo;

  const result = info.entries?.[0] ?? info;
  if (!result.webpage_url) {
    throw new MusicResolutionError(`No results found for "${query}".`);
  }

  return toTrack(result, requestedByTag);
}

function toTrack(info: YtDlpVideoInfo, requestedByTag: string): Track {
  return {
    title: info.title ?? info.webpage_url ?? "Unknown track",
    url: info.webpage_url as string,
    durationSeconds: info.duration ?? 0,
    requestedByTag,
  };
}

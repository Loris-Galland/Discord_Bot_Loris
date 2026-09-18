import { config } from "../../shared/config/env";
import { createLogger } from "../../shared/logger/logger";

const logger = createLogger("spotify-client");
const spotifyTrackUrlPattern = /open\.spotify\.com\/track\/([a-zA-Z0-9]+)/;

interface SpotifyTrackMetadata {
  title: string;
  artist: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

export function parseSpotifyTrackId(query: string): string | null {
  const match = query.match(spotifyTrackUrlPattern);
  return match?.[1] ?? null;
}

// Spotify's own audio can't be streamed (DRM/ToS): we only use the Client Credentials
// flow to read public track metadata, then hand the artist/title off to a YouTube search.
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  if (!config.spotifyClientId || !config.spotifyClientSecret) {
    throw new Error("Spotify support requires SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.");
  }

  const credentials = Buffer.from(`${config.spotifyClientId}:${config.spotifyClientSecret}`).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error(`Spotify authentication failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    // Refresh a minute early so we never play with an about-to-expire token.
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.accessToken;
}

export async function getSpotifyTrackMetadata(trackId: string): Promise<SpotifyTrackMetadata> {
  const accessToken = await getAccessToken();
  const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Could not fetch Spotify track metadata: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { name: string; artists: { name: string }[] };
  logger.debug(`Fetched Spotify metadata for track ${trackId}`);

  return {
    title: data.name,
    artist: data.artists.map((artist) => artist.name).join(", "),
  };
}

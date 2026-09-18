import "dotenv/config";

interface AppConfig {
  discordToken: string;
  discordClientId: string;
  discordGuildId: string | undefined;
  spotifyClientId: string | undefined;
  spotifyClientSecret: string | undefined;
}

function readRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

export const config: AppConfig = {
  discordToken: readRequiredEnv("DISCORD_TOKEN"),
  discordClientId: readRequiredEnv("DISCORD_CLIENT_ID"),
  discordGuildId: process.env.DISCORD_GUILD_ID || undefined,
  // Optional: only required for resolving Spotify links in the music feature.
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID || undefined,
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET || undefined,
};

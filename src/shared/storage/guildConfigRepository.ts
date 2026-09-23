import fs from "node:fs";
import path from "node:path";
import { createLogger } from "../logger/logger";

const logger = createLogger("guild-config");
const storageFilePath = path.join(process.cwd(), "data", "guild-config.json");

interface GuildConfig {
  livechatChannelId?: string;
  statsChannelId?: string;
  livePanelChannelId?: string;
  livePanelMessageId?: string;
  bettingChannelId?: string;
}

type GuildConfigStore = Record<string, GuildConfig>;

function readStore(): GuildConfigStore {
  try {
    const raw = fs.readFileSync(storageFilePath, "utf-8");
    return JSON.parse(raw) as GuildConfigStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    logger.error("Could not read the guild config file, resetting.", error);
    return {};
  }
}

function writeStore(store: GuildConfigStore): void {
  fs.mkdirSync(path.dirname(storageFilePath), { recursive: true });
  fs.writeFileSync(storageFilePath, JSON.stringify(store, null, 2), "utf-8");
}

let store = readStore();

export const guildConfigRepository = {
  getLivechatChannelId(guildId: string): string | undefined {
    return store[guildId]?.livechatChannelId;
  },

  setLivechatChannelId(guildId: string, channelId: string): void {
    store = {
      ...store,
      [guildId]: { ...store[guildId], livechatChannelId: channelId },
    };
    writeStore(store);
  },

  getStatsChannelId(guildId: string): string | undefined {
    return store[guildId]?.statsChannelId;
  },

  setStatsChannelId(guildId: string, channelId: string): void {
    store = {
      ...store,
      [guildId]: { ...store[guildId], statsChannelId: channelId },
    };
    writeStore(store);
  },

  getLivePanel(guildId: string): { channelId: string; messageId: string } | undefined {
    const config = store[guildId];
    if (!config?.livePanelChannelId || !config.livePanelMessageId) {
      return undefined;
    }
    return { channelId: config.livePanelChannelId, messageId: config.livePanelMessageId };
  },

  setLivePanel(guildId: string, channelId: string, messageId: string): void {
    store = {
      ...store,
      [guildId]: {
        ...store[guildId],
        livePanelChannelId: channelId,
        livePanelMessageId: messageId,
      },
    };
    writeStore(store);
  },

  getBettingChannelId(guildId: string): string | undefined {
    return store[guildId]?.bettingChannelId;
  },

  setBettingChannelId(guildId: string, channelId: string): void {
    store = {
      ...store,
      [guildId]: { ...store[guildId], bettingChannelId: channelId },
    };
    writeStore(store);
  },
};

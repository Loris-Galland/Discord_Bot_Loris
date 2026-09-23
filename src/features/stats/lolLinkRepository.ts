import fs from "node:fs";
import path from "node:path";
import { createLogger } from "../../shared/logger/logger";
import type { RegionalRouting } from "./lol.types";

const logger = createLogger("lol-link");
const storageFilePath = path.join(process.cwd(), "data", "lol-links.json");

export interface LolLink {
  puuid: string;
  gameName: string;
  tagLine: string;
  platform: string;
  regional: RegionalRouting;
  lastSeenMatchId?: string;
}

type LolLinkStore = Record<string, LolLink>;

function readStore(): LolLinkStore {
  try {
    const raw = fs.readFileSync(storageFilePath, "utf-8");
    return JSON.parse(raw) as LolLinkStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    logger.error("Could not read the LoL links file, resetting.", error);
    return {};
  }
}

function writeStore(store: LolLinkStore): void {
  fs.mkdirSync(path.dirname(storageFilePath), { recursive: true });
  fs.writeFileSync(storageFilePath, JSON.stringify(store, null, 2), "utf-8");
}

let store = readStore();

export const lolLinkRepository = {
  get(discordUserId: string): LolLink | undefined {
    return store[discordUserId];
  },

  set(discordUserId: string, link: LolLink): void {
    store = { ...store, [discordUserId]: link };
    writeStore(store);
  },

  remove(discordUserId: string): void {
    if (!(discordUserId in store)) {
      return;
    }
    const next = { ...store };
    delete next[discordUserId];
    store = next;
    writeStore(store);
  },

  setLastSeenMatchId(discordUserId: string, matchId: string): void {
    const existing = store[discordUserId];
    if (!existing) {
      return;
    }
    store = { ...store, [discordUserId]: { ...existing, lastSeenMatchId: matchId } };
    writeStore(store);
  },

  all(): [string, LolLink][] {
    return Object.entries(store);
  },
};

import fs from "node:fs";
import path from "node:path";
import { createLogger } from "../../shared/logger/logger";
import type { RegionalRouting } from "./lol.types";

const logger = createLogger("lol-link");
const storageFilePath = path.join(process.cwd(), "data", "lol-links.json");

export interface PeriodStats {
  lpDelta: number;
  games: number;
}

export type RecapPeriod = "daily" | "weekly" | "monthly";

export interface QueueProgress {
  lastPoints: number;
  daily: PeriodStats;
  weekly: PeriodStats;
  monthly: PeriodStats;
}

export interface LolLink {
  puuid: string;
  gameName: string;
  tagLine: string;
  platform: string;
  regional: RegionalRouting;
  lastSeenMatchId?: string;
  queueProgress?: Record<string, QueueProgress>;
  lastKnownGameId?: number;
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

  // Tracks the game the player was last seen in, so a new game start can be detected
  // (used to open bets). undefined clears it (the player left/finished their game).
  setLastKnownGameId(discordUserId: string, gameId: number | undefined): void {
    const existing = store[discordUserId];
    if (!existing) {
      return;
    }
    const next = { ...existing };
    if (gameId === undefined) {
      delete next.lastKnownGameId;
    } else {
      next.lastKnownGameId = gameId;
    }
    store = { ...store, [discordUserId]: next };
    writeStore(store);
  },

  setQueueProgress(discordUserId: string, queueType: string, progress: QueueProgress): void {
    const existing = store[discordUserId];
    if (!existing) {
      return;
    }
    store = {
      ...store,
      [discordUserId]: {
        ...existing,
        queueProgress: { ...existing.queueProgress, [queueType]: progress },
      },
    };
    writeStore(store);
  },

  // Called once a recap for the given period has been posted: keeps each queue's last
  // known rank (needed to compute the next delta) but zeroes that period's accumulated
  // totals. The other periods' accumulators are untouched (e.g. a nightly reset doesn't
  // touch the weekly/monthly totals).
  resetPeriodProgress(period: RecapPeriod): void {
    const next: LolLinkStore = {};
    for (const [discordUserId, link] of Object.entries(store)) {
      if (!link.queueProgress) {
        next[discordUserId] = link;
        continue;
      }
      const queueProgress: Record<string, QueueProgress> = {};
      for (const [queueType, progress] of Object.entries(link.queueProgress)) {
        queueProgress[queueType] = { ...progress, [period]: { lpDelta: 0, games: 0 } };
      }
      next[discordUserId] = { ...link, queueProgress };
    }
    store = next;
    writeStore(store);
  },

  all(): [string, LolLink][] {
    return Object.entries(store);
  },
};

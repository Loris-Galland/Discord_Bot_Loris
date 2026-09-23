import fs from "node:fs";
import path from "node:path";

const storageFilePath = path.join(process.cwd(), "data", "lol-bets.json");

export interface Wager {
  discordUserId: string;
  side: "own" | "enemy"; // relative to the tracked player's team
  amount: number;
}

export interface OpenBet {
  gameId: number;
  guildId: string;
  channelId: string;
  messageId: string;
  trackedDiscordUserId: string;
  trackedRiotId: string;
  trackedTeamId: number;
  participantPuuids: string[];
  opensAt: number;
  closesAt: number;
  closed: boolean;
  wagers: Wager[];
}

type BetStore = Record<string, OpenBet>;

// Keyed by guild+game rather than just game: the same physical match can have an open bet
// in more than one guild if the tracked player belongs to several with betting configured.
function storeKey(guildId: string, gameId: number): string {
  return `${guildId}:${gameId}`;
}

function readStore(): BetStore {
  try {
    const raw = fs.readFileSync(storageFilePath, "utf-8");
    return JSON.parse(raw) as BetStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    return {};
  }
}

function writeStore(store: BetStore): void {
  fs.mkdirSync(path.dirname(storageFilePath), { recursive: true });
  fs.writeFileSync(storageFilePath, JSON.stringify(store, null, 2), "utf-8");
}

let store = readStore();

export const lolBetRepository = {
  get(guildId: string, gameId: number): OpenBet | undefined {
    return store[storeKey(guildId, gameId)];
  },

  set(bet: OpenBet): void {
    store = { ...store, [storeKey(bet.guildId, bet.gameId)]: bet };
    writeStore(store);
  },

  remove(guildId: string, gameId: number): void {
    const key = storeKey(guildId, gameId);
    if (!(key in store)) {
      return;
    }
    const next = { ...store };
    delete next[key];
    store = next;
    writeStore(store);
  },

  all(): OpenBet[] {
    return Object.values(store);
  },
};

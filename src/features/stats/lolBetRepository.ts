import fs from "node:fs";
import path from "node:path";

const storageFilePath = path.join(process.cwd(), "data", "lol-bets.json");

export interface Wager {
  discordUserId: string;
  teamId: number; // 100 = blue, 200 = red
  amount: number;
}

export interface OpenBet {
  gameId: number;
  matchId: string; // "<PLATFORM>_<gameId>", what match-v5 will list the game under once it ends
  guildId: string;
  channelId: string;
  messageId: string;
  trackedDiscordUserId: string;
  trackedDisplayName: string;
  trackedTeamId: number;
  queueLabel: string;
  // puuid -> teamId for all 10 players: blocks players from betting on their own game and
  // lets /lol-bet resolve "his team / the enemy team" for any linked player in the game.
  participantTeams: Record<string, number>;
  // Pre-rendered team compositions (champion emojis + names), kept so the bet message
  // can be re-rendered on every wager without calling the Spectator API again.
  teamLines: Record<string, string>;
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

  // The still-open bet (if any) on the game a given player is currently in.
  findOpenForPlayer(guildId: string, puuid: string): OpenBet | undefined {
    return Object.values(store).find(
      (bet) => bet.guildId === guildId && !bet.closed && bet.participantTeams[puuid] !== undefined,
    );
  },
};

import fs from "node:fs";
import path from "node:path";

const storageFilePath = path.join(process.cwd(), "data", "lol-wallets.json");
const STARTING_BALANCE = 1000;

type WalletStore = Record<string, number>;

function readStore(): WalletStore {
  try {
    const raw = fs.readFileSync(storageFilePath, "utf-8");
    return JSON.parse(raw) as WalletStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    return {};
  }
}

function writeStore(store: WalletStore): void {
  fs.mkdirSync(path.dirname(storageFilePath), { recursive: true });
  fs.writeFileSync(storageFilePath, JSON.stringify(store, null, 2), "utf-8");
}

let store = readStore();

export const lolWalletRepository = {
  getBalance(discordUserId: string): number {
    return store[discordUserId] ?? STARTING_BALANCE;
  },

  adjustBalance(discordUserId: string, delta: number): number {
    const next = (store[discordUserId] ?? STARTING_BALANCE) + delta;
    store = { ...store, [discordUserId]: next };
    writeStore(store);
    return next;
  },
};

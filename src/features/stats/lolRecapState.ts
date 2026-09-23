import fs from "node:fs";
import path from "node:path";
import type { RecapPeriod } from "./lolLinkRepository";

const storageFilePath = path.join(process.cwd(), "data", "lol-recap-state.json");

type RecapState = Partial<Record<RecapPeriod, string>>;

function readState(): RecapState {
  try {
    const raw = fs.readFileSync(storageFilePath, "utf-8");
    return JSON.parse(raw) as RecapState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    return {};
  }
}

function writeState(state: RecapState): void {
  fs.mkdirSync(path.dirname(storageFilePath), { recursive: true });
  fs.writeFileSync(storageFilePath, JSON.stringify(state, null, 2), "utf-8");
}

let state = readState();

export const lolRecapState = {
  getLastDate(period: RecapPeriod): string | undefined {
    return state[period];
  },

  setLastDate(period: RecapPeriod, date: string): void {
    state = { ...state, [period]: date };
    writeState(state);
  },
};

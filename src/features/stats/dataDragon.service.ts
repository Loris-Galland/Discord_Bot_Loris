interface CachedVersion {
  value: string;
  fetchedAt: number;
}

let cachedVersion: CachedVersion | null = null;
const VERSION_CACHE_MS = 60 * 60 * 1000;

async function getLatestVersion(): Promise<string> {
  if (cachedVersion && Date.now() - cachedVersion.fetchedAt < VERSION_CACHE_MS) {
    return cachedVersion.value;
  }

  const response = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
  if (!response.ok) {
    throw new Error(
      `Could not fetch Data Dragon versions: ${response.status} ${response.statusText}`,
    );
  }

  const versions = (await response.json()) as string[];
  const latest = versions[0];
  if (!latest) {
    throw new Error("Data Dragon returned no versions.");
  }

  cachedVersion = { value: latest, fetchedAt: Date.now() };
  return latest;
}

export async function getChampionIconUrl(championName: string): Promise<string> {
  const version = await getLatestVersion();
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championName}.png`;
}

// Champion ids from match-v5/spectator-v5 need mapping to their Data Dragon string id
// (e.g. 266 -> "Aatrox") to build icon URLs or show a readable name.
let cachedChampionMap: Record<number, string> | null = null;

async function getChampionMap(): Promise<Record<number, string>> {
  if (cachedChampionMap) {
    return cachedChampionMap;
  }

  const version = await getLatestVersion();
  const response = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
  );
  if (!response.ok) {
    throw new Error(
      `Could not fetch Data Dragon champions: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as { data: Record<string, { key: string; id: string }> };
  const map: Record<number, string> = {};
  for (const champion of Object.values(data.data)) {
    map[Number(champion.key)] = champion.id;
  }

  cachedChampionMap = map;
  return map;
}

export async function getChampionNameById(championId: number): Promise<string | null> {
  const map = await getChampionMap();
  return map[championId] ?? null;
}

// Goes through the numeric id rather than match-v5's championName, which doesn't always
// match Data Dragon's file names (e.g. "FiddleSticks" vs "Fiddlesticks").
export async function getChampionIconUrlById(championId: number): Promise<string | null> {
  const name = await getChampionNameById(championId);
  return name ? getChampionIconUrl(name) : null;
}

export async function getAllChampionIds(): Promise<number[]> {
  return Object.keys(await getChampionMap()).map(Number);
}

export async function getItemIconUrl(itemId: number): Promise<string | null> {
  if (!itemId) {
    return null;
  }
  const version = await getLatestVersion();
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`;
}

// Summoner spell icons are filed under a string id (e.g. "SummonerFlash"), not the numeric
// id the match API gives us, so we cache the numeric-id -> string-id map from summoner.json.
let cachedSummonerSpellMap: Record<number, string> | null = null;

async function getSummonerSpellMap(): Promise<Record<number, string>> {
  if (cachedSummonerSpellMap) {
    return cachedSummonerSpellMap;
  }

  const version = await getLatestVersion();
  const response = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/summoner.json`,
  );
  if (!response.ok) {
    throw new Error(
      `Could not fetch Data Dragon summoner spells: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as { data: Record<string, { id: string; key: string }> };
  const map: Record<number, string> = {};
  for (const spell of Object.values(data.data)) {
    map[Number(spell.key)] = spell.id;
  }

  cachedSummonerSpellMap = map;
  return map;
}

export async function getAllSummonerSpellIds(): Promise<number[]> {
  return Object.keys(await getSummonerSpellMap()).map(Number);
}

export async function getSummonerSpellIconUrl(spellId: number): Promise<string | null> {
  const map = await getSummonerSpellMap();
  const id = map[spellId];
  if (!id) {
    return null;
  }
  const version = await getLatestVersion();
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${id}.png`;
}

// Rune (and rune tree) icons live at a fixed, version-less CDN path given by
// runesReforged.json — cache the id -> path map (both individual runes and the tree
// styles themselves, since a secondary tree is shown by its style icon, not a rune pick).
let cachedRuneIconMap: Record<number, string> | null = null;

async function getRuneIconMap(): Promise<Record<number, string>> {
  if (cachedRuneIconMap) {
    return cachedRuneIconMap;
  }

  const version = await getLatestVersion();
  const response = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/runesReforged.json`,
  );
  if (!response.ok) {
    throw new Error(`Could not fetch Data Dragon runes: ${response.status} ${response.statusText}`);
  }

  const styles = (await response.json()) as {
    id: number;
    icon: string;
    slots: { runes: { id: number; icon: string }[] }[];
  }[];

  const map: Record<number, string> = {};
  for (const style of styles) {
    map[style.id] = style.icon;
    for (const slot of style.slots) {
      for (const rune of slot.runes) {
        map[rune.id] = rune.icon;
      }
    }
  }

  cachedRuneIconMap = map;
  return map;
}

export async function getRuneIconUrl(runeOrStyleId: number): Promise<string | null> {
  const map = await getRuneIconMap();
  const iconPath = map[runeOrStyleId];
  if (!iconPath) {
    return null;
  }
  return `https://ddragon.leagueoflegends.com/cdn/img/${iconPath}`;
}

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

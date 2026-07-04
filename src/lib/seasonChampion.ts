export type SeasonChampion = {
  name: string;
  kd: number;
  kills: number;
  deaths: number;
  countedWars: number;
  totalWars: number;
  endedAt: number;
};

export const normalizeSeasonChampion = (maybe: unknown): SeasonChampion | null => {
  if (!maybe || typeof maybe !== "object") return null;
  const row = maybe as Partial<SeasonChampion>;
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!name) return null;
  const kd = Number(row.kd || 0);
  const kills = Number(row.kills || 0);
  const deaths = Number(row.deaths || 0);
  const countedWars = Math.max(0, Number(row.countedWars || 0));
  const totalWars = Math.max(0, Number(row.totalWars || 0));
  const endedAt = Math.max(0, Number(row.endedAt || 0));
  return {
    name,
    kd: Number.isFinite(kd) ? kd : 0,
    kills: Number.isFinite(kills) ? kills : 0,
    deaths: Number.isFinite(deaths) ? deaths : 0,
    countedWars: Number.isFinite(countedWars) ? countedWars : 0,
    totalWars: Number.isFinite(totalWars) ? totalWars : 0,
    endedAt: Number.isFinite(endedAt) ? endedAt : 0,
  };
};


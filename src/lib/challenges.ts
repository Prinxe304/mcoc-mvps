export type ChallengeSide = "A" | "B" | "TIE";

export type ChallengeLogEntry = {
  war: number;
  kdA: number;
  kdB: number;
  winner: ChallengeSide;
  createdAt: number;
};

export type Challenge = {
  id: string;
  title: string;
  playerA: string;
  playerB: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
  log: ChallengeLogEntry[];
};

const makeId = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
};

export const createChallenge = (input: { title?: string; playerA: string; playerB: string }): Challenge => {
  const now = Date.now();
  return {
    id: makeId(),
    title: String(input.title || "").trim(),
    playerA: String(input.playerA || "").trim(),
    playerB: String(input.playerB || "").trim(),
    active: true,
    createdAt: now,
    updatedAt: now,
    log: [],
  };
};

export const normalizeChallenges = (maybeChallenges: unknown): Challenge[] => {
  if (!Array.isArray(maybeChallenges)) return [];
  return maybeChallenges
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const row = raw as Partial<Challenge>;
      const log = Array.isArray((row as any).log) ? ((row as any).log as unknown[]) : [];
      const normalizedLog: ChallengeLogEntry[] = log
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const e = entry as Partial<ChallengeLogEntry>;
          const winner: ChallengeSide = e.winner === "A" || e.winner === "B" ? e.winner : "TIE";
          const war = Math.max(0, Number(e.war || 0));
          if (!Number.isFinite(war) || war <= 0) return null;
          const kdA = Number(e.kdA || 0);
          const kdB = Number(e.kdB || 0);
          return {
            war,
            kdA: Number.isFinite(kdA) ? kdA : 0,
            kdB: Number.isFinite(kdB) ? kdB : 0,
            winner,
            createdAt: Math.max(0, Number(e.createdAt || 0)),
          };
        })
        .filter(Boolean) as ChallengeLogEntry[];

      const playerA = String(row.playerA || "").trim();
      const playerB = String(row.playerB || "").trim();
      if (!playerA || !playerB) return null;
      return {
        id: String(row.id || makeId()),
        title: String(row.title || "").trim(),
        playerA,
        playerB,
        active: Boolean(row.active ?? true),
        createdAt: Math.max(0, Number(row.createdAt || 0)),
        updatedAt: Math.max(0, Number(row.updatedAt || 0)),
        log: normalizedLog.sort((a, b) => a.war - b.war),
      } as Challenge;
    })
    .filter(Boolean) as Challenge[];
};

export const computeChallengeWinner = (kdA: number, kdB: number): ChallengeSide => {
  if (kdA > kdB) return "A";
  if (kdB > kdA) return "B";
  return "TIE";
};

export const appendChallengeLogEntry = (challenge: Challenge, entry: Omit<ChallengeLogEntry, "createdAt">): Challenge => {
  const now = Date.now();
  const existing = challenge.log || [];

  // Upsert by `war` so re-submitting the same war (after a reset/undo) fixes the stored values.
  let replaced = false;
  const nextLog = existing.map((row) => {
    if (row.war !== entry.war) return row;
    replaced = true;
    return { ...row, ...entry, createdAt: now };
  });

  if (!replaced) nextLog.push({ ...entry, createdAt: now });
  nextLog.sort((a, b) => a.war - b.war);
  return { ...challenge, log: nextLog, updatedAt: now };
};

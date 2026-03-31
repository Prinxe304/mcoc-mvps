import { SignedIn, SignedOut, SignInButton, UserButton, useAuth, useUser } from "@clerk/clerk-react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Button } from "./components/ui/button";
import "./index.css";

const BG_NAMES = ["BG1", "BG2", "BG3"] as const;
type BG = (typeof BG_NAMES)[number];

const PLAYERS_PER_BG = 10;

interface Player {
  name: string;
  kills: number;
  deaths: number;
  updatedAt: number;
}

interface PlayerWithKD extends Player {
  kd: number;
}

interface BGResult {
  players: PlayerWithKD[];
  mvp: PlayerWithKD | null;
}

type Data = Record<BG, Player[]>;
type BGResults = Record<BG, BGResult>;
type SubmittedMvp = { bg: BG; name: string; kd: number };
type SeasonTracker = Record<string, { name: string; kills: number; deaths: number; wars: number; kdSum: number }>;
type BonusCounts = Record<BG, number>;
type DefenseCounts = Record<BG, number>;

interface PersistedState {
  data: Data;
  history: string[][];
  submittedMvps: SubmittedMvp[];
  seasonTracker: SeasonTracker;
  bonusDraft: BonusCounts;
  bonusHistory: BonusCounts[];
  defenseDraft: DefenseCounts;
  defenseHistory: DefenseCounts[];
  updatedAt: number;
}

const STORAGE_KEY = "war-mvp-dashboard-state-v1";
const ACTIVE_BG_STORAGE_KEY = "war-mvp-active-bg-v1";
const ROOM_ID = (import.meta.env.VITE_ROOM_ID as string | undefined) || "global";
const EDITOR_EMAILS = String(import.meta.env.VITE_EDITOR_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const getStateRef = "state:getState" as any;
const saveStateRef = "state:saveState" as any;
const updatePlayerRef = "state:updatePlayer" as any;
const updateBonusDraftRef = "state:updateBonusDraft" as any;
const updateDefenseDraftRef = "state:updateDefenseDraft" as any;
const resetStateRef = "state:resetState" as any;
const GOD_GIF_URLS = [
  "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif",
  "https://media.giphy.com/media/l3q2XhfQ8oCkm1Ts4/giphy.gif",
  "https://media.giphy.com/media/26gsjCZpPolPr3sBy/giphy.gif",
];
const LOSER_GIF_URLS = [
  "https://media.giphy.com/media/9Y5BbDSkSTiY8/giphy.gif",
  "https://media.giphy.com/media/mCRJDo24UvJMA/giphy.gif",
  "https://media.giphy.com/media/OPU6wzx8JrHna/giphy.gif",
];
const CLOWN_GIF_URLS = [
  "https://media.giphy.com/media/l378giAZgxPw3eO52/giphy.gif",
  "https://media.giphy.com/media/3o6ZtaO9BZHcOjmErm/giphy.gif",
  "https://media.giphy.com/media/l4FGuhL4U2WyjdkaY/giphy.gif",
];
const SAVIOUR_GIF_URLS = [
  "https://media.giphy.com/media/l4FGpP4lxGGgK5CBW/giphy.gif",
  "https://media.giphy.com/media/26gsjCZpPolPr3sBy/giphy.gif",
  "https://media.giphy.com/media/3oz8xAFtqoOUUrsh7W/giphy.gif",
];
const WAR_FORTUNES = [
  "Your BG has main-character energy tonight.",
  "Calm hands win chaotic wars.",
  "One smart fight flips the whole map.",
  "Trust the plan, finish the push.",
  "MVPs are built in the small moments.",
];

const calculateKD = (kills: number, deaths: number): number => {
  if (kills === 0 && deaths === 0) return 0;
  return kills / (deaths + 1);
};

const calculateSeasonKD = (kdSum: number, wars: number): number => {
  if (wars <= 0) return 0;
  return kdSum / wars;
};

const emptyBonusCounts = (): BonusCounts => ({ BG1: 0, BG2: 0, BG3: 0 });
const emptyDefenseCounts = (): DefenseCounts => ({ BG1: 0, BG2: 0, BG3: 0 });

const createInitialData = (existingNames: Data | null = null): Data => {
  return BG_NAMES.reduce((acc, bg) => {
    acc[bg] = Array.from({ length: PLAYERS_PER_BG }).map((_, i) => ({
      name: existingNames?.[bg]?.[i]?.name ?? `${bg}-Player${i + 1}`,
      kills: 0,
      deaths: 0,
      updatedAt: Number(existingNames?.[bg]?.[i]?.updatedAt || 0),
    }));
    return acc;
  }, {} as Data);
};

const normalizeData = (maybeData: unknown): Data => {
  const fallback = createInitialData();
  if (!maybeData || typeof maybeData !== "object") return fallback;
  const data = maybeData as Record<string, unknown>;
  return BG_NAMES.reduce((acc, bg) => {
    const rawPlayers = Array.isArray(data[bg]) ? (data[bg] as unknown[]) : [];
    acc[bg] = Array.from({ length: PLAYERS_PER_BG }).map((_, i) => {
      const row = (rawPlayers[i] as Partial<Player> | undefined) || {};
      return {
        name: typeof row.name === "string" && row.name.trim() ? row.name : `${bg}-Player${i + 1}`,
        kills: Number(row.kills || 0),
        deaths: Number(row.deaths || 0),
        updatedAt: Number(row.updatedAt || 0),
      };
    });
    return acc;
  }, {} as Data);
};

const normalizeBonusCounts = (maybeCounts: unknown): BonusCounts => {
  const defaults = emptyBonusCounts();
  if (!maybeCounts || typeof maybeCounts !== "object") return defaults;
  const row = maybeCounts as Partial<Record<BG, unknown>>;
  return BG_NAMES.reduce((acc, bg) => {
    acc[bg] = Number(row[bg] ?? 0) || 0;
    return acc;
  }, {} as BonusCounts);
};

const normalizeSnapshot = (parsed: Partial<PersistedState> | null | undefined, fallbackUpdatedAt = 0): PersistedState | null => {
  if (!parsed) return null;
  return {
    data: normalizeData(parsed.data),
    history: Array.isArray(parsed.history) ? parsed.history : [],
    submittedMvps: Array.isArray(parsed.submittedMvps) ? parsed.submittedMvps : [],
    seasonTracker:
      parsed.seasonTracker && typeof parsed.seasonTracker === "object" ? (parsed.seasonTracker as SeasonTracker) : {},
    bonusDraft: normalizeBonusCounts(parsed.bonusDraft),
    bonusHistory: Array.isArray(parsed.bonusHistory) ? parsed.bonusHistory.map((row) => normalizeBonusCounts(row)) : [],
    defenseDraft: normalizeBonusCounts((parsed as any).defenseDraft),
    defenseHistory: Array.isArray((parsed as any).defenseHistory)
      ? (parsed as any).defenseHistory.map((row: unknown) => normalizeBonusCounts(row))
      : [],
    updatedAt: Number(parsed.updatedAt || fallbackUpdatedAt || 0),
  };
};

export default function App() {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  const [data, setData] = useState<Data>(createInitialData());
  const [history, setHistory] = useState<string[][]>([]);
  const [activeBG, setActiveBG] = useState<BG>("BG1");
  const [showTracking, setShowTracking] = useState(false);
  const [showFun, setShowFun] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(true);
  const [submittedMvps, setSubmittedMvps] = useState<SubmittedMvp[]>([]);
  const [seasonTracker, setSeasonTracker] = useState<SeasonTracker>({});
  const [showAllKdPlayers, setShowAllKdPlayers] = useState(false);
  const [warFortune, setWarFortune] = useState("");
  const [rivalA, setRivalA] = useState("");
  const [rivalB, setRivalB] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [bonusDraft, setBonusDraft] = useState<BonusCounts>(emptyBonusCounts());
  const [bonusHistory, setBonusHistory] = useState<BonusCounts[]>([]);
  const [defenseDraft, setDefenseDraft] = useState<DefenseCounts>(emptyDefenseCounts());
  const [defenseHistory, setDefenseHistory] = useState<DefenseCounts[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  const saveCloudState = useMutation(saveStateRef);
  const updatePlayerCloud = useMutation(updatePlayerRef);
  const updateBonusDraftCloud = useMutation(updateBonusDraftRef);
  const updateDefenseDraftCloud = useMutation(updateDefenseDraftRef);
  const resetCloudState = useMutation(resetStateRef);
  const remoteState = useQuery(getStateRef, isSignedIn ? { roomId: ROOM_ID } : "skip");
  const convex = useConvex();

  const skipPersistOnceRef = useRef(false);
  const latestUpdatedAtRef = useRef(0);
  const previousGodRef = useRef<string>("");
  const hasAppliedRemoteOnceRef = useRef(false);
  const pendingNameSyncRef = useRef<Record<string, number>>({});
  const currentUserEmail = (user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || "")
    .trim()
    .toLowerCase();
  const canEdit = isSignedIn ? (EDITOR_EMAILS.length === 0 ? true : EDITOR_EMAILS.includes(currentUserEmail)) : false;

  const playFx = (kind: "submit" | "god" | "fun") => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const base = kind === "submit" ? 280 : kind === "god" ? 520 : 360;
      osc.frequency.setValueAtTime(base, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(base * 1.35, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
      window.setTimeout(() => void ctx.close(), 260);
    } catch {
      // Ignore audio failures.
    }
  };

  const applySnapshot = (snapshot: PersistedState) => {
    skipPersistOnceRef.current = true;
    latestUpdatedAtRef.current = snapshot.updatedAt || 0;

    setData(snapshot.data);
    setHistory(snapshot.history);
    setSubmittedMvps(snapshot.submittedMvps);
    setSeasonTracker(snapshot.seasonTracker || {});
    setBonusDraft(snapshot.bonusDraft || emptyBonusCounts());
    setBonusHistory(snapshot.bonusHistory || []);
    setDefenseDraft(snapshot.defenseDraft || emptyDefenseCounts());
    setDefenseHistory(snapshot.defenseHistory || []);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  };

  useEffect(() => {
    if (!isAuthLoaded) return;

    if (isSignedIn) {
      // Signed-in users should always prefer shared cloud data.
      setIsHydrated(true);
      return;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        const localSnapshot = normalizeSnapshot(parsed);
        if (localSnapshot) applySnapshot(localSnapshot);
      }
    } catch {
      // Ignore invalid local state.
    }

    setIsHydrated(true);
  }, [isAuthLoaded, isSignedIn]);

  useEffect(() => {
    if (!isSignedIn || !isHydrated) return;
    let cancelled = false;
    const id = window.setInterval(() => {
      void convex
        .query(getStateRef as any, { roomId: ROOM_ID })
        .then((latest) => {
          if (cancelled || !latest) return;
          const snapshot = normalizeSnapshot(latest as Partial<PersistedState>);
          if (!snapshot) return;
          if (snapshot.updatedAt <= latestUpdatedAtRef.current) return;
          applySnapshot(snapshot);
        })
        .catch(() => {
          // Ignore polling errors. Live websocket query still handles primary sync.
        });
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isSignedIn, isHydrated, convex]);

  useEffect(() => {
    try {
      const savedBg = localStorage.getItem(ACTIVE_BG_STORAGE_KEY);
      if (savedBg && BG_NAMES.includes(savedBg as BG)) {
        setActiveBG(savedBg as BG);
      }
    } catch {
      // Ignore local UI preference read errors.
    }
  }, []);

  useEffect(() => {
    if (!isHydrated || !isSignedIn) return;
    if (remoteState === undefined) return;

    if (!remoteState) return;

    const snapshot = normalizeSnapshot(remoteState as Partial<PersistedState>);
    if (!snapshot) return;
    if (!hasAppliedRemoteOnceRef.current) {
      hasAppliedRemoteOnceRef.current = true;
      applySnapshot(snapshot);
      return;
    }
    if (snapshot.updatedAt <= latestUpdatedAtRef.current) return;
    applySnapshot(snapshot);
  }, [isHydrated, isSignedIn, remoteState]);

  useEffect(() => {
    if (!isSignedIn) {
      hasAppliedRemoteOnceRef.current = false;
      latestUpdatedAtRef.current = 0;
    }
  }, [isSignedIn]);

  useEffect(() => {
    return () => {
      Object.values(pendingNameSyncRef.current).forEach((timerId) => window.clearTimeout(timerId));
      pendingNameSyncRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    if (skipPersistOnceRef.current) {
      skipPersistOnceRef.current = false;
      return;
    }

    const snapshot: PersistedState = {
      data,
      history,
      submittedMvps,
      seasonTracker,
      bonusDraft,
      bonusHistory,
      defenseDraft,
      defenseHistory,
      updatedAt: Date.now(),
    };

    latestUpdatedAtRef.current = snapshot.updatedAt;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }, [isHydrated, data, history, submittedMvps, seasonTracker, bonusDraft, bonusHistory, defenseDraft, defenseHistory]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_BG_STORAGE_KEY, activeBG);
    } catch {
      // Ignore local UI preference write errors.
    }
  }, [activeBG]);

  const updatePlayer = (bg: BG, index: number, field: keyof Player, value: string | number) => {
    if (!canEdit) return;
    const current = data[bg]?.[index] ?? { name: `${bg}-Player${index + 1}`, kills: 0, deaths: 0, updatedAt: 0 };
    const updatedAt = Date.now();
    const nextPlayer: Player = {
      ...current,
      [field]: field === "name" ? String(value) : Number(value),
      updatedAt,
    };

    setData((prev) => {
      const newData = { ...prev };
      newData[bg] = newData[bg].map((player, i) => {
        if (i !== index) return player;
        return nextPlayer;
      });
      return newData;
    });

    if (!isSignedIn) return;

    if (field !== "name") {
      void updatePlayerCloud({ roomId: ROOM_ID, bg, index, player: nextPlayer });
      return;
    }

    const timerKey = `${bg}-${index}`;
    const prevTimer = pendingNameSyncRef.current[timerKey];
    if (prevTimer) window.clearTimeout(prevTimer);
    pendingNameSyncRef.current[timerKey] = window.setTimeout(() => {
      void updatePlayerCloud({
        roomId: ROOM_ID,
        bg,
        index,
        player: { ...nextPlayer, updatedAt: Date.now() },
      });
      delete pendingNameSyncRef.current[timerKey];
    }, 350);
  };

  const syncPlayerName = (bg: BG, index: number) => {
    if (!isSignedIn || !canEdit) return;
    const timerKey = `${bg}-${index}`;
    const prevTimer = pendingNameSyncRef.current[timerKey];
    if (prevTimer) {
      window.clearTimeout(prevTimer);
      delete pendingNameSyncRef.current[timerKey];
    }
    const player = data[bg]?.[index];
    if (!player) return;
    void updatePlayerCloud({ roomId: ROOM_ID, bg, index, player: { ...player, updatedAt: Date.now() } });
  };

  const updateBonusCount = (bg: BG, value: string) => {
    if (!canEdit) return;
    const parsed = value === "" ? 0 : Number(value);
    setBonusDraft((prev) => ({
      ...prev,
      [bg]: parsed,
    }));
    if (isSignedIn) {
      void updateBonusDraftCloud({ roomId: ROOM_ID, bg, value: parsed });
    }
  };

  const updateDefenseCount = (bg: BG, value: string) => {
    if (!canEdit) return;
    const parsed = value === "" ? 0 : Number(value);
    setDefenseDraft((prev) => ({
      ...prev,
      [bg]: parsed,
    }));
    if (isSignedIn) {
      void updateDefenseDraftCloud({ roomId: ROOM_ID, bg, value: parsed });
    }
  };

  const buildSnapshot = (
    overrides: Partial<Omit<PersistedState, "updatedAt">> = {},
  ): PersistedState => {
    return {
      data: overrides.data ?? data,
      history: overrides.history ?? history,
      submittedMvps: overrides.submittedMvps ?? submittedMvps,
      seasonTracker: overrides.seasonTracker ?? seasonTracker,
      bonusDraft: overrides.bonusDraft ?? bonusDraft,
      bonusHistory: overrides.bonusHistory ?? bonusHistory,
      defenseDraft: overrides.defenseDraft ?? defenseDraft,
      defenseHistory: overrides.defenseHistory ?? defenseHistory,
      updatedAt: Date.now(),
    };
  };

  const saveBgData = () => {
    if (!isSignedIn || !canEdit) return;
    const snapshot = buildSnapshot();
    void saveCloudState({ roomId: ROOM_ID, state: snapshot, updatedAt: snapshot.updatedAt });
  };

  const bgResults = useMemo<BGResults>(() => {
    const results = {} as BGResults;
    BG_NAMES.forEach((bg) => {
      const players = data[bg].map((p) => ({ ...p, kd: calculateKD(p.kills, p.deaths) }));
      players.sort((a, b) => {
        if (b.kd !== a.kd) return b.kd - a.kd;
        if (b.kills !== a.kills) return b.kills - a.kills;
        return a.deaths - b.deaths;
      });
      results[bg] = { players, mvp: players[0] ?? null };
    });
    return results;
  }, [data]);

  const submitWar = () => {
    if (!canEdit) return;
    const mvps = BG_NAMES.map((bg) => {
      const mvp = bgResults[bg]?.mvp;
      return { bg, name: mvp ? mvp.name : "", kd: mvp ? mvp.kd : 0 };
    }).sort((a, b) => b.kd - a.kd);

    const nextSubmittedMvps = mvps;
    const nextHistory = [...history, mvps.map((m) => m.name)];
    const nextBonusHistory = [...bonusHistory, normalizeBonusCounts(bonusDraft)];
    const nextDefenseHistory = [...defenseHistory, normalizeBonusCounts(defenseDraft)];
    const nextBonusDraft = emptyBonusCounts();
    const nextDefenseDraft = emptyDefenseCounts();
    const nextSeasonTracker: SeasonTracker = { ...seasonTracker };

    playFx("submit");

    BG_NAMES.forEach((bg) => {
      data[bg].forEach((player) => {
        const rawName = player.name.trim();
        if (!rawName) return;
        const key = rawName.toLowerCase();
        const current = nextSeasonTracker[key] || { name: rawName, kills: 0, deaths: 0, wars: 0, kdSum: 0 };
        const warKd = calculateKD(Number(player.kills || 0), Number(player.deaths || 0));
        nextSeasonTracker[key] = {
          name: current.name || rawName,
          kills: current.kills + Number(player.kills || 0),
          deaths: current.deaths + Number(player.deaths || 0),
          wars: current.wars + 1,
          kdSum: current.kdSum + warKd,
        };
      });
    });

    setSubmittedMvps(nextSubmittedMvps);
    setHistory(nextHistory);
    setBonusHistory(nextBonusHistory);
    setBonusDraft(nextBonusDraft);
    setDefenseHistory(nextDefenseHistory);
    setDefenseDraft(nextDefenseDraft);
    setSeasonTracker(nextSeasonTracker);

    if (isSignedIn) {
      const snapshot = buildSnapshot({
        history: nextHistory,
        submittedMvps: nextSubmittedMvps,
        seasonTracker: nextSeasonTracker,
        bonusDraft: nextBonusDraft,
        bonusHistory: nextBonusHistory,
        defenseDraft: nextDefenseDraft,
        defenseHistory: nextDefenseHistory,
      });
      void saveCloudState({ roomId: ROOM_ID, state: snapshot, updatedAt: snapshot.updatedAt });
    }
  };

  const resetWar = () => {
    if (!canEdit) return;
    const nextData = createInitialData(data);
    const nextSubmittedMvps: SubmittedMvp[] = [];
    const nextBonusDraft = emptyBonusCounts();
    const nextDefenseDraft = emptyDefenseCounts();
    setData(nextData);
    setSubmittedMvps(nextSubmittedMvps);
    setBonusDraft(nextBonusDraft);
    setDefenseDraft(nextDefenseDraft);

    if (isSignedIn) {
      const snapshot = buildSnapshot({
        data: nextData,
        submittedMvps: nextSubmittedMvps,
        bonusDraft: nextBonusDraft,
        defenseDraft: nextDefenseDraft,
      });
      void saveCloudState({ roomId: ROOM_ID, state: snapshot, updatedAt: snapshot.updatedAt });
    }
  };

  const clearSavedData = () => {
    if (!canEdit) return;
    localStorage.removeItem(STORAGE_KEY);
    const resetSnapshot: PersistedState = {
      data: createInitialData(),
      history: [],
      submittedMvps: [],
      seasonTracker: {},
      bonusDraft: emptyBonusCounts(),
      bonusHistory: [],
      defenseDraft: emptyDefenseCounts(),
      defenseHistory: [],
      updatedAt: Date.now(),
    };
    latestUpdatedAtRef.current = resetSnapshot.updatedAt;
    applySnapshot(resetSnapshot);
    setActiveBG("BG1");
    localStorage.setItem(ACTIVE_BG_STORAGE_KEY, "BG1");
    if (isSignedIn) {
      void resetCloudState({ roomId: ROOM_ID });
    }
  };

  const activeMVP = bgResults[activeBG]?.mvp;
  const backupPlayerNames = useMemo(() => {
    const names = new Set<string>();
    BG_NAMES.forEach((bg) => {
      const backupName = data[bg]?.[PLAYERS_PER_BG - 1]?.name?.trim().toLowerCase();
      if (backupName) names.add(backupName);
    });
    return names;
  }, [data]);

  const seasonKdTable = useMemo(() => {
    return Object.entries(seasonTracker)
      .map(([key, stats]) => {
        const kills = Number((stats as any).kills || 0);
        const deaths = Number((stats as any).deaths || 0);
        const wars = Number((stats as any).wars || 0);
        const kdSumFallback = calculateKD(kills, deaths) * Math.max(wars, 1);
        const kdSum = Number((stats as any).kdSum ?? kdSumFallback);
        const name = ((stats as any).name as string | undefined)?.trim() || key;
        return {
          name,
          kills,
          deaths,
          wars,
          kd: calculateSeasonKD(kdSum, wars),
        };
      })
      .filter((row) => !backupPlayerNames.has(row.name.trim().toLowerCase()))
      .sort((a, b) => b.kd - a.kd);
  }, [seasonTracker, backupPlayerNames]);

  const fallbackKdTable = useMemo(() => {
    const seen = new Set<string>();
    const rows: Array<{ name: string; kd: number; wars: number; kills: number; deaths: number }> = [];
    BG_NAMES.forEach((bg) => {
      data[bg].forEach((player, i) => {
        if (i === PLAYERS_PER_BG - 1) return;
        const name = player.name.trim();
        if (!name || seen.has(name)) return;
        seen.add(name);
        rows.push({ name, kd: 0, wars: 0, kills: 0, deaths: 0 });
      });
    });
    return rows;
  }, [data]);

  const kdListSource = seasonKdTable.length > 0 ? seasonKdTable : fallbackKdTable;
  const seasonLeaderboard = useMemo(() => {
    const count: Record<string, number> = {};
    history.flat().forEach((name) => {
      if (!name) return;
      count[name] = (count[name] || 0) + 1;
    });
    return Object.entries(count).sort((a, b) => b[1] - a[1]);
  }, [history]);
  const godOfBg = seasonKdTable[0] ?? null;
  const loserBracket = seasonKdTable.length > 1 ? seasonKdTable[seasonKdTable.length - 1] : null;
  const visibleSeasonKdRows = showAllKdPlayers ? kdListSource : kdListSource.slice(0, 5);
  const playerOptions = kdListSource.map((p) => p.name);
  const rivalryAStats = seasonKdTable.find((p) => p.name === rivalA) ?? null;
  const rivalryBStats = seasonKdTable.find((p) => p.name === rivalB) ?? null;
  const rivalryWinner =
    rivalryAStats && rivalryBStats
      ? rivalryAStats.kd === rivalryBStats.kd
        ? "Draw"
        : rivalryAStats.kd > rivalryBStats.kd
          ? rivalryAStats.name
          : rivalryBStats.name
      : null;

  const bonusFrequency = useMemo(() => {
    const clownCounts = emptyBonusCounts();
    const saviourCounts = emptyBonusCounts();

    bonusHistory.forEach((warBonus, index) => {
      const warDefense = defenseHistory[index] || emptyDefenseCounts();

      const saviourBg = [...BG_NAMES].sort((a, b) => {
        const bonusDiff = Number(warBonus[b] || 0) - Number(warBonus[a] || 0);
        if (bonusDiff !== 0) return bonusDiff;
        return Number(warDefense[b] || 0) - Number(warDefense[a] || 0);
      })[0];

      const clownBg = [...BG_NAMES].sort((a, b) => {
        const bonusDiff = Number(warBonus[a] || 0) - Number(warBonus[b] || 0);
        if (bonusDiff !== 0) return bonusDiff;
        return Number(warDefense[a] || 0) - Number(warDefense[b] || 0);
      })[0];

      saviourCounts[saviourBg] += 1;
      clownCounts[clownBg] += 1;
    });

    return { clownCounts, saviourCounts };
  }, [bonusHistory, defenseHistory]);

  const bonusClown = useMemo(() => {
    return BG_NAMES.map((bg) => ({ bg, count: bonusFrequency.clownCounts[bg] })).sort((a, b) => b.count - a.count)[0] ?? null;
  }, [bonusFrequency]);

  const bonusStrongest = useMemo(() => {
    return BG_NAMES.map((bg) => ({ bg, count: bonusFrequency.saviourCounts[bg] })).sort((a, b) => b.count - a.count)[0] ?? null;
  }, [bonusFrequency]);
  const bonusClownLeaders = useMemo(() => {
    if (!bonusClown) return [];
    return BG_NAMES.filter((bg) => bonusFrequency.clownCounts[bg] === bonusClown.count);
  }, [bonusClown, bonusFrequency]);
  const bonusSaviourLeaders = useMemo(() => {
    if (!bonusStrongest) return [];
    return BG_NAMES.filter((bg) => bonusFrequency.saviourCounts[bg] === bonusStrongest.count);
  }, [bonusStrongest, bonusFrequency]);
  const latestWarNumber = bonusHistory.length;
  const kdGodGifUrl =
    GOD_GIF_URLS[(Math.max(latestWarNumber, 1) - 1) % GOD_GIF_URLS.length];
  const kdLoserGifUrl =
    LOSER_GIF_URLS[(Math.max(latestWarNumber, 1) - 1) % LOSER_GIF_URLS.length];
  const clownMemeUrl =
    CLOWN_GIF_URLS[(Math.max(latestWarNumber, 1) - 1) % CLOWN_GIF_URLS.length];
  const saviourMemeUrl =
    SAVIOUR_GIF_URLS[(Math.max(latestWarNumber, 1) - 1) % SAVIOUR_GIF_URLS.length];
  const latestBonus = bonusHistory.length > 0 ? bonusHistory[bonusHistory.length - 1] : emptyBonusCounts();
  const latestDefense = defenseHistory.length > 0 ? defenseHistory[defenseHistory.length - 1] : emptyDefenseCounts();

  useEffect(() => {
    const nextGod = godOfBg?.name || "";
    if (!nextGod) return;
    if (!previousGodRef.current) {
      previousGodRef.current = nextGod;
      return;
    }
    if (previousGodRef.current !== nextGod) {
      previousGodRef.current = nextGod;
      setShowConfetti(true);
      playFx("god");
      const timer = window.setTimeout(() => setShowConfetti(false), 2200);
      return () => window.clearTimeout(timer);
    }
  }, [godOfBg?.name]);

  if (!isAuthLoaded) return <div className="app-shell">Loading authentication...</div>;

  return (
    <div className="app-shell">
      <div className="top-bar">
        <h1 className="app-title">⚔ War MVP Dashboard</h1>
        <SignedIn>
          <div className="top-user">
            <UserButton />
          </div>
        </SignedIn>
      </div>

      <SignedOut>
        <Card className="card-main">
          <CardContent className="card-main-content">
            <h2 className="section-title">Sign in required</h2>
            <p className="sync-note">Please sign in to use shared real-time sync across devices.</p>
            <SignInButton mode="modal">
              <Button type="button" className="btn-primary">
                Sign In
              </Button>
            </SignInButton>
          </CardContent>
        </Card>
      </SignedOut>

      <SignedIn>
        <p className="sync-note">Sync mode: Convex realtime (room: {ROOM_ID})</p>
        {!canEdit && (
          <p className="sync-note">
            View only mode. Ask admin to allow your email: {currentUserEmail || "unknown"}
          </p>
        )}

        <div className="tabs-wrap">
          {BG_NAMES.map((bg) => (
            <Button
              key={bg}
              type="button"
              onClick={() => {
                setShowTracking(false);
                setShowFun(false);
                setActiveBG(bg);
              }}
              className={`tab-btn ${!showTracking && !showFun && activeBG === bg ? "is-active" : ""}`}
            >
              {bg}
            </Button>
          ))}
          <Button
            type="button"
            onClick={() => {
              setShowFun(false);
              setShowTracking(true);
            }}
            className={`tab-btn ${showTracking ? "is-active" : ""}`}
          >
            Tracking
          </Button>
          <Button
            type="button"
            onClick={() => {
              setShowTracking(false);
              setShowFun(true);
            }}
            className={`tab-btn ${showFun ? "is-active" : ""}`}
          >
            Fun
          </Button>
        </div>

        {!showTracking && !showFun && (
          <>
            <Card className="card-main">
              <CardContent className="card-main-content">
                <h2 className="section-title">{activeBG}</h2>
                <div className="table-head">
                  <div>Player</div>
                  <div>Kills</div>
                  <div>Deaths</div>
                  <div>KD</div>
                </div>

                {data[activeBG].map((player, i) => {
                  const kd = calculateKD(player.kills, player.deaths);
                  const isMVP = activeMVP?.name === player.name;
                  return (
                    <div key={`${activeBG}-${i}`} className={`player-row ${isMVP ? "is-mvp" : ""}`}>
                      <Input
                        className="input-player"
                        value={player.name}
                        disabled={!canEdit}
                        onChange={(e) => updatePlayer(activeBG, i, "name", e.target.value)}
                        onBlur={() => syncPlayerName(activeBG, i)}
                      />
                      <Input
                        type="number"
                        className="input-num"
                        disabled={!canEdit}
                        value={player.kills === 0 ? "" : player.kills}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          updatePlayer(activeBG, i, "kills", e.target.value === "" ? 0 : Number(e.target.value))
                        }
                      />
                      <Input
                        type="number"
                        className="input-num"
                        disabled={!canEdit}
                        value={player.deaths === 0 ? "" : player.deaths}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          updatePlayer(activeBG, i, "deaths", e.target.value === "" ? 0 : Number(e.target.value))
                        }
                      />
                      <div className="kd-cell">{kd.toFixed(2)}</div>
                    </div>
                  );
                })}

                <div className="bonus-line">
                  <div className="bonus-label">War Bonus Count</div>
                  <div className="rival-row">
                    {BG_NAMES.map((bg) => (
                      <div key={`bonus-box-${bg}`}>
                        <label htmlFor={`bonus-${bg}`} className="bonus-label">
                          {bg}
                        </label>
                        <Input
                          id={`bonus-${bg}`}
                          type="number"
                          className="bonus-input"
                          disabled={!canEdit}
                          value={bonusDraft[bg] === 0 ? "" : bonusDraft[bg]}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateBonusCount(bg, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bonus-line">
                  <div className="bonus-label">War Defence Count</div>
                  <div className="rival-row">
                    {BG_NAMES.map((bg) => (
                      <div key={`defense-box-${bg}`}>
                        <label htmlFor={`defense-${bg}`} className="bonus-label">
                          {bg}
                        </label>
                        <Input
                          id={`defense-${bg}`}
                          type="number"
                          className="bonus-input"
                          disabled={!canEdit}
                          value={defenseDraft[bg] === 0 ? "" : defenseDraft[bg]}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateDefenseCount(bg, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="action-row">
              <Button type="button" className="btn-primary" onClick={submitWar} disabled={!canEdit}>
                Submit War
              </Button>
              <Button type="button" className="btn-secondary" onClick={saveBgData} disabled={!canEdit}>
                Save BG
              </Button>
              <Button type="button" className="btn-secondary" onClick={resetWar} disabled={!canEdit}>
                Next War
              </Button>
              <Button type="button" className="btn-danger" onClick={clearSavedData} disabled={!canEdit}>
                Clear Saved Data
              </Button>
            </div>
          </>
        )}

        {showTracking && (
          <Card className="card-secondary card-awards">
            <CardContent className="card-secondary-content">
              {showConfetti && (
                <div className="confetti-wrap" aria-hidden="true">
                  {Array.from({ length: 22 }).map((_, i) => (
                    <span key={i} className="confetti-bit" style={{ left: `${(i * 100) / 22}%` }} />
                  ))}
                </div>
              )}

              <h2 className="section-title-left">
                KD Awards ({history.length > 0 ? `War 1 to War ${history.length}` : "from first war"})
              </h2>
              <div className="award-grid">
                <div className="award-item god-item">
                  <img src={kdGodGifUrl} alt="God of BG gif" className="award-gif" />
                  <div className="award-label">God of BG</div>
                  <div className="award-name">{godOfBg ? godOfBg.name : "-"}</div>
                  <div className="award-meta">KD {godOfBg ? godOfBg.kd.toFixed(2) : "0.00"}</div>
                </div>

                <div className="award-item loser-item">
                  <img src={kdLoserGifUrl} alt="Loser bracket gif" className="award-gif" />
                  <div className="award-label">Loser Bracket</div>
                  <div className="award-name">{loserBracket ? loserBracket.name : "-"}</div>
                  <div className="award-meta">KD {loserBracket ? loserBracket.kd.toFixed(2) : "0.00"}</div>
                </div>
              </div>

              {seasonKdTable.length === 0 && <p className="sync-note">Submit your first war to start KD tracking.</p>}
              <div className="kd-track-list">
                {visibleSeasonKdRows.map((row, i) => (
                  <div key={row.name} className="kd-track-row">
                    <span>
                      {i + 1}. {row.name}
                    </span>
                    <span>KD {row.kd.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              {kdListSource.length > 5 && (
                <div className="kd-toggle-wrap">
                  <Button
                    type="button"
                    className="btn-secondary kd-toggle-btn"
                    onClick={() => setShowAllKdPlayers((prev) => !prev)}
                  >
                    {showAllKdPlayers ? "Show Top 5" : "Show All 30"}
                  </Button>
                </div>
              )}

              <div className="track-section">
                <h3 className="track-title">War Fortune</h3>
                <div className="meme-row">
                  <Button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setWarFortune(WAR_FORTUNES[Math.floor(Math.random() * WAR_FORTUNES.length)]);
                      playFx("fun");
                    }}
                  >
                    Reveal War Fortune
                  </Button>
                </div>
                {warFortune && <div className="fortune-card">{warFortune}</div>}
              </div>

              <div className="track-section">
                <h3 className="track-title">Rivalry Tracker</h3>
                <div className="rival-row">
                  <select className="rival-select" value={rivalA} onChange={(e) => setRivalA(e.target.value)}>
                    <option value="">Select Player A</option>
                    {playerOptions.map((name) => (
                      <option key={`a-${name}`} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <select className="rival-select" value={rivalB} onChange={(e) => setRivalB(e.target.value)}>
                    <option value="">Select Player B</option>
                    {playerOptions.map((name) => (
                      <option key={`b-${name}`} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                {rivalryAStats && rivalryBStats && (
                  <div className="rival-result">
                    <span>
                      {rivalryAStats.name}: KD {rivalryAStats.kd.toFixed(2)}
                    </span>
                    <span>
                      {rivalryBStats.name}: KD {rivalryBStats.kd.toFixed(2)}
                    </span>
                    <span className="rival-winner">Winner: {rivalryWinner}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {showFun && (
          <Card className="card-secondary card-awards">
            <CardContent className="card-secondary-content">
              <h2 className="section-title-left">Fun Activities</h2>

              <div className="track-section">
                <h3 className="track-title">Bonus Power Tracker (War 1 to Current)</h3>
                {bonusHistory.length === 0 ? (
                  <p className="sync-note">Add bonus counts and submit wars to start bonus tracking.</p>
                ) : (
                  <>
                    <div className="award-grid">
                      <div className="award-item loser-item">
                        <img src={clownMemeUrl} alt="Bonus clown gif" className="award-gif" />
                        <div className="award-label">Clown BG (Lowest Bonus)</div>
                        <div className="award-name">{bonusClown ? `🤡 ${bonusClownLeaders.join(" / ")}` : "-"}</div>
                        <div className="award-meta">Clown Frequency {bonusClown ? bonusClown.count : 0}</div>
                      </div>

                      <div className="award-item god-item">
                        <img src={saviourMemeUrl} alt="Saviour and strongest gif" className="award-gif" />
                        <div className="award-label">Saviour & Strongest</div>
                        <div className="award-name">{bonusStrongest ? `⚡ ${bonusSaviourLeaders.join(" / ")}` : "-"}</div>
                        <div className="award-meta">Saviour Frequency {bonusStrongest ? bonusStrongest.count : 0}</div>
                      </div>
                    </div>

                    <div className="history-card">
                      <div className="history-head">
                        <span className="history-war">Frequency Board</span>
                        <span className="history-meta">All Wars</span>
                      </div>
                      {BG_NAMES.map((bg) => (
                        <div key={bg} className="history-item">
                          {bg}: 🤡 {bonusFrequency.clownCounts[bg]} | ⚡ {bonusFrequency.saviourCounts[bg]}
                        </div>
                      ))}
                    </div>
                    <div className="track-section">
                      <h3 className="track-title">Latest War Bonus</h3>
                      <div className="kd-track-list">
                        {BG_NAMES.map((bg) => (
                          <div key={`latest-${bg}`} className="kd-track-row">
                            <span>{bg}</span>
                            <span>
                              Bonus {latestBonus[bg]} | Defence {latestDefense[bg]}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="track-section">
                      <h3 className="track-title">Bonus + Defence History</h3>
                      {bonusHistory.map((warBonus, i) => (
                        <div key={`bonus-war-${i}`} className="history-card">
                          <div className="history-head">
                            <span className="history-war">War {i + 1}</span>
                            <span className="history-meta">Bonus/Defence</span>
                          </div>
                          {BG_NAMES.map((bg) => (
                            <div key={`bonus-${i}-${bg}`} className="history-item">
                              {bg}: Bonus {warBonus[bg]} | Defence {(defenseHistory[i] || emptyDefenseCounts())[bg]}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {!showFun && submittedMvps.length > 0 && (
          <Card className="card-secondary card-leaderboard">
            <CardContent className="card-secondary-content">
              <div className="leaderboard-head" onClick={() => setShowLeaderboard((prev) => !prev)}>
                <h2 className="section-title-left">Season Leaderboard</h2>
                <span className="chevron">{showLeaderboard ? "▲" : "▼"}</span>
              </div>
              {showLeaderboard && (
                <div className="leaderboard-list">
                  {seasonLeaderboard.map((p, i) => (
                    <div key={p[0]} className={`leader-row ${i === 0 ? "leader-top" : ""}`}>
                      <span>
                        {i + 1}. {p[0]}
                      </span>
                      <span>{p[1]} MVPs</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!showFun && (
          <Card className="card-secondary card-history">
            <CardContent className="card-secondary-content">
              <h2 className="section-title-left">War History</h2>
              {history.map((war, i) => (
                <div key={`war-${i}`} className="history-card">
                  <div className="history-head">
                    <span className="history-war">War {i + 1}</span>
                    <span className="history-meta">{war.length} MVPs</span>
                  </div>
                  {war.map((player, idx) => (
                    <div key={`${i}-${idx}-${player}`} className="history-item">
                      {idx + 1}. {player}
                    </div>
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </SignedIn>
    </div>
  );
}

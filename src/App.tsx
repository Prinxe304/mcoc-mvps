import { SignedIn, SignedOut, SignInButton, UserButton, useAuth } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";
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

interface PersistedState {
  data: Data;
  history: string[][];
  submittedMvps: SubmittedMvp[];
  seasonTracker: SeasonTracker;
  bonusDraft: BonusCounts;
  bonusHistory: BonusCounts[];
  updatedAt: number;
}

const STORAGE_KEY = "war-mvp-dashboard-state-v1";
const ACTIVE_BG_STORAGE_KEY = "war-mvp-active-bg-v1";
const ROOM_ID = (import.meta.env.VITE_ROOM_ID as string | undefined) || "global";

const getStateRef = "state:getState" as any;
const saveStateRef = "state:saveState" as any;
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
    updatedAt: Number(parsed.updatedAt || fallbackUpdatedAt || 0),
  };
};

export default function App() {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();

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
  const [isHydrated, setIsHydrated] = useState(false);

  const saveCloudState = useMutation(saveStateRef);
  const remoteState = useQuery(getStateRef, isSignedIn ? { roomId: ROOM_ID } : "skip");

  const skipPersistOnceRef = useRef(false);
  const latestUpdatedAtRef = useRef(0);
  const cloudSaveTimerRef = useRef<number | null>(null);
  const hasResolvedRemoteStateRef = useRef(false);
  const previousGodRef = useRef<string>("");

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

    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  };

  useEffect(() => {
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

    return () => {
      if (cloudSaveTimerRef.current) window.clearTimeout(cloudSaveTimerRef.current);
    };
  }, []);

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

    hasResolvedRemoteStateRef.current = true;
    if (!remoteState) return;

    const snapshot = normalizeSnapshot(remoteState as Partial<PersistedState>);
    if (!snapshot) return;
    if (snapshot.updatedAt <= latestUpdatedAtRef.current) return;
    applySnapshot(snapshot);
  }, [isHydrated, isSignedIn, remoteState]);

  useEffect(() => {
    if (!isHydrated) return;
    if (!isSignedIn) hasResolvedRemoteStateRef.current = false;

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
      updatedAt: Date.now(),
    };

    latestUpdatedAtRef.current = snapshot.updatedAt;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));

    if (isSignedIn && hasResolvedRemoteStateRef.current) {
      if (cloudSaveTimerRef.current) window.clearTimeout(cloudSaveTimerRef.current);
      cloudSaveTimerRef.current = window.setTimeout(() => {
        void saveCloudState({ roomId: ROOM_ID, state: snapshot, updatedAt: snapshot.updatedAt });
      }, 500);
    }
  }, [isHydrated, isSignedIn, data, history, submittedMvps, seasonTracker, bonusDraft, bonusHistory, saveCloudState]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_BG_STORAGE_KEY, activeBG);
    } catch {
      // Ignore local UI preference write errors.
    }
  }, [activeBG]);

  const updatePlayer = (bg: BG, index: number, field: keyof Player, value: string | number) => {
    setData((prev) => {
      const newData = { ...prev };
      newData[bg] = newData[bg].map((player, i) => {
        if (i !== index) return player;
        return {
          ...player,
          [field]: field === "name" ? value : Number(value),
          updatedAt: Date.now(),
        };
      });
      return newData;
    });
  };

  const updateBonusCount = (bg: BG, value: string) => {
    setBonusDraft((prev) => ({
      ...prev,
      [bg]: value === "" ? 0 : Number(value),
    }));
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
    const mvps = BG_NAMES.map((bg) => {
      const mvp = bgResults[bg]?.mvp;
      return { bg, name: mvp ? mvp.name : "", kd: mvp ? mvp.kd : 0 };
    }).sort((a, b) => b.kd - a.kd);

    setSubmittedMvps(mvps);
    setHistory((prev) => [...prev, mvps.map((m) => m.name)]);

    setBonusHistory((prev) => [...prev, normalizeBonusCounts(bonusDraft)]);
    setBonusDraft(emptyBonusCounts());

    playFx("submit");

    setSeasonTracker((prev) => {
      const next: SeasonTracker = { ...prev };
      BG_NAMES.forEach((bg) => {
        data[bg].forEach((player) => {
          const rawName = player.name.trim();
          if (!rawName) return;
          const key = rawName.toLowerCase();
          const current = next[key] || { name: rawName, kills: 0, deaths: 0, wars: 0, kdSum: 0 };
          const warKd = calculateKD(Number(player.kills || 0), Number(player.deaths || 0));
          next[key] = {
            name: current.name || rawName,
            kills: current.kills + Number(player.kills || 0),
            deaths: current.deaths + Number(player.deaths || 0),
            wars: current.wars + 1,
            kdSum: current.kdSum + warKd,
          };
        });
      });
      return next;
    });
  };

  const resetWar = () => {
    setData(createInitialData(data));
    setSubmittedMvps([]);
    setBonusDraft(emptyBonusCounts());
  };

  const clearSavedData = () => {
    localStorage.removeItem(STORAGE_KEY);
    const resetSnapshot: PersistedState = {
      data: createInitialData(),
      history: [],
      submittedMvps: [],
      seasonTracker: {},
      bonusDraft: emptyBonusCounts(),
      bonusHistory: [],
      updatedAt: Date.now(),
    };
    latestUpdatedAtRef.current = resetSnapshot.updatedAt;
    applySnapshot(resetSnapshot);
    setActiveBG("BG1");
    localStorage.setItem(ACTIVE_BG_STORAGE_KEY, "BG1");
    if (isSignedIn) {
      void saveCloudState({ roomId: ROOM_ID, state: resetSnapshot, updatedAt: resetSnapshot.updatedAt });
    }
  };

  const activeMVP = bgResults[activeBG]?.mvp;
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
      .sort((a, b) => b.kd - a.kd);
  }, [seasonTracker]);

  const fallbackKdTable = useMemo(() => {
    const seen = new Set<string>();
    const rows: Array<{ name: string; kd: number; wars: number; kills: number; deaths: number }> = [];
    BG_NAMES.forEach((bg) => {
      data[bg].forEach((player) => {
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

    bonusHistory.forEach((warBonus) => {
      const values = BG_NAMES.map((bg) => Number(warBonus[bg] || 0));
      const minValue = Math.min(...values);
      const maxValue = Math.max(...values);

      BG_NAMES.forEach((bg) => {
        const value = Number(warBonus[bg] || 0);
        if (value === minValue) clownCounts[bg] += 1;
        if (value === maxValue) saviourCounts[bg] += 1;
      });
    });

    return { clownCounts, saviourCounts };
  }, [bonusHistory]);

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
                        onChange={(e) => updatePlayer(activeBG, i, "name", e.target.value)}
                      />
                      <Input
                        type="number"
                        className="input-num"
                        value={player.kills === 0 ? "" : player.kills}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          updatePlayer(activeBG, i, "kills", e.target.value === "" ? 0 : Number(e.target.value))
                        }
                      />
                      <Input
                        type="number"
                        className="input-num"
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
                          value={bonusDraft[bg] === 0 ? "" : bonusDraft[bg]}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateBonusCount(bg, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="action-row">
              <Button type="button" className="btn-primary" onClick={submitWar}>
                Submit War
              </Button>
              <Button type="button" className="btn-secondary" onClick={resetWar}>
                Next War
              </Button>
              <Button type="button" className="btn-danger" onClick={clearSavedData}>
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
                            <span>Bonus {latestBonus[bg]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="track-section">
                      <h3 className="track-title">Bonus History</h3>
                      {bonusHistory.map((warBonus, i) => (
                        <div key={`bonus-war-${i}`} className="history-card">
                          <div className="history-head">
                            <span className="history-war">War {i + 1}</span>
                            <span className="history-meta">Bonus</span>
                          </div>
                          {BG_NAMES.map((bg) => (
                            <div key={`bonus-${i}-${bg}`} className="history-item">
                              {bg}: {warBonus[bg]}
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

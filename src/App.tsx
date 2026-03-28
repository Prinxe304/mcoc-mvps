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
type SeasonTracker = Record<string, { kills: number; deaths: number; wars: number }>;

interface PersistedState {
  showLeaderboard: boolean;
  data: Data;
  history: string[][];
  activeBG: BG;
  submittedMvps: SubmittedMvp[];
  seasonTracker: SeasonTracker;
  updatedAt: number;
}

const STORAGE_KEY = "war-mvp-dashboard-state-v1";
const ROOM_ID = (import.meta.env.VITE_ROOM_ID as string | undefined) || "global";

const getStateRef = "state:getState" as any;
const saveStateRef = "state:saveState" as any;
const GOD_GIF_URL = "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif";
const LOSER_GIF_URL = "https://media.giphy.com/media/9Y5BbDSkSTiY8/giphy.gif";

const calculateKD = (kills: number, deaths: number): number => {
  if (kills === 0 && deaths === 0) return 0;
  return kills / (deaths === 0 ? 1 : deaths);
};

const calculateSeasonKD = (kills: number, deaths: number, wars: number): number => {
  if (kills === 0 && deaths === 0) return 0;
  if (wars <= 0) return 0;
  if (deaths === 0) return kills / wars;
  return kills / deaths;
};

const createInitialData = (existingNames: Data | null = null): Data => {
  return BG_NAMES.reduce((acc, bg) => {
    acc[bg] = Array.from({ length: PLAYERS_PER_BG }).map((_, i) => ({
      name: existingNames?.[bg]?.[i]?.name ?? `${bg}-Player${i + 1}`,
      kills: 0,
      deaths: 0,
    }));
    return acc;
  }, {} as Data);
};

const normalizeSnapshot = (
  parsed: Partial<PersistedState> | null | undefined,
  fallbackUpdatedAt = 0,
): PersistedState | null => {
  if (!parsed) return null;
  return {
    showLeaderboard: typeof parsed.showLeaderboard === "boolean" ? parsed.showLeaderboard : true,
    data: (parsed.data as Data) || createInitialData(),
    history: Array.isArray(parsed.history) ? parsed.history : [],
    activeBG: parsed.activeBG && BG_NAMES.includes(parsed.activeBG as BG) ? (parsed.activeBG as BG) : "BG1",
    submittedMvps: Array.isArray(parsed.submittedMvps) ? parsed.submittedMvps : [],
    seasonTracker:
      parsed.seasonTracker && typeof parsed.seasonTracker === "object" ? (parsed.seasonTracker as SeasonTracker) : {},
    updatedAt: Number(parsed.updatedAt || fallbackUpdatedAt || 0),
  };
};

export default function App() {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();

  const [showLeaderboard, setShowLeaderboard] = useState(true);
  const [data, setData] = useState<Data>(createInitialData());
  const [history, setHistory] = useState<string[][]>([]);
  const [activeBG, setActiveBG] = useState<BG>("BG1");
  const [submittedMvps, setSubmittedMvps] = useState<SubmittedMvp[]>([]);
  const [seasonTracker, setSeasonTracker] = useState<SeasonTracker>({});
  const [isHydrated, setIsHydrated] = useState(false);

  const saveCloudState = useMutation(saveStateRef);
  const remoteState = useQuery(getStateRef, isSignedIn ? { roomId: ROOM_ID } : "skip");

  const skipPersistOnceRef = useRef(false);
  const latestUpdatedAtRef = useRef(0);
  const cloudSaveTimerRef = useRef<number | null>(null);
  const hasResolvedRemoteStateRef = useRef(false);

  const applySnapshot = (snapshot: PersistedState) => {
    skipPersistOnceRef.current = true;
    latestUpdatedAtRef.current = snapshot.updatedAt || 0;

    setData(snapshot.data);
    setHistory(snapshot.history);
    setSubmittedMvps(snapshot.submittedMvps);
    setSeasonTracker(snapshot.seasonTracker || {});

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...snapshot,
        showLeaderboard,
        activeBG,
      } satisfies PersistedState),
    );
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        const localSnapshot = normalizeSnapshot(parsed);
        if (localSnapshot) {
          setShowLeaderboard(localSnapshot.showLeaderboard);
          setActiveBG(localSnapshot.activeBG);
          applySnapshot(localSnapshot);
        }
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
    if (!isSignedIn) {
      hasResolvedRemoteStateRef.current = false;
    }

    if (skipPersistOnceRef.current) {
      skipPersistOnceRef.current = false;
      return;
    }

    const snapshot: PersistedState = {
      showLeaderboard,
      data,
      history,
      activeBG,
      submittedMvps,
      seasonTracker,
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
  }, [isHydrated, isSignedIn, showLeaderboard, data, history, activeBG, submittedMvps, seasonTracker, saveCloudState]);

  const updatePlayer = (bg: BG, index: number, field: keyof Player, value: string | number) => {
    setData((prev) => {
      const newData = { ...prev };
      newData[bg] = newData[bg].map((player, i) => {
        if (i !== index) return player;
        return {
          ...player,
          [field]: field === "name" ? value : Number(value),
        };
      });
      return newData;
    });
  };

  const bgResults = useMemo<BGResults>(() => {
    const results = {} as BGResults;

    BG_NAMES.forEach((bg) => {
      const players = data[bg].map((p) => ({
        ...p,
        kd: calculateKD(p.kills, p.deaths),
      }));

      players.sort((a, b) => {
        if (b.kd !== a.kd) return b.kd - a.kd;
        if (b.kills !== a.kills) return b.kills - a.kills;
        return a.deaths - b.deaths;
      });

      results[bg] = {
        players,
        mvp: players[0] ?? null,
      };
    });

    return results;
  }, [data]);

  const submitWar = () => {
    const mvps = BG_NAMES.map((bg) => {
      const mvp = bgResults[bg]?.mvp;
      return {
        bg,
        name: mvp ? mvp.name : "",
        kd: mvp ? mvp.kd : 0,
      };
    }).sort((a, b) => b.kd - a.kd);

    setSubmittedMvps(mvps);
    setHistory((prev) => [...prev, mvps.map((m) => m.name)]);

    setSeasonTracker((prev) => {
      const next: SeasonTracker = { ...prev };

      BG_NAMES.forEach((bg) => {
        data[bg].forEach((player) => {
          const name = player.name.trim();
          if (!name) return;

          const current = next[name] || { kills: 0, deaths: 0, wars: 0 };
          next[name] = {
            kills: current.kills + Number(player.kills || 0),
            deaths: current.deaths + Number(player.deaths || 0),
            wars: current.wars + 1,
          };
        });
      });

      return next;
    });
  };

  const resetWar = () => {
    setData(createInitialData(data));
    setSubmittedMvps([]);
  };

  const clearSavedData = () => {
    localStorage.removeItem(STORAGE_KEY);

    const resetSnapshot: PersistedState = {
      showLeaderboard: true,
      data: createInitialData(),
      history: [],
      activeBG: "BG1",
      submittedMvps: [],
      seasonTracker: {},
      updatedAt: Date.now(),
    };

    latestUpdatedAtRef.current = resetSnapshot.updatedAt;
    setShowLeaderboard(resetSnapshot.showLeaderboard);
    setData(resetSnapshot.data);
    setHistory(resetSnapshot.history);
    setActiveBG(resetSnapshot.activeBG);
    setSubmittedMvps(resetSnapshot.submittedMvps);
    setSeasonTracker(resetSnapshot.seasonTracker);

    if (isSignedIn) {
      void saveCloudState({ roomId: ROOM_ID, state: resetSnapshot, updatedAt: resetSnapshot.updatedAt });
    }
  };

  const seasonLeaderboard = useMemo(() => {
    const count: Record<string, number> = {};

    history.flat().forEach((name) => {
      if (!name) return;
      count[name] = (count[name] || 0) + 1;
    });

    return Object.entries(count).sort((a, b) => b[1] - a[1]);
  }, [history]);

  const activeMVP = bgResults[activeBG]?.mvp;
  const seasonKdTable = useMemo(() => {
    return Object.entries(seasonTracker)
      .map(([name, stats]) => ({
        name,
        kills: stats.kills,
        deaths: stats.deaths,
        wars: stats.wars,
        kd: calculateSeasonKD(stats.kills, stats.deaths, stats.wars),
      }))
      .sort((a, b) => b.kd - a.kd);
  }, [seasonTracker]);
  const godOfBg = seasonKdTable[0] ?? null;
  const loserBracket = seasonKdTable.length > 1 ? seasonKdTable[seasonKdTable.length - 1] : null;

  if (!isAuthLoaded) {
    return <div className="app-shell">Loading authentication...</div>;
  }

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
              onClick={() => setActiveBG(bg)}
              className={`tab-btn ${activeBG === bg ? "is-active" : ""}`}
            >
              {bg}
            </Button>
          ))}
        </div>

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

            <div className="mvp-line">
              MVP: <span className="mvp-name">{activeMVP ? activeMVP.name : "-"}</span>
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

        {seasonKdTable.length > 0 && (
          <Card className="card-secondary card-awards">
            <CardContent className="card-secondary-content">
              <h2 className="section-title-left">KD Awards (from first war)</h2>
              <div className="award-grid">
                <div className="award-item god-item">
                  <img src={GOD_GIF_URL} alt="God of BG gif" className="award-gif" />
                  <div className="award-label">God of BG</div>
                  <div className="award-name">{godOfBg ? godOfBg.name : "-"}</div>
                  <div className="award-meta">KD {godOfBg ? godOfBg.kd.toFixed(2) : "0.00"}</div>
                </div>

                <div className="award-item loser-item">
                  <img src={LOSER_GIF_URL} alt="Loser bracket gif" className="award-gif" />
                  <div className="award-label">Loser Bracket</div>
                  <div className="award-name">{loserBracket ? loserBracket.name : "-"}</div>
                  <div className="award-meta">KD {loserBracket ? loserBracket.kd.toFixed(2) : "0.00"}</div>
                </div>
              </div>

              <div className="kd-track-list">
                {seasonKdTable.slice(0, 12).map((row, i) => (
                  <div key={row.name} className="kd-track-row">
                    <span>
                      {i + 1}. {row.name}
                    </span>
                    <span>KD {row.kd.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {submittedMvps.length > 0 && (
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
      </SignedIn>
    </div>
  );
}

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

interface PersistedState {
  showLeaderboard: boolean;
  data: Data;
  history: string[][];
  activeBG: BG;
  submittedMvps: SubmittedMvp[];
  updatedAt: number;
}

interface CloudStateRow {
  room_id: string;
  state: PersistedState;
  updated_at: string;
}

const STORAGE_KEY = "war-mvp-dashboard-state-v1";
const ROOM_ID = "global";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const SHARED_SYNC_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const POLL_INTERVAL_MS = 8000;

const calculateKD = (kills: number, deaths: number): number => {
  if (kills === 0 && deaths === 0) return 0;
  return kills / (deaths === 0 ? 1 : deaths);
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

const cloudHeaders = (): HeadersInit => {
  const key = SUPABASE_ANON_KEY ?? "";
  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
  };

  // Legacy anon key is JWT; publishable keys (sb_publishable_...) are not.
  if (key.split(".").length === 3) {
    headers.Authorization = `Bearer ${key}`;
  }

  return headers;
};

const fetchCloudState = async (): Promise<PersistedState | null> => {
  if (!SHARED_SYNC_ENABLED) return null;

  const url = `${SUPABASE_URL}/rest/v1/war_mvp_state?room_id=eq.${encodeURIComponent(ROOM_ID)}&select=state,updated_at&limit=1`;
  const res = await fetch(url, { headers: cloudHeaders() });
  if (!res.ok) {
    console.error("Failed to read shared state:", res.status, await res.text());
    return null;
  }

  const rows = (await res.json()) as Array<Pick<CloudStateRow, "state" | "updated_at">>;
  if (rows.length === 0) return null;

  const row = rows[0];
  if (!row?.state) return null;

  return {
    ...row.state,
    updatedAt: Number(row.state.updatedAt || Date.parse(row.updated_at) || 0),
  };
};

const saveCloudState = async (snapshot: PersistedState): Promise<void> => {
  if (!SHARED_SYNC_ENABLED) return;

  const url = `${SUPABASE_URL}/rest/v1/war_mvp_state?on_conflict=room_id`;
  const payload = [
    {
      room_id: ROOM_ID,
      state: snapshot,
      updated_at: new Date(snapshot.updatedAt).toISOString(),
    },
  ];

  await fetch(url, {
    method: "POST",
    headers: {
      ...cloudHeaders(),
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  });
};

export default function App() {
  const [showLeaderboard, setShowLeaderboard] = useState(true);
  const [data, setData] = useState<Data>(createInitialData());
  const [history, setHistory] = useState<string[][]>([]);
  const [activeBG, setActiveBG] = useState<BG>("BG1");
  const [submittedMvps, setSubmittedMvps] = useState<SubmittedMvp[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  const skipPersistOnceRef = useRef(false);
  const latestUpdatedAtRef = useRef(0);
  const cloudSaveTimerRef = useRef<number | null>(null);

  const applySnapshot = (snapshot: PersistedState) => {
    skipPersistOnceRef.current = true;
    latestUpdatedAtRef.current = snapshot.updatedAt || 0;

    setShowLeaderboard(snapshot.showLeaderboard);
    setData(snapshot.data);
    setHistory(snapshot.history);
    setActiveBG(snapshot.activeBG);
    setSubmittedMvps(snapshot.submittedMvps);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  };

  useEffect(() => {
    const boot = async () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<PersistedState>;
          const localSnapshot: PersistedState = {
            showLeaderboard: typeof parsed.showLeaderboard === "boolean" ? parsed.showLeaderboard : true,
            data: (parsed.data as Data) || createInitialData(),
            history: Array.isArray(parsed.history) ? parsed.history : [],
            activeBG: parsed.activeBG && BG_NAMES.includes(parsed.activeBG as BG) ? (parsed.activeBG as BG) : "BG1",
            submittedMvps: Array.isArray(parsed.submittedMvps) ? parsed.submittedMvps : [],
            updatedAt: Number(parsed.updatedAt || 0),
          };
          applySnapshot(localSnapshot);
        }
      } catch {
        // Ignore invalid local state.
      }

      if (SHARED_SYNC_ENABLED) {
        try {
          const remote = await fetchCloudState();
          if (remote && remote.updatedAt > latestUpdatedAtRef.current) {
            applySnapshot(remote);
          }
        } catch {
          // Ignore remote read failure.
        }
      }

      setIsHydrated(true);
    };

    void boot();

    return () => {
      if (cloudSaveTimerRef.current) window.clearTimeout(cloudSaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

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
      updatedAt: Date.now(),
    };

    latestUpdatedAtRef.current = snapshot.updatedAt;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));

    if (SHARED_SYNC_ENABLED) {
      if (cloudSaveTimerRef.current) window.clearTimeout(cloudSaveTimerRef.current);
      cloudSaveTimerRef.current = window.setTimeout(() => {
        void saveCloudState(snapshot);
      }, 700);
    }
  }, [isHydrated, showLeaderboard, data, history, activeBG, submittedMvps]);

  useEffect(() => {
    if (!isHydrated || !SHARED_SYNC_ENABLED) return;

    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const remote = await fetchCloudState();
          if (!remote) return;
          if (remote.updatedAt <= latestUpdatedAtRef.current) return;
          applySnapshot(remote);
        } catch {
          // Ignore polling failures.
        }
      })();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [isHydrated]);

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
      updatedAt: Date.now(),
    };

    latestUpdatedAtRef.current = resetSnapshot.updatedAt;
    setShowLeaderboard(resetSnapshot.showLeaderboard);
    setData(resetSnapshot.data);
    setHistory(resetSnapshot.history);
    setActiveBG(resetSnapshot.activeBG);
    setSubmittedMvps(resetSnapshot.submittedMvps);

    if (SHARED_SYNC_ENABLED) {
      void saveCloudState(resetSnapshot);
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

  return (
    <div className="app-shell">
      <h1 className="app-title">⚔ War MVP Dashboard</h1>

      {!SHARED_SYNC_ENABLED && (
        <p className="sync-note">Shared sync is off. Add Supabase env vars to share with friends.</p>
      )}

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
    </div>
  );
}

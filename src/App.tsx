import { useEffect, useMemo, useState } from "react";
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
}

const STORAGE_KEY = "war-mvp-dashboard-state-v1";

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

export default function App() {
  const [showLeaderboard, setShowLeaderboard] = useState(true);
  const [data, setData] = useState<Data>(createInitialData());
  const [history, setHistory] = useState<string[][]>([]);
  const [activeBG, setActiveBG] = useState<BG>("BG1");
  const [submittedMvps, setSubmittedMvps] = useState<SubmittedMvp[]>([]);
  const [isLoadedFromStorage, setIsLoadedFromStorage] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedState>;

      if (typeof parsed.showLeaderboard === "boolean") setShowLeaderboard(parsed.showLeaderboard);
      if (parsed.data) setData(parsed.data as Data);
      if (Array.isArray(parsed.history)) setHistory(parsed.history);
      if (parsed.activeBG && BG_NAMES.includes(parsed.activeBG as BG)) setActiveBG(parsed.activeBG as BG);
      if (Array.isArray(parsed.submittedMvps)) setSubmittedMvps(parsed.submittedMvps as SubmittedMvp[]);
    } catch {
      // Ignore bad local data and continue with defaults.
    } finally {
      setIsLoadedFromStorage(true);
    }
  }, []);

  useEffect(() => {
    if (!isLoadedFromStorage) return;

    const snapshot: PersistedState = {
      showLeaderboard,
      data,
      history,
      activeBG,
      submittedMvps,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }, [isLoadedFromStorage, showLeaderboard, data, history, activeBG, submittedMvps]);

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
    setShowLeaderboard(true);
    setData(createInitialData());
    setHistory([]);
    setActiveBG("BG1");
    setSubmittedMvps([]);
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

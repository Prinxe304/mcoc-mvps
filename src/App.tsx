import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const BG_NAMES = ["BG1", "BG2", "BG3"];
const PLAYERS_PER_BG = 10;

const calculateKD = (kills, deaths) => {
  if (kills === 0 && deaths === 0) return 0;
  return kills / (deaths === 0 ? 1 : deaths);
};

const createInitialData = (existingNames = null) => {
  return BG_NAMES.reduce((acc, bg) => {
    acc[bg] = Array.from({ length: PLAYERS_PER_BG }).map((_, i) => ({
      name: existingNames ? existingNames[bg][i].name : `${bg}-Player${i + 1}`,
      kills: 0,
      deaths: 0
    }));
    return acc;
  }, {});
};

export default function App() {
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [data, setData] = useState(createInitialData());
  const [history, setHistory] = useState([]);
  const [activeBG, setActiveBG] = useState("BG1");
  const [submittedMvps, setSubmittedMvps] = useState([]);

  const updatePlayer = (bg, index, field, value) => {
    setData((prev) => {
      const newData = { ...prev };
      newData[bg] = newData[bg].map((player, i) => {
        if (i !== index) return player;
        return {
          ...player,
          [field]: field === "name" ? value : Number(value)
        };
      });
      return newData;
    });
  };

  const bgResults = useMemo(() => {
    const results = {};
    BG_NAMES.forEach((bg) => {
      const players = data[bg].map((p) => ({
        ...p,
        kd: calculateKD(p.kills, p.deaths)
      }));

      players.sort((a, b) => {
        if (b.kd !== a.kd) return b.kd - a.kd;
        if (b.kills !== a.kills) return b.kills - a.kills;
        return a.deaths - b.deaths;
      });

      results[bg] = {
        players,
        mvp: players[0]
      };
    });
    return results;
  }, [data]);

  const submitWar = () => {
    let mvps = BG_NAMES.map((bg) => ({
      bg,
      name: bgResults[bg].mvp.name,
      kd: bgResults[bg].mvp.kd
    }));

    mvps = mvps.sort((a, b) => b.kd - a.kd);
    setSubmittedMvps(mvps);
    setHistory([...history, mvps.map((m) => m.name)]);
  };

  const resetWar = () => {
    setData(createInitialData(data));
    setSubmittedMvps([]);
  };

  const seasonLeaderboard = useMemo(() => {
    const count = {};
    history.flat().forEach((name) => {
      count[name] = (count[name] || 0) + 1;
    });
    return Object.entries(count).sort((a, b) => b[1] - a[1]);
  }, [history]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 via-white to-gray-200 text-gray-800 p-6">
      <h1 className="text-4xl font-bold text-center mb-10 text-gray-800">
        ⚔️ War MVP Dashboard
      </h1>

      {/* Tabs */}
      <div className="flex justify-center gap-3 mb-8">
        {BG_NAMES.map((bg) => (
          <Button
            key={bg}
            onClick={() => setActiveBG(bg)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition ${activeBG === bg
                ? "bg-blue-600 text-white shadow"
                : "bg-white border border-gray-300 text-gray-600 hover:bg-gray-100"
              }`}
          >
            {bg}
          </Button>
        ))}
      </div>

      {/* Active BG */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Card className="bg-white border border-gray-200 rounded-2xl max-w-3xl mx-auto shadow-sm">
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-center text-gray-700">
              {activeBG}
            </h2>

            {/* Header Row */}
            <div className="grid grid-cols-12 gap-2 mb-2 px-3 text-xs font-semibold text-gray-500">
              <div className="col-span-6">Player</div>
              <div className="col-span-2 text-center">Kills</div>
              <div className="col-span-2 text-center">Deaths</div>
              <div className="col-span-2 text-center">KD</div>
            </div>

            {data[activeBG].map((player, i) => {
              const kd = calculateKD(player.kills, player.deaths);
              const isMVP = bgResults[activeBG].mvp?.name === player.name;

              return (
                <motion.div
                  key={i}
                  whileHover={{ scale: 1.01 }}
                  className={`grid grid-cols-12 gap-2 mb-3 p-3 rounded-lg items-center transition ${isMVP
                      ? "bg-blue-50 border border-blue-200"
                      : "bg-gray-50"
                    }`}
                >
                  <Input
                    className="bg-white col-span-6"
                    value={player.name}
                    onChange={(e) =>
                      updatePlayer(activeBG, i, "name", e.target.value)
                    }
                  />
                  <Input
                    type="number"
                    placeholder="Kills"
                    className="bg-white text-center col-span-2"
                    value={player.kills === 0 ? "" : player.kills}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) =>
                      updatePlayer(activeBG, i, "kills", e.target.value === "" ? 0 : e.target.value)
                    }
                  />
                  <Input
                    type="number"
                    placeholder="Deaths"
                    className="bg-white text-center col-span-2"
                    value={player.deaths === 0 ? "" : player.deaths}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) =>
                      updatePlayer(activeBG, i, "deaths", e.target.value === "" ? 0 : e.target.value)
                    }
                  />

                  <div className="col-span-2 text-center font-semibold text-blue-600">
                    {kd.toFixed(2)}
                  </div>
                </motion.div>
              );
            })}

            <div className="text-center mt-4">
              <span className="text-gray-600">MVP:</span>{" "}
              <span className="text-blue-600 font-semibold">
                {bgResults[activeBG].mvp?.name}
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Buttons */}
      <div className="flex gap-3 justify-center mt-8">
        <Button className="bg-blue-600 hover:bg-blue-500 text-white px-6" onClick={submitWar}>
          Submit War
        </Button>
        <Button variant="outline" onClick={resetWar}>
          Next War
        </Button>
      </div>

      {/* Leaderboard */}
      {submittedMvps.length > 0 && (
        <Card className="bg-white border border-gray-200 mt-10 max-w-2xl mx-auto rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <div
              className="flex justify-between items-center cursor-pointer"
              onClick={() => setShowLeaderboard(!showLeaderboard)}
            >
              <h2 className="font-semibold text-gray-700">
                Season Leaderboard
              </h2>
              <span className="text-gray-500">
                {showLeaderboard ? "▲" : "▼"}
              </span>
            </div>

            {showLeaderboard && (
              <div className="mt-4 space-y-2">
                {seasonLeaderboard.map((p, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg flex justify-between ${i === 0
                        ? "bg-blue-50 text-blue-700 font-semibold"
                        : "text-gray-600"
                      }`}
                  >
                    <span>{i + 1}. {p[0]}</span>
                    <span>{p[1]} MVPs</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card className="bg-white border border-gray-200 mt-10 max-w-3xl mx-auto rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <h2 className="font-semibold text-gray-700 mb-4">
            War History
          </h2>
          {history.map((war, i) => (
            <div
              key={i}
              className="mb-4 p-4 rounded-xl bg-gray-50 border border-gray-200 shadow-sm"
            >
              <div className="flex justify-between items-center mb-2">
                <div className="text-blue-600 font-semibold">
                  War {i + 1}
                </div>
                <div className="text-sm text-gray-400">
                  {war.length} MVPs
                </div>
              </div>

              <div className="space-y-1">
                {war.map((player, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between text-gray-600 bg-white px-3 py-1 rounded-md"
                  >
                    <span>{idx + 1}. {player}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

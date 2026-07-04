import { useMemo, useState } from "react";
import { RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import {
  CHAMPION_COUNTER_DATABASE,
  WAR_NODE_PRESETS,
  applyNodePresetToDefender,
  createInitialWarPlannerState,
  getWarPlannerBgPlan,
  recommendWarPlan,
  setWarPlannerBgPlan,
  setWarPlannerSelectedBg,
  splitRosterChampions,
  suggestDefenderTags,
  type ChampionCounterProfile,
  type WarPlannerBG,
  type WarPlannerBGPlan,
  type WarPlannerMatchup,
  type WarPlannerState,
} from "../lib/warPlanner";

type Props = {
  canEdit: boolean;
  planner: WarPlannerState;
  onChange: (next: WarPlannerState) => void;
  onAiPlan?: (details: string, bg: WarPlannerBG) => Promise<string>;
  aiPlanError?: string;
  isAiPlanning?: boolean;
};

type ChampionClass = "science" | "skill" | "mystic" | "cosmic" | "tech" | "mutant";

const BG_NAMES: WarPlannerBG[] = ["BG1", "BG2", "BG3"];
const CHAMPION_CLASSES: ChampionClass[] = ["science", "skill", "mystic", "cosmic", "tech", "mutant"];
const STAR_FILTERS = ["7★", "6★", "5★"];
const RANK_FILTERS = ["R1", "R2", "R3", "R4", "R5", "R6"];

const CLASS_LABELS: Record<ChampionClass, string> = {
  science: "Science",
  skill: "Skill",
  mystic: "Mystic",
  cosmic: "Cosmic",
  tech: "Tech",
  mutant: "Mutant",
};

const updateArrayItem = <T,>(items: T[], index: number, updater: (value: T) => T): T[] =>
  items.map((item, itemIndex) => (itemIndex === index ? updater(item) : item));

const normalizeLoose = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const findChampionProfile = (text: string): ChampionCounterProfile | null => {
  const normalized = normalizeLoose(text);
  if (!normalized) return null;
  return (
    CHAMPION_COUNTER_DATABASE.find((profile) => {
      const names = [profile.name, ...profile.aliases];
      return names.some((name) => {
        const candidate = normalizeLoose(name);
        return normalized === candidate || normalized.includes(candidate);
      });
    }) ?? null
  );
};

const findKnownChampion = (text: string): string => findChampionProfile(text)?.name ?? text.trim();

const hashChampionClass = (name: string): ChampionClass => {
  const sum = normalizeLoose(name)
    .split("")
    .reduce((total, character) => total + character.charCodeAt(0), 0);
  return CHAMPION_CLASSES[sum % CHAMPION_CLASSES.length];
};

const getChampionClass = (name: string): ChampionClass => {
  const profile = findChampionProfile(name);
  const classTag = profile?.tags.find((tag) => CHAMPION_CLASSES.includes(tag as ChampionClass));
  return (classTag as ChampionClass | undefined) ?? hashChampionClass(name);
};

const championInitials = (name: string): string =>
  name
    .split(/\s+/g)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

const parsePlannerText = (text: string, plan: WarPlannerBGPlan): WarPlannerBGPlan => {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  const defenders = [...plan.defenders];
  const attackers = plan.attackers.map((attacker) => ({ ...attacker }));
  let section: "defenders" | "rosters" | null = null;
  let rosterIndex = 0;

  lines.forEach((line) => {
    const lower = line.toLowerCase();
    const defenderMatch = line.match(/^(?:tile|node)?\s*([1-9]|[1-4][0-9]|50)[).:\-\s,]+(.+)$/i);
    if (defenderMatch) {
      const index = Number(defenderMatch[1]) - 1;
      const preset = WAR_NODE_PRESETS[index];
      if (!preset || !defenders[index]) return;
      const rawName = defenderMatch[2].replace(/[|@].*$/g, "").trim();
      const name = findKnownChampion(rawName);
      const next = {
        ...applyNodePresetToDefender(defenders[index], preset.key),
        name,
      };
      defenders[index] = {
        ...next,
        tags: suggestDefenderTags(next),
      };
      section = "defenders";
      return;
    }

    if (/defender|defense|tile|node/.test(lower) && !/roster|player/.test(lower)) {
      section = "defenders";
      return;
    }
    if (/roster|player|attacker|attack/.test(lower)) {
      section = "rosters";
      return;
    }

    if (section === "rosters" || /[:=]/.test(line)) {
      if (rosterIndex >= attackers.length) return;
      const [namePart, rosterPartRaw] = /[:=]/.test(line) ? line.split(/[:=]/, 2) : [`Player ${rosterIndex + 1}`, line];
      const roster = String(rosterPartRaw || "")
        .split(/[,/|+\n]+/g)
        .map((champ) => findKnownChampion(champ))
        .filter(Boolean)
        .join(", ");
      if (!roster) return;
      attackers[rosterIndex] = {
        ...attackers[rosterIndex],
        name: namePart.trim() || `Player ${rosterIndex + 1}`,
        roster,
      };
      rosterIndex += 1;
    }
  });

  return {
    ...plan,
    defenders,
    attackers,
  };
};

const matchupLabel = (matchup: WarPlannerMatchup | null | undefined): string => {
  if (!matchup) return "Pick counter";
  const player = matchup.attacker.name || `Player ${matchup.attackerIndex + 1}`;
  return `${matchup.slot.name} · ${player}`;
};

const scoreLabel = (matchup: WarPlannerMatchup | null | undefined): string => {
  if (!matchup) return "No plan yet";
  if (matchup.score >= 90) return "Elite counter";
  if (matchup.score >= 70) return "Strong counter";
  if (matchup.score >= 48) return "Safe counter";
  return "Playable";
};

export default function WarPlannerPanel({ canEdit, planner, onChange, onAiPlan, aiPlanError, isAiPlanning }: Props) {
  const activeBg = planner.selectedBg || "BG1";
  const activePlan = getWarPlannerBgPlan(planner, activeBg);
  const plan = useMemo(() => recommendWarPlan(planner, activeBg), [planner, activeBg]);
  const [aiDraft, setAiDraft] = useState("");
  const [selectedTileIndex, setSelectedTileIndex] = useState(0);
  const [selectedPlayerIndex, setSelectedPlayerIndex] = useState(0);
  const [selectedClass, setSelectedClass] = useState<ChampionClass | "all">("all");
  const [selectedStar, setSelectedStar] = useState("7★");
  const [selectedRank, setSelectedRank] = useState("R3");
  const [selectedRosterChampion, setSelectedRosterChampion] = useState("");

  const selectedPreset = WAR_NODE_PRESETS[selectedTileIndex] ?? WAR_NODE_PRESETS[0];
  const selectedDefender = activePlan.defenders[selectedTileIndex] ?? activePlan.defenders[0];
  const selectedRecommendation = plan.defenders[selectedTileIndex];
  const selectedMatchup = selectedRecommendation?.assigned ?? selectedRecommendation?.best ?? null;
  const selectedPlayer = activePlan.attackers[selectedPlayerIndex] ?? activePlan.attackers[0];
  const selectedRoster = splitRosterChampions(selectedPlayer?.roster ?? "");
  const filteredRoster = selectedRoster.filter((champion) => selectedClass === "all" || getChampionClass(champion) === selectedClass);
  const tableRows = activePlan.defenders.map((defender, index) => {
    const recommendation = plan.defenders[index];
    return {
      defender,
      index,
      preset: WAR_NODE_PRESETS[index],
      matchup: recommendation?.assigned ?? recommendation?.best ?? null,
    };
  });

  const setActiveBg = (bg: WarPlannerBG) => {
    setSelectedTileIndex(0);
    onChange(setWarPlannerSelectedBg(planner, bg));
  };

  const setActivePlan = (nextPlan: WarPlannerBGPlan) => {
    if (!canEdit) return;
    onChange(setWarPlannerBgPlan(planner, activeBg, nextPlan));
  };

  const updateDefenderName = (index: number, value: string) => {
    setActivePlan({
      ...activePlan,
      defenders: updateArrayItem(activePlan.defenders, index, (defender) => {
        const next = { ...defender, name: findKnownChampion(value) || value };
        return { ...next, tags: suggestDefenderTags(next) };
      }),
    });
  };

  const updateRoster = (index: number, field: "name" | "roster", value: string) => {
    setActivePlan({
      ...activePlan,
      attackers: updateArrayItem(activePlan.attackers, index, (attacker) => ({
        ...attacker,
        [field]: value,
      })),
    });
  };

  const applyAutoDetails = () => {
    setActivePlan({
      ...activePlan,
      defenders: activePlan.defenders.map((defender, index) => {
        const preset = WAR_NODE_PRESETS[index];
        const next = preset ? applyNodePresetToDefender(defender, preset.key) : defender;
        return { ...next, tags: suggestDefenderTags(next) };
      }),
    });
  };

  const buildLocal = (text = aiDraft) => {
    const parsed = parsePlannerText(text, activePlan);
    setActivePlan({
      ...parsed,
      defenders: parsed.defenders.map((defender, index) => {
        const preset = WAR_NODE_PRESETS[index];
        const next = preset ? applyNodePresetToDefender(defender, preset.key) : defender;
        return { ...next, tags: suggestDefenderTags(next) };
      }),
    });
  };

  const askAi = async () => {
    if (!canEdit || !onAiPlan || !aiDraft.trim()) return;
    const plannerText = await onAiPlan(aiDraft, activeBg);
    setAiDraft(plannerText);
    buildLocal(plannerText);
  };

  const resetPlanner = () => {
    setActivePlan(getWarPlannerBgPlan(createInitialWarPlannerState(), activeBg));
    setSelectedTileIndex(0);
    setSelectedRosterChampion("");
  };

  return (
    <Card className="card-secondary card-planner planner-dark-shell">
      <CardContent className="card-secondary-content">
        <div className="planner-head">
          <div>
            <h2 className="section-title-left planner-title">AW Planner</h2>
            <p className="planner-subtitle">Enter defender names tile-wise, add each player's full roster, then let the planner assign the best 3 fights.</p>
            <div className="planner-bg-tabs">
              {BG_NAMES.map((bg) => (
                <Button
                  key={bg}
                  type="button"
                  className={`planner-bg-tab ${activeBg === bg ? "is-active" : ""}`}
                  onClick={() => setActiveBg(bg)}
                >
                  {bg}
                </Button>
              ))}
            </div>
          </div>
          <div className="planner-toolbar">
            <Button type="button" className="btn-secondary planner-tool-btn" onClick={applyAutoDetails} disabled={!canEdit}>
              <Sparkles aria-hidden="true" />
              Nodes
            </Button>
            <Button type="button" className="btn-secondary planner-icon-btn" onClick={resetPlanner} disabled={!canEdit} title="Reset active BG">
              <RotateCcw aria-hidden="true" />
            </Button>
          </div>
        </div>

        {canEdit && (
          <div className="planner-command-bar">
            <div>
              <strong>AI import</strong>
              <span>Paste defenders and rosters. Free AI formats it, local planner assigns fights.</span>
            </div>
            <div className="planner-ai-actions">
              <Button
                type="button"
                className="btn-primary planner-tool-btn"
                onClick={() => void askAi()}
                disabled={!onAiPlan || !aiDraft.trim() || Boolean(isAiPlanning)}
              >
                <Wand2 aria-hidden="true" />
                {isAiPlanning ? "Planning..." : "Use AI"}
              </Button>
              <Button type="button" className="btn-secondary planner-tool-btn" onClick={() => buildLocal()} disabled={!aiDraft.trim()}>
                Build
              </Button>
            </div>
            {aiPlanError && <div className="planner-ai-error">{aiPlanError}</div>}
            <textarea
              className="planner-ai-input"
              value={aiDraft}
              onChange={(e) => setAiDraft(e.target.value)}
              placeholder={`Defenders\n1 Korg\n2 Photon\n3 Hulkling\n\nRosters\nPrince: Jean Grey, Doctor Doom, Scorpion, Hercules, Kate Bishop\nSerwan: Kate Bishop, Absorbing Man, Warlock, Hulkling`}
            />
          </div>
        )}

        <div className="planner-war-table">
          <div className="planner-war-header">
            <span>War Info</span>
            <span>Alliance</span>
            <span>Node</span>
            <span>Attacker</span>
            <span>Defender</span>
            <span>Prefights</span>
            <span>Player</span>
          </div>
          <div className="planner-war-body">
            {tableRows.map(({ defender, index, preset, matchup }) => {
              const attackerClass = getChampionClass(matchup?.slot.name || defender.name || preset?.name || "champion");
              const defenderClass = getChampionClass(defender.name || preset?.name || "defender");
              return (
                <button
                  key={defender.id}
                  type="button"
                  className={`planner-war-row ${selectedTileIndex === index ? "is-selected" : ""}`}
                  onClick={() => setSelectedTileIndex(index)}
                >
                  <span className="planner-war-info">
                    <b>S68</b>
                    <b>W-</b>
                    <b>T{preset?.placement ?? index + 1}</b>
                  </span>
                  <span className="planner-war-alliance">Night Guardians</span>
                  <span className="planner-node-number">{preset?.placement ?? index + 1}</span>
                  <span className={`planner-champ-pill class-${attackerClass}`}>
                    <span className="planner-avatar">{championInitials(matchup?.slot.name || "Pick")}</span>
                    <span>{matchup ? matchup.slot.name : "Pick counter"}</span>
                  </span>
                  <span className={`planner-champ-pill class-${defenderClass}`}>
                    <span className="planner-avatar">{championInitials(defender.name || "Def")}</span>
                    <Input
                      value={defender.name}
                      disabled={!canEdit}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => updateDefenderName(index, event.target.value)}
                      placeholder="Defender"
                    />
                  </span>
                  <span className="planner-prefight">{activePlan.support.active ? activePlan.support.name || "Prefight" : "-"}</span>
                  <span className="planner-player-cell">
                    <strong>{matchup?.attacker.name || "Unassigned"}</strong>
                    <small>{activeBg}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="planner-detail-grid">
          <section className="planner-tile-detail">
            <div className="planner-detail-top">
              <div>
                <span className="planner-eyebrow">Tile {selectedPreset?.placement}</span>
                <h3>{selectedDefender?.name || "Add defender name"}</h3>
                <p>{selectedPreset?.path} · {selectedPreset?.name}</p>
              </div>
              <div className="planner-difficulty">
                <span>Difficulty</span>
                <b>{selectedPreset?.difficulty}</b>
              </div>
            </div>

            <div className="planner-versus-card">
              <div className={`planner-big-champ class-${getChampionClass(selectedDefender?.name || selectedPreset?.name || "defender")}`}>
                <span className="planner-big-avatar">{championInitials(selectedDefender?.name || "Def")}</span>
                <strong>{selectedDefender?.name || "Defender"}</strong>
                <small>Defender</small>
              </div>
              <div className="planner-vs">VS</div>
              <div className={`planner-big-champ class-${getChampionClass(selectedMatchup?.slot.name || "counter")}`}>
                <span className="planner-big-avatar">{championInitials(selectedMatchup?.slot.name || "Pick")}</span>
                <strong>{matchupLabel(selectedMatchup)}</strong>
                <small>{scoreLabel(selectedMatchup)}</small>
              </div>
            </div>

            <div className="planner-restrictions">
              <strong>Restrictions</strong>
              {selectedPreset?.restrictions.map((restriction) => (
                <span key={restriction}>{restriction}</span>
              ))}
            </div>

            <div className="planner-encounter-head">
              <span>Encounter Nodes</span>
              <button type="button" onClick={() => setSelectedTileIndex(Math.max(0, selectedTileIndex - 1))}>⌃</button>
            </div>
            <div className="planner-node-card-grid">
              {selectedPreset?.encounterNodes.map((node) => (
                <article key={node.name} className="planner-node-card">
                  <span>i</span>
                  <div>
                    <h4>{node.name}</h4>
                    <p>{node.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="planner-roster-browser">
            <div className="planner-roster-head">
              <div>
                <span className="planner-eyebrow">Player Roster</span>
                <h3>{selectedPlayer?.name || `Player ${selectedPlayerIndex + 1}`}</h3>
              </div>
              <select
                className="planner-player-select"
                value={selectedPlayerIndex}
                disabled={!canEdit}
                onChange={(event) => {
                  setSelectedPlayerIndex(Number(event.target.value));
                  setSelectedRosterChampion("");
                }}
              >
                {activePlan.attackers.map((attacker, index) => (
                  <option key={attacker.id} value={index}>
                    {attacker.name || `Player ${index + 1}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="planner-roster-editor">
              <Input
                value={selectedPlayer?.name ?? ""}
                disabled={!canEdit}
                onChange={(event) => updateRoster(selectedPlayerIndex, "name", event.target.value)}
                placeholder={`Player ${selectedPlayerIndex + 1}`}
              />
              <textarea
                className="planner-roster-input"
                value={selectedPlayer?.roster ?? ""}
                disabled={!canEdit}
                onChange={(event) => updateRoster(selectedPlayerIndex, "roster", event.target.value)}
                placeholder="Paste full roster: Hercules, Doctor Doom, Kate Bishop, Scorpion..."
              />
            </div>

            <div className="planner-filter-panel">
              <div className="planner-filter-row">
                {STAR_FILTERS.map((star) => (
                  <button key={star} type="button" className={selectedStar === star ? "is-active" : ""} onClick={() => setSelectedStar(star)}>
                    {star}
                  </button>
                ))}
              </div>
              <div className="planner-filter-row">
                {RANK_FILTERS.map((rank) => (
                  <button key={rank} type="button" className={selectedRank === rank ? "is-active" : ""} onClick={() => setSelectedRank(rank)}>
                    {rank}
                  </button>
                ))}
              </div>
              <div className="planner-class-row">
                <button type="button" className={selectedClass === "all" ? "is-active" : ""} onClick={() => setSelectedClass("all")}>
                  All
                </button>
                {CHAMPION_CLASSES.map((championClass) => (
                  <button
                    key={championClass}
                    type="button"
                    className={`class-dot class-${championClass} ${selectedClass === championClass ? "is-active" : ""}`}
                    onClick={() => setSelectedClass(championClass)}
                    title={CLASS_LABELS[championClass]}
                  >
                    {CLASS_LABELS[championClass][0]}
                  </button>
                ))}
              </div>
              <div className="planner-dropdown-row">
                <button type="button">Tags</button>
                <button type="button">Categories</button>
                <button type="button">Abilities</button>
                <button type="button">Immunities</button>
              </div>
            </div>

            <div className="planner-champion-grid">
              {filteredRoster.length === 0 ? (
                <div className="planner-empty-roster">Add roster champs for this player to see selectable cards.</div>
              ) : (
                filteredRoster.map((champion) => {
                  const championClass = getChampionClass(champion);
                  const selected = selectedRosterChampion === champion;
                  return (
                    <button
                      key={champion}
                      type="button"
                      className={`planner-champion-card class-${championClass} ${selected ? "is-selected" : ""}`}
                      onClick={() => setSelectedRosterChampion(champion)}
                    >
                      <span>{championInitials(champion)}</span>
                      <strong>{champion}</strong>
                      <small>{selectedStar} · {selectedRank}</small>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}

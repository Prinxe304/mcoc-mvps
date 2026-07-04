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
  suggestSlotTags,
  type WarPlannerBG,
  type WarPlannerBGPlan,
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

const BG_NAMES: WarPlannerBG[] = ["BG1", "BG2", "BG3"];

const updateArrayItem = <T,>(items: T[], index: number, updater: (value: T) => T): T[] =>
  items.map((item, itemIndex) => (itemIndex === index ? updater(item) : item));

const normalizeLoose = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const findKnownChampion = (text: string): string => {
  const normalized = normalizeLoose(text);
  if (!normalized) return "";
  const profiles = [...CHAMPION_COUNTER_DATABASE].sort((a, b) => b.name.length - a.name.length);
  const match = profiles.find((profile) => {
    const names = [profile.name, ...profile.aliases];
    return names.some((name) => {
      const candidate = normalizeLoose(name);
      return normalized === candidate || normalized.includes(candidate);
    });
  });
  return match?.name ?? text.trim();
};

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

export default function WarPlannerPanel({ canEdit, planner, onChange, onAiPlan, aiPlanError, isAiPlanning }: Props) {
  const activeBg = planner.selectedBg || "BG1";
  const activePlan = getWarPlannerBgPlan(planner, activeBg);
  const plan = useMemo(() => recommendWarPlan(planner, activeBg), [planner, activeBg]);
  const [aiDraft, setAiDraft] = useState("");

  const setActiveBg = (bg: WarPlannerBG) => onChange(setWarPlannerSelectedBg(planner, bg));

  const setActivePlan = (nextPlan: WarPlannerBGPlan) => {
    if (!canEdit) return;
    onChange(setWarPlannerBgPlan(planner, activeBg, nextPlan));
  };

  const updateDefenderName = (index: number, value: string) => {
    setActivePlan({
      ...activePlan,
      defenders: updateArrayItem(activePlan.defenders, index, (defender) => {
        const next = { ...defender, name: value };
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
      attackers: activePlan.attackers.map((attacker) => ({
        ...attacker,
        slots: attacker.slots.map((slot) => ({ ...slot, tags: suggestSlotTags(slot, attacker) })),
      })),
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
  };

  const assignmentsByPlayer = useMemo(() => {
    const groups = activePlan.attackers.map((attacker, index) => ({
      index,
      name: attacker.name || `Player ${index + 1}`,
      roster: splitRosterChampions(attacker.roster),
      assignments: plan.assignments.filter((assignment) => assignment.attackerIndex === index),
    }));
    return groups.filter((group) => group.roster.length > 0 || group.assignments.length > 0);
  }, [activePlan.attackers, plan.assignments]);

  return (
    <Card className="card-secondary card-planner">
      <CardContent className="card-secondary-content">
        <div className="planner-head">
          <div>
            <h2 className="section-title-left">War Planner</h2>
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
              Auto Details
            </Button>
            <Button type="button" className="btn-secondary planner-icon-btn" onClick={resetPlanner} disabled={!canEdit} title="Reset active BG">
              <RotateCcw aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="planner-ai-panel">
          <div className="planner-ai-copy">
            <h3 className="planner-section-title">Paste Details</h3>
            <div className="planner-ai-actions">
              <Button
                type="button"
                className="btn-primary planner-tool-btn"
                onClick={() => void askAi()}
                disabled={!canEdit || !onAiPlan || !aiDraft.trim() || Boolean(isAiPlanning)}
              >
                <Wand2 aria-hidden="true" />
                {isAiPlanning ? "Planning..." : "Use AI"}
              </Button>
              <Button type="button" className="btn-secondary planner-tool-btn" onClick={() => buildLocal()} disabled={!canEdit || !aiDraft.trim()}>
                Build
              </Button>
            </div>
          </div>
          {aiPlanError && <div className="planner-ai-error">{aiPlanError}</div>}
          <textarea
            className="planner-ai-input"
            value={aiDraft}
            disabled={!canEdit}
            onChange={(e) => setAiDraft(e.target.value)}
            placeholder={`Defenders\n1 Korg\n2 Photon\n3 Hulkling\n\nRosters\nPrince: Jean Grey, Doctor Doom, Scorpion, Hercules, Kate Bishop\nSerwan: Kate Bishop, Absorbing Man, Warlock, Hulkling`}
          />
        </div>

        <div className="planner-panel planner-results-panel planner-results-top">
          <div className="planner-panel-content">
            <div className="planner-results-head">
              <h3 className="planner-section-title">Player Assignments</h3>
              <div className="planner-chip">{plan.assignments.length} fights planned</div>
            </div>
            {assignmentsByPlayer.length === 0 ? (
              <p className="planner-hint">Add defender names and player rosters, then build the plan.</p>
            ) : (
              <div className="planner-player-plan-grid">
                {assignmentsByPlayer.map((group) => (
                  <div key={group.index} className="planner-player-plan-card">
                    <div className="planner-player-plan-head">
                      <strong>{group.name}</strong>
                      <span>{group.assignments.length}/3 fights</span>
                    </div>
                    <div className="planner-roster-preview">{group.roster.slice(0, 8).join(", ")}</div>
                    <div className="planner-player-fights">
                      {group.assignments.length === 0 ? (
                        <span className="planner-muted">No defender assigned yet</span>
                      ) : (
                        group.assignments.map((assignment) => (
                          <div key={`${assignment.defenderIndex}-${assignment.slot.name}`} className="planner-fight-row">
                            <span>
                              Tile {assignment.defender.placement}: {assignment.defender.name}
                            </span>
                            <strong>{assignment.slot.name}</strong>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="planner-grid planner-clean-grid">
          <div className="planner-panel">
            <div className="planner-panel-content">
              <h3 className="planner-section-title">Player Rosters</h3>
              <div className="planner-list">
                {activePlan.attackers.map((attacker, index) => (
                  <div key={attacker.id} className="planner-row planner-roster-row">
                    <Input
                      value={attacker.name}
                      disabled={!canEdit}
                      onChange={(e) => updateRoster(index, "name", e.target.value)}
                      placeholder={`Player ${index + 1}`}
                    />
                    <textarea
                      className="planner-roster-input"
                      value={attacker.roster}
                      disabled={!canEdit}
                      onChange={(e) => updateRoster(index, "roster", e.target.value)}
                      placeholder="Full roster: Hercules, Doom, Scorpion, Kate Bishop..."
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="planner-panel">
            <div className="planner-panel-content">
              <h3 className="planner-section-title">Tile Defenders</h3>
              <div className="planner-list planner-defender-list">
                {activePlan.defenders.map((defender, index) => {
                  const preset = WAR_NODE_PRESETS[index];
                  const best = plan.defenders[index]?.best ?? null;
                  return (
                    <div key={defender.id} className={`planner-tile-row ${best ? "is-assigned" : ""}`}>
                      <div className="planner-tile-meta">
                        <strong>Tile {preset?.placement ?? index + 1}</strong>
                        <span>{preset?.path}</span>
                      </div>
                      <div className="planner-tile-body">
                        <div className="planner-tile-node">
                          <strong>{preset?.name}</strong>
                          <span>{preset?.notes}</span>
                        </div>
                        <Input
                          value={defender.name}
                          disabled={!canEdit}
                          onChange={(e) => updateDefenderName(index, e.target.value)}
                          placeholder="Defender name"
                        />
                      </div>
                      <div className="planner-tile-best">{best ? `${best.attacker.name || "Player"}: ${best.slot.name}` : "Waiting"}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

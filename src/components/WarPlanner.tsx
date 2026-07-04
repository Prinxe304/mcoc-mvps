import { useMemo, useRef, useState } from "react";
import { Download, RotateCcw, Sparkles, Upload, Wand2 } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import {
  WAR_NODE_PRESETS,
  CHAMPION_COUNTER_DATABASE,
  applyNodePresetToDefender,
  createInitialWarPlannerState,
  getWarPlannerBgPlan,
  recommendWarPlan,
  setWarPlannerBgPlan,
  setWarPlannerSelectedBg,
  suggestDefenderTags,
  suggestSlotTags,
  type WarPlannerAttackerRow,
  type WarPlannerAttackerSlot,
  type WarPlannerBG,
  type WarPlannerBGPlan,
  type WarPlannerDefender,
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

const updateTextField = <T,>(row: T, field: keyof T, value: string | boolean): T =>
  ({
    ...(row as Record<string, unknown>),
    [field]: value,
  }) as T;

const slotLabel = (slotIndex: number): string => `Slot ${slotIndex + 1}`;

const csvEscape = (value: unknown): string => {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
};

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(value);
      value = "";
      continue;
    }
    if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }
    if (char !== "\r") value += char;
  }

  row.push(value);
  rows.push(row);
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
};

const rowsToObjects = (csvText: string): Array<Record<string, string>> => {
  const rows = parseCsv(csvText);
  const headers = rows[0]?.map((header) => header.trim()) ?? [];
  return rows.slice(1).map((cells) =>
    headers.reduce((acc, header, index) => {
      acc[header] = cells[index] ?? "";
      return acc;
    }, {} as Record<string, string>),
  );
};

const downloadCsv = (filename: string, rows: Array<Array<string | number | boolean>>) => {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const readFileText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

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

const parseLoosePlannerText = (text: string, plan: WarPlannerBGPlan): WarPlannerBGPlan => {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  const defenders = [...plan.defenders];
  const attackers = plan.attackers.map((attacker) => ({ ...attacker, slots: [...attacker.slots] }));
  let section: "defenders" | "attackers" | null = null;
  let attackerIndex = 0;

  lines.forEach((line) => {
    const lower = line.toLowerCase();
    const defenderMatch = line.match(/^(?:node\s*)?([1-9]|[1-4][0-9]|50)[).:\-\s,]+(.+)$/i);
    if ((section === "defenders" || defenderMatch) && defenderMatch) {
      const index = Number(defenderMatch[1]) - 1;
      if (index < 0 || index >= defenders.length) return;
      const preset = WAR_NODE_PRESETS[index];
      const raw = defenderMatch[2]
        .replace(/\bnode\b.*$/i, "")
        .replace(/\bpath\b.*$/i, "")
        .replace(/[|@].*$/g, "")
        .trim();
      const defenderName = findKnownChampion(raw);
      defenders[index] = {
        ...applyNodePresetToDefender(defenders[index], preset?.key ?? defenders[index].nodeKey),
        name: defenderName,
      };
      defenders[index].tags = suggestDefenderTags(defenders[index]);
      return;
    }

    if (/defen|map|node/.test(lower) && !/attacker|roster/.test(lower)) {
      section = "defenders";
      return;
    }
    if (/attack|roster|player/.test(lower)) {
      section = "attackers";
      return;
    }

    if (section === "attackers" || /[:=]/.test(line)) {
      if (attackerIndex >= attackers.length) return;
      const [namePart, champsPartRaw] = /[:=]/.test(line) ? line.split(/[:=]/, 2) : [`Attacker ${attackerIndex + 1}`, line];
      const champs = String(champsPartRaw || "")
        .split(/[,/|+]/g)
        .map((champ) => findKnownChampion(champ))
        .filter(Boolean)
        .slice(0, 3);
      if (champs.length === 0) return;
      attackers[attackerIndex] = {
        ...attackers[attackerIndex],
        name: namePart.trim() || `Attacker ${attackerIndex + 1}`,
        slots: attackers[attackerIndex].slots.map((slot, slotIndex) => ({
          ...slot,
          name: champs[slotIndex] || slot.name,
        })),
      };
      attackers[attackerIndex].slots = attackers[attackerIndex].slots.map((slot) => ({
        ...slot,
        tags: suggestSlotTags(slot, attackers[attackerIndex]),
      }));
      attackerIndex += 1;
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
  const defenderImportRef = useRef<HTMLInputElement | null>(null);
  const attackerImportRef = useRef<HTMLInputElement | null>(null);
  const [aiDraft, setAiDraft] = useState("");

  const setActiveBg = (bg: WarPlannerBG) => {
    onChange(setWarPlannerSelectedBg(planner, bg));
  };

  const setActivePlan = (nextPlan: WarPlannerBGPlan) => {
    if (!canEdit) return;
    onChange(setWarPlannerBgPlan(planner, activeBg, nextPlan));
  };

  const setSupportField = (field: keyof WarPlannerBGPlan["support"], value: string | boolean) => {
    setActivePlan({
      ...activePlan,
      support: {
        ...activePlan.support,
        [field]: value,
      },
    });
  };

  const updateDefender = (index: number, field: keyof WarPlannerDefender, value: string) => {
    setActivePlan({
      ...activePlan,
      defenders: updateArrayItem(activePlan.defenders, index, (row) => updateTextField(row, field, value)),
    });
  };

  const updateNodePreset = (index: number, presetKey: string) => {
    setActivePlan({
      ...activePlan,
      defenders: updateArrayItem(activePlan.defenders, index, (row) => applyNodePresetToDefender(row, presetKey)),
    });
  };

  const updateAttacker = (index: number, field: keyof WarPlannerAttackerRow, value: string | boolean) => {
    setActivePlan({
      ...activePlan,
      attackers: updateArrayItem(activePlan.attackers, index, (row) => updateTextField(row, field, value)),
    });
  };

  const updateSlot = (attackerIndex: number, slotIndex: number, field: keyof WarPlannerAttackerSlot, value: string) => {
    setActivePlan({
      ...activePlan,
      attackers: updateArrayItem(activePlan.attackers, attackerIndex, (attacker) => ({
        ...attacker,
        slots: updateArrayItem(attacker.slots, slotIndex, (slot) => updateTextField(slot, field, value)),
      })),
    });
  };

  const smartFill = () => {
    if (!canEdit) return;
    setActivePlan({
      ...activePlan,
      defenders: activePlan.defenders.map((defender) => ({
        ...defender,
        tags: suggestDefenderTags(defender),
      })),
      attackers: activePlan.attackers.map((attacker) => ({
        ...attacker,
        slots: attacker.slots.map((slot) => ({
          ...slot,
          tags: suggestSlotTags(slot, attacker),
        })),
      })),
    });
  };

  const buildFromAiDraft = () => {
    if (!canEdit) return;
    const parsed = parseLoosePlannerText(aiDraft, activePlan);
    setActivePlan({
      ...parsed,
      defenders: parsed.defenders.map((defender) => ({
        ...defender,
        tags: suggestDefenderTags(defender),
      })),
      attackers: parsed.attackers.map((attacker) => ({
        ...attacker,
        slots: attacker.slots.map((slot) => ({
          ...slot,
          tags: suggestSlotTags(slot, attacker),
        })),
      })),
    });
  };

  const askFreeAi = async () => {
    if (!canEdit || !onAiPlan || !aiDraft.trim()) return;
    const plannerText = await onAiPlan(aiDraft, activeBg);
    setAiDraft(plannerText);
    const parsed = parseLoosePlannerText(plannerText, activePlan);
    setActivePlan({
      ...parsed,
      defenders: parsed.defenders.map((defender) => ({
        ...defender,
        tags: suggestDefenderTags(defender),
      })),
      attackers: parsed.attackers.map((attacker) => ({
        ...attacker,
        slots: attacker.slots.map((slot) => ({
          ...slot,
          tags: suggestSlotTags(slot, attacker),
        })),
      })),
    });
  };

  const resetPlanner = () => {
    if (!canEdit) return;
    setActivePlan(getWarPlannerBgPlan(createInitialWarPlannerState(), activeBg));
  };

  const exportDefenders = () => {
    downloadCsv(`${activeBg.toLowerCase()}-defenders.csv`, [
      ["bg", "placement", "path", "defender", "nodePreset", "nodeText", "tags", "notes"],
      ...activePlan.defenders.map((defender) => [
        activeBg,
        defender.placement,
        defender.path,
        defender.name,
        defender.nodeKey,
        defender.node,
        defender.tags,
        defender.notes,
      ]),
    ]);
  };

  const exportAttackers = () => {
    downloadCsv(`${activeBg.toLowerCase()}-attackers.csv`, [
      [
        "bg",
        "attacker",
        "playerTags",
        "playerNotes",
        "prefightSupport",
        "slot1",
        "slot1Tags",
        "slot1Notes",
        "slot2",
        "slot2Tags",
        "slot2Notes",
        "slot3",
        "slot3Tags",
        "slot3Notes",
      ],
      ...activePlan.attackers.map((attacker) => [
        activeBg,
        attacker.name,
        attacker.tags,
        attacker.notes,
        attacker.prefightSupport,
        attacker.slots[0]?.name ?? "",
        attacker.slots[0]?.tags ?? "",
        attacker.slots[0]?.notes ?? "",
        attacker.slots[1]?.name ?? "",
        attacker.slots[1]?.tags ?? "",
        attacker.slots[1]?.notes ?? "",
        attacker.slots[2]?.name ?? "",
        attacker.slots[2]?.tags ?? "",
        attacker.slots[2]?.notes ?? "",
      ]),
    ]);
  };

  const importDefenders = async (file: File) => {
    if (!canEdit) return;
    const rows = rowsToObjects(await readFileText(file));
    const nextDefenders = [...activePlan.defenders];
    rows.slice(0, nextDefenders.length).forEach((row, index) => {
      const placement = row.placement || String(index + 1);
      const preset = WAR_NODE_PRESETS.find((item) => item.key === row.nodePreset || item.placement === placement) ?? WAR_NODE_PRESETS[index];
      nextDefenders[index] = {
        ...nextDefenders[index],
        placement,
        path: row.path || preset?.path || nextDefenders[index].path,
        name: row.defender || row.name || "",
        nodeKey: row.nodePreset || preset?.key || nextDefenders[index].nodeKey,
        node: row.nodeText || row.node || preset?.name || nextDefenders[index].node,
        tags: row.tags || preset?.tags || "",
        notes: row.notes || "",
      };
    });
    setActivePlan({ ...activePlan, defenders: nextDefenders });
  };

  const importAttackers = async (file: File) => {
    if (!canEdit) return;
    const rows = rowsToObjects(await readFileText(file));
    const nextAttackers = [...activePlan.attackers];
    rows.slice(0, nextAttackers.length).forEach((row, index) => {
      nextAttackers[index] = {
        ...nextAttackers[index],
        name: row.attacker || row.name || "",
        tags: row.playerTags || row.tags || "",
        notes: row.playerNotes || row.notes || "",
        prefightSupport: String(row.prefightSupport || "").toLowerCase() === "true",
        slots: [0, 1, 2].map((slotIndex) => ({
          id: nextAttackers[index].slots[slotIndex]?.id || `slot-${slotIndex + 1}`,
          name: row[`slot${slotIndex + 1}`] || "",
          tags: row[`slot${slotIndex + 1}Tags`] || "",
          notes: row[`slot${slotIndex + 1}Notes`] || "",
        })),
      };
    });
    setActivePlan({ ...activePlan, attackers: nextAttackers });
  };

  return (
    <Card className="card-secondary card-planner">
      <CardContent className="card-secondary-content">
        <input
          ref={defenderImportRef}
          type="file"
          accept=".csv,text/csv"
          className="planner-file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importDefenders(file);
            e.currentTarget.value = "";
          }}
        />
        <input
          ref={attackerImportRef}
          type="file"
          accept=".csv,text/csv"
          className="planner-file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importAttackers(file);
            e.currentTarget.value = "";
          }}
        />

        <div className="planner-head">
          <div>
            <h2 className="section-title-left">AI War Planner</h2>
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
            <Button type="button" className="btn-secondary planner-tool-btn" onClick={smartFill} disabled={!canEdit}>
              <Sparkles aria-hidden="true" />
              AI Tags
            </Button>
            <Button type="button" className="btn-secondary planner-tool-btn" onClick={() => defenderImportRef.current?.click()} disabled={!canEdit}>
              <Upload aria-hidden="true" />
              Defenders
            </Button>
            <Button type="button" className="btn-secondary planner-tool-btn" onClick={() => attackerImportRef.current?.click()} disabled={!canEdit}>
              <Upload aria-hidden="true" />
              Attackers
            </Button>
            <Button type="button" className="btn-secondary planner-icon-btn" onClick={exportDefenders} title="Export defenders CSV">
              <Download aria-hidden="true" />
            </Button>
            <Button type="button" className="btn-secondary planner-icon-btn" onClick={exportAttackers} title="Export attackers CSV">
              <Download aria-hidden="true" />
            </Button>
            <Button type="button" className="btn-secondary planner-icon-btn" onClick={resetPlanner} disabled={!canEdit} title="Reset active BG">
              <RotateCcw aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="planner-ai-panel">
          <div className="planner-ai-copy">
            <h3 className="planner-section-title">AI Assist</h3>
            <div className="planner-ai-actions">
              <Button
                type="button"
                className="btn-primary planner-tool-btn"
                onClick={() => void askFreeAi()}
                disabled={!canEdit || !onAiPlan || !aiDraft.trim() || Boolean(isAiPlanning)}
              >
                <Wand2 aria-hidden="true" />
                {isAiPlanning ? "Thinking..." : "Ask Free AI"}
              </Button>
              <Button type="button" className="btn-primary planner-tool-btn" onClick={buildFromAiDraft} disabled={!canEdit || !aiDraft.trim()}>
                <Wand2 aria-hidden="true" />
                Build Local
              </Button>
              <Button type="button" className="btn-secondary planner-tool-btn" onClick={smartFill} disabled={!canEdit}>
                <Sparkles aria-hidden="true" />
                Re-score
              </Button>
            </div>
          </div>
          {aiPlanError && <div className="planner-ai-error">{aiPlanError}</div>}
          <textarea
            className="planner-ai-input"
            value={aiDraft}
            disabled={!canEdit}
            onChange={(e) => setAiDraft(e.target.value)}
            placeholder={`Paste anything like:\nDefenders\n1 Korg\n2 Photon\n3 Hulkling\n\nAttackers\nPrince: Hercules, Doctor Doom, Scorpion\nSerwan: Kate Bishop, Absorbing Man, Warlock`}
          />
        </div>

        <div className="planner-panel planner-results-panel planner-results-top">
          <div className="planner-panel-content">
            <div className="planner-results-head">
              <h3 className="planner-section-title">AI Recommended Plan</h3>
              <div className="planner-chip">
                {plan.assignments.length} assigned from {activePlan.attackers.length * 3} slots
              </div>
            </div>
            {plan.assignments.length === 0 ? (
              <p className="planner-hint">Paste defender and attacker data above, then press Build Plan.</p>
            ) : (
              <div className="planner-results-list">
                {plan.assignments.slice(0, 12).map((assignment) => (
                  <div key={`top-${assignment.defenderIndex}-${assignment.attackerIndex}-${assignment.slotIndex}`} className="planner-result-row">
                    <div className="planner-result-main">
                      <strong>
                        {assignment.defender.placement}. {assignment.defender.name || `Defender ${assignment.defenderIndex + 1}`}
                      </strong>
                      <span>{assignment.defender.node || "No node"}</span>
                    </div>
                    <div className="planner-result-main">
                      <strong>{assignment.attacker.name || `Attacker ${assignment.attackerIndex + 1}`}</strong>
                      <span>{assignment.slot.name}</span>
                    </div>
                    <div className="planner-result-score">
                      <span>Score {assignmentScore(assignment.score)}</span>
                      <span>{assignment.reasons.join(" | ")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="planner-support">
          <div className="planner-support-row">
            <Input
              value={activePlan.support.name}
              disabled={!canEdit}
              onChange={(e) => setSupportField("name", e.target.value)}
              placeholder="Prefight support champ"
            />
            <Input
              value={activePlan.support.charges}
              disabled={!canEdit}
              onChange={(e) => setSupportField("charges", e.target.value)}
              placeholder="Charges"
            />
          </div>
          <div className="planner-support-row">
            <label className="planner-toggle">
              <input
                type="checkbox"
                checked={activePlan.support.active}
                disabled={!canEdit}
                onChange={(e) => setSupportField("active", e.target.checked)}
              />
              <span>Prefight support active</span>
            </label>
            <Input
              value={activePlan.support.notes}
              disabled={!canEdit}
              onChange={(e) => setSupportField("notes", e.target.value)}
              placeholder="Support notes"
            />
          </div>
        </div>

        <div className="planner-grid">
          <div className="planner-panel">
            <div className="planner-panel-content">
              <h3 className="planner-section-title">Attackers</h3>
              <div className="planner-list">
                {activePlan.attackers.map((attacker, attackerIndex) => (
                  <div key={attacker.id} className="planner-row planner-attacker-row">
                    <div className="planner-row-top">
                      <Input
                        value={attacker.name}
                        disabled={!canEdit}
                        onChange={(e) => updateAttacker(attackerIndex, "name", e.target.value)}
                        placeholder={`Attacker ${attackerIndex + 1}`}
                      />
                      <label className="planner-toggle planner-inline-toggle">
                        <input
                          type="checkbox"
                          checked={attacker.prefightSupport}
                          disabled={!canEdit}
                          onChange={(e) => updateAttacker(attackerIndex, "prefightSupport", e.target.checked)}
                        />
                        <span>Prefight carrier</span>
                      </label>
                    </div>
                    <div className="planner-row-body">
                      <Input
                        value={attacker.tags}
                        disabled={!canEdit}
                        onChange={(e) => updateAttacker(attackerIndex, "tags", e.target.value)}
                        placeholder="Player tags"
                      />
                      <Input
                        value={attacker.notes}
                        disabled={!canEdit}
                        onChange={(e) => updateAttacker(attackerIndex, "notes", e.target.value)}
                        placeholder="Player notes"
                      />
                    </div>
                    <div className="planner-slot-grid">
                      {attacker.slots.map((slot, slotIndex) => (
                        <div key={slot.id} className="planner-slot">
                          <div className="planner-slot-label">{slotLabel(slotIndex)}</div>
                          <Input
                            value={slot.name}
                            disabled={!canEdit}
                            onChange={(e) => updateSlot(attackerIndex, slotIndex, "name", e.target.value)}
                            placeholder="Champion"
                          />
                          <Input
                            value={slot.tags}
                            disabled={!canEdit}
                            onChange={(e) => updateSlot(attackerIndex, slotIndex, "tags", e.target.value)}
                            placeholder="Traits"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="planner-panel">
            <div className="planner-panel-content">
              <h3 className="planner-section-title">Defenders</h3>
              <div className="planner-list planner-defender-list">
                {activePlan.defenders.map((defender, defenderIndex) => {
                  const assigned = plan.defenders[defenderIndex]?.assigned ?? null;
                  const best = plan.defenders[defenderIndex]?.best ?? null;
                  return (
                    <div key={defender.id} className={`planner-row planner-defender-row ${assigned ? "is-assigned" : ""}`}>
                      <div className="planner-node-row">
                        <div className="planner-placement">
                          <span>{defender.placement}</span>
                          <small>{defender.path}</small>
                        </div>
                        <select
                          className="planner-select"
                          value={defender.nodeKey}
                          disabled={!canEdit}
                          onChange={(e) => updateNodePreset(defenderIndex, e.target.value)}
                        >
                          {WAR_NODE_PRESETS.map((preset) => (
                            <option key={preset.key} value={preset.key}>
                              {preset.placement}. {preset.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="planner-row-top">
                        <Input
                          value={defender.name}
                          disabled={!canEdit}
                          onChange={(e) => updateDefender(defenderIndex, "name", e.target.value)}
                          placeholder="Defender"
                        />
                        <div className="planner-node-chip">{best ? `Best: ${best.slot.name}` : "No match"}</div>
                      </div>
                      <div className="planner-row-body">
                        <Input
                          value={defender.node}
                          disabled={!canEdit}
                          onChange={(e) => updateDefender(defenderIndex, "node", e.target.value)}
                          placeholder="Node"
                        />
                        <Input
                          value={defender.tags}
                          disabled={!canEdit}
                          onChange={(e) => updateDefender(defenderIndex, "tags", e.target.value)}
                          placeholder="Tags"
                        />
                      </div>
                      <Input
                        value={defender.notes}
                        disabled={!canEdit}
                        onChange={(e) => updateDefender(defenderIndex, "notes", e.target.value)}
                        placeholder="Notes"
                      />
                      {assigned && (
                        <div className="planner-assignment">
                          <span className="planner-assignment-label">Assigned</span>
                          <span>
                            {assigned.attacker.name || `Attacker ${assigned.attackerIndex + 1}`} / {assigned.slot.name}
                          </span>
                          <span>Score {assignmentScore(assigned.score)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="planner-panel planner-results-panel">
          <div className="planner-panel-content">
            <div className="planner-results-head">
              <h3 className="planner-section-title">Recommended Plan</h3>
              <div className="planner-chip">
                {plan.assignments.length} assigned from {activePlan.attackers.length * 3} slots
              </div>
            </div>
            {plan.assignments.length === 0 ? (
              <p className="planner-hint">Fill attacker slots and defender names to generate recommendations.</p>
            ) : (
              <div className="planner-results-list">
                {plan.assignments.map((assignment) => (
                  <div key={`${assignment.defenderIndex}-${assignment.attackerIndex}-${assignment.slotIndex}`} className="planner-result-row">
                    <div className="planner-result-main">
                      <strong>
                        {assignment.defender.placement}. {assignment.defender.name || `Defender ${assignment.defenderIndex + 1}`}
                      </strong>
                      <span>{assignment.defender.node || "No node"}</span>
                    </div>
                    <div className="planner-result-main">
                      <strong>{assignment.attacker.name || `Attacker ${assignment.attackerIndex + 1}`}</strong>
                      <span>{assignment.slot.name}</span>
                    </div>
                    <div className="planner-result-score">
                      <span>Score {assignmentScore(assignment.score)}</span>
                      <span>{assignment.reasons.join(" | ")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="planner-unmatched">
              <div className="planner-chip muted-chip">{plan.unmatchedSlots.length} unused slots</div>
              {plan.unmatchedSlots.length > 0 && (
                <div className="planner-results-list">
                  {plan.unmatchedSlots.map(({ attackerIndex, slotIndex, attacker, slot }) => (
                    <div key={`${attackerIndex}-${slotIndex}`} className="planner-result-row muted-row">
                      <div className="planner-result-main">
                        <strong>{attacker.name || `Attacker ${attackerIndex + 1}`}</strong>
                        <span>{slotLabel(slotIndex)}</span>
                      </div>
                      <div className="planner-result-main">
                        <strong>{slot.name || "Empty slot"}</strong>
                        <span>{slot.tags || "No traits yet"}</span>
                      </div>
                      <div className="planner-result-score">
                        <span>Bench</span>
                        <span>Available but not assigned</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const assignmentScore = (value: number): string => Number(value || 0).toFixed(0);

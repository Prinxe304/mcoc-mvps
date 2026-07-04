import { useMemo } from "react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import {
  recommendWarPlan,
  type WarPlannerAttackerRow,
  type WarPlannerAttackerSlot,
  type WarPlannerDefender,
  type WarPlannerState,
} from "../lib/warPlanner";

type Props = {
  canEdit: boolean;
  planner: WarPlannerState;
  onChange: (next: WarPlannerState) => void;
};

const updateArrayItem = <T,>(items: T[], index: number, updater: (value: T) => T): T[] =>
  items.map((item, itemIndex) => (itemIndex === index ? updater(item) : item));

const updateTextField = <T,>(row: T, field: keyof T, value: string | boolean): T =>
  ({
    ...(row as Record<string, unknown>),
    [field]: value,
  }) as T;

const emptySlot = (index: number): WarPlannerAttackerSlot => ({
  id: `slot-${index + 1}`,
  name: "",
  tags: "",
  notes: "",
});

const slotLabel = (slotIndex: number): string => `Slot ${slotIndex + 1}`;

export default function WarPlannerPanel({ canEdit, planner, onChange }: Props) {
  const plan = useMemo(() => recommendWarPlan(planner), [planner]);

  const setSupportField = (field: keyof WarPlannerState["support"], value: string | boolean) => {
    if (!canEdit) return;
    onChange({
      ...planner,
      support: {
        ...planner.support,
        [field]: value,
      },
    });
  };

  const updateDefender = (index: number, field: keyof WarPlannerDefender, value: string) => {
    if (!canEdit) return;
    onChange({
      ...planner,
      defenders: updateArrayItem(planner.defenders, index, (row) => updateTextField(row, field, value)),
    });
  };

  const updateAttacker = (index: number, field: keyof WarPlannerAttackerRow, value: string | boolean) => {
    if (!canEdit) return;
    onChange({
      ...planner,
      attackers: updateArrayItem(planner.attackers, index, (row) => updateTextField(row, field, value)),
    });
  };

  const updateSlot = (attackerIndex: number, slotIndex: number, field: keyof WarPlannerAttackerSlot, value: string) => {
    if (!canEdit) return;
    onChange({
      ...planner,
      attackers: updateArrayItem(planner.attackers, attackerIndex, (attacker) => ({
        ...attacker,
        slots: updateArrayItem(attacker.slots, slotIndex, (slot) => updateTextField(slot, field, value)),
      })),
    });
  };

  const resetPlanner = () => {
    if (!canEdit) return;
    onChange({
      ...planner,
      defenders: planner.defenders.map((row, index) => ({
        ...row,
        id: row.id || `def-${index + 1}`,
        name: "",
        node: "",
        tags: "",
        notes: "",
      })),
      attackers: planner.attackers.map((row, index) => ({
        ...row,
        id: row.id || `atk-${index + 1}`,
        name: "",
        tags: "",
        notes: "",
        prefightSupport: false,
        slots: row.slots.length > 0 ? row.slots : [emptySlot(0), emptySlot(1), emptySlot(2)],
      })),
      support: {
        name: "",
        active: false,
        charges: "",
        notes: "",
      },
    });
  };

  return (
    <Card className="card-secondary card-planner">
      <CardContent className="card-secondary-content">
        <div className="planner-head">
          <div>
            <h2 className="section-title-left">War Planner</h2>
            <p className="sync-note planner-note">
              Add up to 50 defenders and 30 attacker slots. The planner will rank the best counter for each defender
              and keep prefight support in the scoring.
            </p>
          </div>
          {canEdit && (
            <Button type="button" className="btn-secondary planner-reset" onClick={resetPlanner}>
              Reset Planner
            </Button>
          )}
        </div>

        <div className="planner-support">
          <div className="planner-support-row">
            <Input
              value={planner.support.name}
              disabled={!canEdit}
              onChange={(e) => setSupportField("name", e.target.value)}
              placeholder="Prefight support champ, e.g. White Magneto"
            />
            <Input
              value={planner.support.charges}
              disabled={!canEdit}
              onChange={(e) => setSupportField("charges", e.target.value)}
              placeholder="Support charges"
            />
          </div>
          <div className="planner-support-row">
            <label className="planner-toggle">
              <input
                type="checkbox"
                checked={planner.support.active}
                disabled={!canEdit}
                onChange={(e) => setSupportField("active", e.target.checked)}
              />
              <span>Prefight support active</span>
            </label>
            <Input
              value={planner.support.notes}
              disabled={!canEdit}
              onChange={(e) => setSupportField("notes", e.target.value)}
              placeholder="Support notes or extra setup"
            />
          </div>
        </div>

        <div className="planner-grid">
          <Card className="planner-panel">
            <CardContent className="planner-panel-content">
              <h3 className="planner-section-title">Attacker Roster</h3>
              <p className="planner-hint">Each row is one attacker. Fill up to three champs per player.</p>
              <div className="planner-list">
                {planner.attackers.map((attacker, attackerIndex) => (
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
                        placeholder="Attacker tags, e.g. power control, slow"
                      />
                      <Input
                        value={attacker.notes}
                        disabled={!canEdit}
                        onChange={(e) => updateAttacker(attackerIndex, "notes", e.target.value)}
                        placeholder="Attacker notes"
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
            </CardContent>
          </Card>

          <Card className="planner-panel">
            <CardContent className="planner-panel-content">
              <h3 className="planner-section-title">Defender List</h3>
              <p className="planner-hint">Add node text and tags like miss, buff heavy, biohazard, limber, or power gain.</p>
              <div className="planner-list planner-defender-list">
                {planner.defenders.map((defender, defenderIndex) => {
                  const assigned = plan.defenders[defenderIndex]?.assigned ?? null;
                  const best = plan.defenders[defenderIndex]?.best ?? null;
                  return (
                    <div key={defender.id} className={`planner-row planner-defender-row ${assigned ? "is-assigned" : ""}`}>
                      <div className="planner-row-top">
                        <Input
                          value={defender.name}
                          disabled={!canEdit}
                          onChange={(e) => updateDefender(defenderIndex, "name", e.target.value)}
                          placeholder={`Defender ${defenderIndex + 1}`}
                        />
                        <div className="planner-node-chip">{best ? `Best: ${best.attacker.name || "slot"} ${best.slot.name}` : "No match yet"}</div>
                      </div>
                      <div className="planner-row-body">
                        <Input
                          value={defender.node}
                          disabled={!canEdit}
                          onChange={(e) => updateDefender(defenderIndex, "node", e.target.value)}
                          placeholder="Node text"
                        />
                        <Input
                          value={defender.tags}
                          disabled={!canEdit}
                          onChange={(e) => updateDefender(defenderIndex, "tags", e.target.value)}
                          placeholder="Threat tags"
                        />
                      </div>
                      <Input
                        value={defender.notes}
                        disabled={!canEdit}
                        onChange={(e) => updateDefender(defenderIndex, "notes", e.target.value)}
                        placeholder="Defender notes"
                      />
                      {assigned && (
                        <div className="planner-assignment">
                          <span className="planner-assignment-label">Assigned</span>
                          <span>
                            {assigned.attacker.name || `Attacker ${assigned.attackerIndex + 1}`} / {assigned.slot.name}
                          </span>
                          <span>Score {assigned.score.toFixed(0)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="planner-panel planner-results-panel">
          <CardContent className="planner-panel-content">
            <div className="planner-results-head">
              <h3 className="planner-section-title">Recommended Plan</h3>
              <div className="planner-chip">
                {plan.assignments.length} assigned from {planner.attackers.length * 3} available slots
              </div>
            </div>
            {plan.assignments.length === 0 ? (
              <p className="planner-hint">Fill attacker slots and defender nodes to generate recommendations.</p>
            ) : (
              <div className="planner-results-list">
                {plan.assignments.map((assignment) => (
                  <div key={`${assignment.defenderIndex}-${assignment.attackerIndex}-${assignment.slotIndex}`} className="planner-result-row">
                    <div className="planner-result-main">
                      <strong>{assignment.defender.name || `Defender ${assignment.defenderIndex + 1}`}</strong>
                      <span>{assignment.defender.node || "No node"}</span>
                    </div>
                    <div className="planner-result-main">
                      <strong>{assignment.attacker.name || `Attacker ${assignment.attackerIndex + 1}`}</strong>
                      <span>{assignment.slot.name}</span>
                    </div>
                    <div className="planner-result-score">
                      <span>Score {assignment.score.toFixed(0)}</span>
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
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}

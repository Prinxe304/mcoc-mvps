export interface WarPlannerDefender {
  id: string;
  name: string;
  node: string;
  tags: string;
  notes: string;
}

export interface WarPlannerAttackerSlot {
  id: string;
  name: string;
  tags: string;
  notes: string;
}

export interface WarPlannerAttackerRow {
  id: string;
  name: string;
  tags: string;
  notes: string;
  prefightSupport: boolean;
  slots: WarPlannerAttackerSlot[];
}

export interface WarPlannerSupport {
  name: string;
  active: boolean;
  charges: string;
  notes: string;
}

export interface WarPlannerState {
  defenders: WarPlannerDefender[];
  attackers: WarPlannerAttackerRow[];
  support: WarPlannerSupport;
}

export interface WarPlannerMatchup {
  defenderIndex: number;
  attackerIndex: number;
  slotIndex: number;
  defender: WarPlannerDefender;
  attacker: WarPlannerAttackerRow;
  slot: WarPlannerAttackerSlot;
  score: number;
  reasons: string[];
}

export interface WarPlannerDefenderRecommendation {
  defenderIndex: number;
  defender: WarPlannerDefender;
  best: WarPlannerMatchup | null;
  alternatives: WarPlannerMatchup[];
  assigned: WarPlannerMatchup | null;
}

const DEFENDER_COUNT = 50;
const ATTACKER_COUNT = 10;
const SLOT_COUNT = 3;

const makeId = (prefix: string, index: number) => `${prefix}-${index + 1}`;

const normalizeText = (value: string): string =>
  String(value || "")
    .trim()
    .toLowerCase();

const splitTags = (value: string): string[] =>
  normalizeText(value)
    .split(/[,;/|]+/g)
    .map((part) => part.trim())
    .filter(Boolean);

const unique = (values: string[]): string[] => Array.from(new Set(values.map((v) => normalizeText(v)).filter(Boolean)));

const joinText = (...parts: string[]): string =>
  unique(parts.flatMap((part) => splitTags(part))).join(" ");

const hasAny = (haystack: string, needles: string[]): boolean => {
  const text = normalizeText(haystack);
  return needles.some((needle) => text.includes(normalizeText(needle)));
};

const inferTagsFromChampion = (name: string): string[] => {
  const text = normalizeText(name);
  if (!text) return [];

  const tags: string[] = [];
  const add = (...values: string[]) => values.forEach((value) => tags.push(value));

  if (hasAny(text, ["white magneto", "magneto (white)", "magneto white"])) add("prefight", "metal", "support");
  if (hasAny(text, ["magneto", "nimrod", "guardian", "warlock", "ultron"])) add("metal", "robot");
  if (hasAny(text, ["doom", "dr doom"])) add("power control", "nullify", "shock");
  if (hasAny(text, ["shang-chi", "shang chi"])) add("slow", "purify", "cleanse");
  if (hasAny(text, ["hercules", "herc"])) add("burst", "true strike", "unstoppable");
  if (hasAny(text, ["kate bishop", "kate"])) add("slow", "anti-evade", "shred");
  if (hasAny(text, ["scorpion"])) add("poison", "rupture", "debuff");
  if (hasAny(text, ["kitty pryde", "kitty"])) add("phase", "evade", "burst");
  if (hasAny(text, ["ghost"])) add("phase", "evade", "power control");
  if (hasAny(text, ["hulkling"])) add("buff heavy", "power gain", "cosmic");
  if (hasAny(text, ["bishop"])) add("shock", "power control");
  if (hasAny(text, ["sersi"])) add("buff control", "nullify");
  if (hasAny(text, ["abs man", "absorb"])) add("utility", "immune");
  if (hasAny(text, ["nimrod"])) add("anti-mystic", "anti-robot", "buff control");
  if (hasAny(text, ["apocalypse"])) add("horseman", "mutant", "sustain");
  if (hasAny(text, ["omega sentinel"])) add("anti-mutate", "robot", "buff control");
  if (hasAny(text, ["nick fury"])) add("bleed", "burst", "safety");
  if (hasAny(text, ["kingpin"])) add("shrug", "sustain", "buff control");
  if (hasAny(text, ["purgatory"])) add("incinerate", "sustain");
  if (hasAny(text, ["human torch"])) add("incinerate", "mystic killer");
  if (hasAny(text, ["warlock"])) add("heal block", "power control", "robot");
  if (hasAny(text, ["hyperion"])) add("power gain", "burst");
  if (hasAny(text, ["bishop"])) add("power control", "shock");
  if (hasAny(text, ["juggernaut"])) add("unstoppable", "fury");
  if (hasAny(text, ["mole man", "moleman"])) add("unstoppable", "evade", "bleed");
  if (hasAny(text, ["attuma"])) add("auto block", "armor", "bleed");
  if (hasAny(text, ["korg"])) add("thorns", "rock", "contact punish");
  if (hasAny(text, ["thing"])) add("unstoppable", "rock stacks", "punish contact");
  if (hasAny(text, ["ibom", "i-bom", "incredible hulk (immortal)"])) add("poison", "debuff");
  if (hasAny(text, ["sauron"])) add("bleed", "critical failure", "debuff");
  if (hasAny(text, ["quake"])) add("dex punish", "slow");
  if (hasAny(text, ["america chavez", "america"])) add("buff control", "cosmic");
  if (hasAny(text, ["fantastic", "mr fantastic"])) add("prowess", "utility");
  if (hasAny(text, ["cheelith", "cheelith"])) add("utility");
  if (hasAny(text, ["spot"])) add("power gain", "burst");
  if (hasAny(text, ["shocker"])) add("shock", "power control");
  if (hasAny(text, ["valkyrie"])) add("buff control", "safety");
  if (hasAny(text, ["rihno", "rhino"])) add("unstoppable", "armor");

  return unique(tags);
};

const createEmptyDefender = (index: number): WarPlannerDefender => ({
  id: makeId("def", index),
  name: "",
  node: "",
  tags: "",
  notes: "",
});

const createEmptySlot = (index: number): WarPlannerAttackerSlot => ({
  id: makeId("slot", index),
  name: "",
  tags: "",
  notes: "",
});

const createEmptyAttacker = (index: number): WarPlannerAttackerRow => ({
  id: makeId("atk", index),
  name: "",
  tags: "",
  notes: "",
  prefightSupport: false,
  slots: Array.from({ length: SLOT_COUNT }).map((_, slotIndex) => createEmptySlot(slotIndex)),
});

export const createInitialWarPlannerState = (): WarPlannerState => ({
  defenders: Array.from({ length: DEFENDER_COUNT }).map((_, index) => createEmptyDefender(index)),
  attackers: Array.from({ length: ATTACKER_COUNT }).map((_, index) => createEmptyAttacker(index)),
  support: {
    name: "",
    active: false,
    charges: "",
    notes: "",
  },
});

const normalizeDefender = (value: unknown, index: number): WarPlannerDefender => {
  const row = (value && typeof value === "object" ? (value as Partial<WarPlannerDefender>) : {}) || {};
  return {
    id: typeof row.id === "string" && row.id ? row.id : makeId("def", index),
    name: typeof row.name === "string" ? row.name : "",
    node: typeof row.node === "string" ? row.node : "",
    tags: typeof row.tags === "string" ? row.tags : "",
    notes: typeof row.notes === "string" ? row.notes : "",
  };
};

const normalizeSlot = (value: unknown, index: number): WarPlannerAttackerSlot => {
  const row = (value && typeof value === "object" ? (value as Partial<WarPlannerAttackerSlot>) : {}) || {};
  return {
    id: typeof row.id === "string" && row.id ? row.id : makeId("slot", index),
    name: typeof row.name === "string" ? row.name : "",
    tags: typeof row.tags === "string" ? row.tags : "",
    notes: typeof row.notes === "string" ? row.notes : "",
  };
};

const normalizeAttacker = (value: unknown, index: number): WarPlannerAttackerRow => {
  const row = (value && typeof value === "object" ? (value as Partial<WarPlannerAttackerRow>) : {}) || {};
  const slots = Array.isArray(row.slots) ? row.slots : [];
  return {
    id: typeof row.id === "string" && row.id ? row.id : makeId("atk", index),
    name: typeof row.name === "string" ? row.name : "",
    tags: typeof row.tags === "string" ? row.tags : "",
    notes: typeof row.notes === "string" ? row.notes : "",
    prefightSupport: Boolean(row.prefightSupport),
    slots: Array.from({ length: SLOT_COUNT }).map((_, slotIndex) => normalizeSlot(slots[slotIndex], slotIndex)),
  };
};

export const normalizeWarPlannerState = (maybeState: unknown): WarPlannerState => {
  if (!maybeState || typeof maybeState !== "object") return createInitialWarPlannerState();
  const row = maybeState as Partial<WarPlannerState>;
  const defenders = Array.isArray(row.defenders) ? row.defenders : [];
  const attackers = Array.isArray(row.attackers) ? row.attackers : [];
  return {
    defenders: Array.from({ length: DEFENDER_COUNT }).map((_, index) => normalizeDefender(defenders[index], index)),
    attackers: Array.from({ length: ATTACKER_COUNT }).map((_, index) => normalizeAttacker(attackers[index], index)),
    support: {
      name: typeof row.support?.name === "string" ? row.support.name : "",
      active: Boolean(row.support?.active),
      charges: typeof row.support?.charges === "string" ? row.support.charges : "",
      notes: typeof row.support?.notes === "string" ? row.support.notes : "",
    },
  };
};

const formatReasons = (reasons: string[]): string[] => unique(reasons).slice(0, 6);

const keywordBoost = (haystack: string, needles: string[], score: number, label: string, reasons: string[]): number => {
  if (!hasAny(haystack, needles)) return 0;
  reasons.push(label);
  return score;
};

const counterRules: Array<{ label: string; needs: string[]; counters: string[]; score: number }> = [
  { label: "Anti-miss", needs: ["miss", "evade", "phase"], counters: ["true strike", "true sense", "precision", "slow"], score: 34 },
  { label: "Buff control", needs: ["buff", "buff heavy", "unstoppable"], counters: ["nullify", "stagger", "neutralize", "buff control"], score: 26 },
  { label: "Power control", needs: ["power gain", "power", "power snack"], counters: ["power control", "power drain", "stagger", "nullify"], score: 22 },
  { label: "Heal pressure", needs: ["regen", "sustain", "heal"], counters: ["heal block", "heal reversal", "poison", "bleed", "degen"], score: 18 },
  { label: "Immunity check", needs: ["biohazard", "poison", "bleed", "shock", "incinerate"], counters: ["immune", "immunity", "purify", "resist"], score: 16 },
  { label: "Stun safety", needs: ["limber", "stun immune"], counters: ["heavy", "fury", "slow", "power control"], score: 12 },
  { label: "Armor breaker", needs: ["armor", "metal", "robot"], counters: ["armor break", "armor shatter", "shock", "incinerate"], score: 12 },
  { label: "Contact punish", needs: ["thorns", "rock", "contact punish", "punish contact"], counters: ["safeguard", "indestructible", "true strike", "phase"], score: 10 },
];

const inferPrefightBonus = (attackerText: string, support: WarPlannerSupport): number => {
  if (!support.active) return 0;
  const supportName = normalizeText(support.name);
  const supportText = `${supportName} ${normalizeText(support.notes)}`;
  const teamCharges = Number(support.charges || 0);
  if (teamCharges <= 0 && supportName !== "white magneto") return 0;
  if (hasAny(attackerText, ["prefight", "setup", "charge", "pre-fight", "prep"])) return supportName === "white magneto" ? 18 : 12;
  if (hasAny(attackerText, ["metal", "robot", "buff control", "utility"])) return supportName === "white magneto" ? 10 : 6;
  if (hasAny(supportText, ["white magneto"])) return 8;
  return 4;
};

const evaluateMatchup = (
  defender: WarPlannerDefender,
  attacker: WarPlannerAttackerRow,
  slot: WarPlannerAttackerSlot,
  support: WarPlannerSupport,
): { score: number; reasons: string[] } => {
  const defenderText = joinText(defender.name, defender.node, defender.tags, defender.notes);
  const slotText = joinText(slot.name, attacker.name, attacker.tags, attacker.notes, slot.tags, slot.notes);
  const defenderTags = unique([...splitTags(defender.tags), ...splitTags(defender.notes), ...inferTagsFromChampion(defender.name), ...splitTags(defender.node)]);
  const attackerTags = unique([...splitTags(attacker.tags), ...splitTags(attacker.notes), ...splitTags(slot.tags), ...splitTags(slot.notes), ...inferTagsFromChampion(slot.name), ...inferTagsFromChampion(attacker.name)]);
  const reasons: string[] = [];
  let score = 0;

  if (!normalizeText(slot.name)) {
    return { score: -9999, reasons: ["Empty slot"] };
  }

  score += 8;
  score += Math.min(16, attackerTags.length * 2);
  score += Math.min(12, defenderTags.length);

  score += keywordBoost(slotText, ["true strike", "true sense", "precision"], 8, "Has anti-miss tools", reasons);
  score += keywordBoost(slotText, ["nullify", "stagger", "neutralize"], 8, "Has buff control", reasons);
  score += keywordBoost(slotText, ["power control", "power drain", "power burn"], 8, "Has power control", reasons);
  score += keywordBoost(slotText, ["heal block", "heal reversal", "poison", "bleed", "degen"], 6, "Has sustain pressure", reasons);
  score += keywordBoost(slotText, ["shock", "incinerate", "rupture", "rupture", "poison"], 4, "Has damage pressure", reasons);
  score += keywordBoost(slotText, ["sustain", "immunity", "purify", "cleanse"], 4, "Has safety", reasons);

  counterRules.forEach((rule) => {
    const defenderHit = hasAny(defenderText, rule.needs) || defenderTags.some((tag) => rule.needs.some((need) => tag.includes(need)));
    const attackerHit = hasAny(slotText, rule.counters) || attackerTags.some((tag) => rule.counters.some((counter) => tag.includes(counter)));
    if (defenderHit && attackerHit) {
      score += rule.score;
      reasons.push(rule.label);
    }
  });

  const nodeText = joinText(defender.node, defender.notes);
  if (hasAny(nodeText, ["node", "lane"])) {
    score += 1;
  }
  if (hasAny(nodeText, ["biohazard", "poison"])) {
    if (hasAny(slotText, ["immunity", "purify", "cleanse", "bleed", "poison"])) {
      score += 10;
      reasons.push("Node safety");
    }
  }
  if (hasAny(nodeText, ["limber", "stun immune", "stun immunity"])) {
    if (hasAny(slotText, ["heavy", "slow", "power control"])) {
      score += 8;
      reasons.push("Limber-friendly");
    }
  }

  if (hasAny(defenderText, ["evade", "miss"]) && hasAny(slotText, ["true strike", "precision", "slow"])) {
    score += 16;
    reasons.push("Miss counter");
  }
  if (hasAny(defenderText, ["buff", "power gain"]) && hasAny(slotText, ["nullify", "stagger", "power control"])) {
    score += 14;
    reasons.push("Buff / power control");
  }
  if (hasAny(defenderText, ["regen", "sustain"]) && hasAny(slotText, ["heal block", "poison", "bleed", "degen"])) {
    score += 12;
    reasons.push("Regen control");
  }
  if (hasAny(defenderText, ["robot", "metal"]) && hasAny(slotText, ["shock", "incinerate", "armor break"])) {
    score += 10;
    reasons.push("Metal breaker");
  }

  score += inferPrefightBonus(slotText, support);

  if (hasAny(slotText, ["white magneto"])) {
    score += 6;
    reasons.push("White Magneto support");
  }

  if (attacker.prefightSupport) {
    score += 4;
    reasons.push("Team prefight support");
  }

  if (normalizeText(defender.name) && normalizeText(slot.name) === normalizeText(defender.name)) {
    score -= 8;
    reasons.push("Mirror matchup");
  }

  return { score, reasons: formatReasons(reasons) };
};

const buildRealSlots = (attackers: WarPlannerAttackerRow[]) =>
  attackers.flatMap((attacker, attackerIndex) =>
    attacker.slots.map((slot, slotIndex) => ({
      attackerIndex,
      slotIndex,
      attacker,
      slot,
    })),
  );

export const recommendWarPlan = (state: WarPlannerState): {
  assignments: WarPlannerMatchup[];
  defenders: WarPlannerDefenderRecommendation[];
  unmatchedSlots: Array<{ attackerIndex: number; slotIndex: number; attacker: WarPlannerAttackerRow; slot: WarPlannerAttackerSlot }>;
} => {
  const normalized = normalizeWarPlannerState(state);
  const realSlots = buildRealSlots(normalized.attackers).filter(({ slot }) => normalizeText(slot.name));

  const pairings = normalized.defenders.flatMap((defender, defenderIndex) =>
    realSlots.map(({ attackerIndex, slotIndex, attacker, slot }) => {
      const evaluation = evaluateMatchup(defender, attacker, slot, normalized.support);
      return {
        defenderIndex,
        attackerIndex,
        slotIndex,
        defender,
        attacker,
        slot,
        score: evaluation.score,
        reasons: evaluation.reasons,
      };
    }),
  );

  const bestByDefender = new Map<number, WarPlannerMatchup[]>();
  pairings.forEach((pairing) => {
    const list = bestByDefender.get(pairing.defenderIndex) ?? [];
    list.push(pairing);
    list.sort((a, b) => b.score - a.score);
    bestByDefender.set(pairing.defenderIndex, list.slice(0, 5));
  });

  const sortedPairs = [...pairings].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.defenderIndex !== b.defenderIndex) return a.defenderIndex - b.defenderIndex;
    if (a.attackerIndex !== b.attackerIndex) return a.attackerIndex - b.attackerIndex;
    return a.slotIndex - b.slotIndex;
  });

  const usedDefenders = new Set<number>();
  const usedSlots = new Set<string>();
  const assignments: WarPlannerMatchup[] = [];

  sortedPairs.forEach((pairing) => {
    if (pairing.score <= 0) return;
    const slotKey = `${pairing.attackerIndex}-${pairing.slotIndex}`;
    if (usedDefenders.has(pairing.defenderIndex) || usedSlots.has(slotKey)) return;
    usedDefenders.add(pairing.defenderIndex);
    usedSlots.add(slotKey);
    assignments.push(pairing);
  });

  const recommendations: WarPlannerDefenderRecommendation[] = normalized.defenders.map((defender, defenderIndex) => {
    const options = bestByDefender.get(defenderIndex) ?? [];
    const assigned = assignments.find((row) => row.defenderIndex === defenderIndex) ?? null;
    return {
      defenderIndex,
      defender,
      best: options[0] ?? null,
      alternatives: options.slice(1),
      assigned,
    };
  });

  const unmatchedSlots = buildRealSlots(normalized.attackers)
    .filter(({ slot }) => normalizeText(slot.name))
    .filter(({ attackerIndex, slotIndex }) => !usedSlots.has(`${attackerIndex}-${slotIndex}`));

  return {
    assignments,
    defenders: recommendations,
    unmatchedSlots,
  };
};

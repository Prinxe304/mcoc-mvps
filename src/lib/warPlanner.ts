export type WarPlannerBG = "BG1" | "BG2" | "BG3";

export interface WarPlannerDefender {
  id: string;
  placement: string;
  path: string;
  name: string;
  nodeKey: string;
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
  roster: string;
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

export interface WarPlannerBGPlan {
  defenders: WarPlannerDefender[];
  attackers: WarPlannerAttackerRow[];
  support: WarPlannerSupport;
}

export interface WarPlannerState {
  selectedBg: WarPlannerBG;
  bgPlans: Record<WarPlannerBG, WarPlannerBGPlan>;
}

export interface WarNodePreset {
  key: string;
  placement: string;
  path: string;
  name: string;
  tags: string;
  counters: string;
  notes: string;
}

export interface ChampionCounterProfile {
  name: string;
  aliases: string[];
  tags: string[];
  counters: string[];
}

export interface WarPlannerMatchup {
  defenderIndex: number;
  attackerIndex: number;
  slotIndex: number;
  rosterChampionIndex: number;
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

const BG_NAMES: WarPlannerBG[] = ["BG1", "BG2", "BG3"];
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

const joinTags = (...parts: Array<string | string[]>): string =>
  unique(parts.flatMap((part) => (Array.isArray(part) ? part : splitTags(part)))).join(", ");

const searchableText = (...parts: string[]): string => parts.map((part) => normalizeText(part)).join(" ");

const hasAny = (haystack: string, needles: string[]): boolean => {
  const text = normalizeText(haystack);
  return needles.some((needle) => text.includes(normalizeText(needle)));
};

const buildNodePresets = (): WarNodePreset[] => {
  const rows: Array<[string, string, string, string, string, string]> = [
    ["1", "Section 1", "Parry pressure", "stun, limber, block damage", "stun immune, slow, heavy punish", "Opening node with safe parry checks."],
    ["2", "Section 1", "Enhanced armor", "armor, physical resist, metal", "armor break, armor shatter, shock", "Good place for armor or robot defenders."],
    ["3", "Section 1", "Power snack", "power gain, buff, power control", "nullify, stagger, power control", "Punishes buff-heavy attackers."],
    ["4", "Section 1", "Biohazard", "bleed, poison, debuff", "bleed immune, poison immune, purify, robot", "Needs immunity or shrug safety."],
    ["5", "Section 1", "Ebb and flow intercept", "intercept, protection, unstoppable", "slow, true strike, intercept", "Rewards clean intercept play."],
    ["6", "Section 1", "Hazard shift", "bleed, poison, shock, incinerate", "immunity, purify, clean fight", "Prefer double immune or shrug champs."],
    ["7", "Section 1", "Mix master", "evade, miss, dex punish", "true strike, true sense, slow, anti evade", "Avoid basic combo autopilot."],
    ["8", "Section 1", "Do you bleed", "bleed vulnerability, armor", "bleed, rupture, critical bleed", "Bleed damage gets extra value."],
    ["9", "Section 1", "Aspect of war", "unstoppable, unblockable, fury", "slow, nullify, power control", "Needs control and patience."],
    ["10", "Section 1", "Burden of might", "buff, power lock, power drain", "low buff, power control, nullify", "Buff-heavy attackers can get trapped."],
    ["11", "Section 2", "Long distance relationship", "spacing, degeneration, special bait", "sustain, power control, burst", "Keep distance discipline."],
    ["12", "Section 2", "Safeguard", "damage cap, combo shield", "damage over time, burst, armor break", "DOT and multi-hit utility help."],
    ["13", "Section 2", "Power focus one", "special 1, power gain", "power control, taunt, evade", "Plan around repeated SP1."],
    ["14", "Section 2", "Power focus two", "special 2, power gain", "power control, bait, taunt", "Plan around repeated SP2."],
    ["15", "Section 2", "Spiked armor", "thorns, armor, contact punish", "non contact, phase, armor break", "Contact attackers need protection."],
    ["16", "Section 2", "Footloose", "evade, special punish, unstoppable", "slow, true strike, special control", "Specials can trigger annoying movement."],
    ["17", "Section 2", "Stun immune", "stun immune, block proficiency", "heavy, intercept, power control", "Do not rely on parry openings."],
    ["18", "Section 2", "Buff imbalance", "buff, nullify punish, power gain", "neutralize, stagger, buff control", "Works well with cosmic defenders."],
    ["19", "Section 2", "Crit me with your best shot", "crit resistant, guaranteed crit", "guaranteed crit, precision, DOT", "Needs reliable crit or damage over time."],
    ["20", "Section 2", "Aggression fury", "fury, timer, burst", "nullify, slow, power control", "Long fights become risky."],
    ["21", "Section 3", "Window of opportunity stun", "stun window, timing, limber", "stun control, heavy, burst", "Exploit short attack windows."],
    ["22", "Section 3", "Window of opportunity shock", "shock, timer, damage window", "shock immune, burst, power control", "Shock immunity or burst helps."],
    ["23", "Section 3", "Conflictor", "debuff punish, power gain", "passive utility, power control, taunt", "Too many debuffs feed power."],
    ["24", "Section 3", "Encroaching stun", "timer, stun, special bait", "stun immune, purify, special control", "Needs SP timing awareness."],
    ["25", "Section 3", "Kinetic transference", "block power, power gain", "intercept, power control, heavy", "Blocking feeds defender power."],
    ["26", "Section 3", "Mighty charge", "unstoppable, dash, shrug", "slow, intercept, nullify", "Dash attacks can shrug debuffs."],
    ["27", "Section 3", "Heavy hitter", "unstoppable heavy, armor", "slow, evade, armor break", "Respect heavy openings."],
    ["28", "Section 3", "Recovery", "regen, healing, sustain", "heal block, poison, heal reversal", "Heal control matters."],
    ["29", "Section 3", "Indomitable", "debuff shrug, stun, purify", "passive utility, slow, power control", "Debuff-heavy attackers lose value."],
    ["30", "Section 3", "Pessimist", "debuff, fatigue, weakness", "shrug, purify, immunity", "Needs clean debuff management."],
    ["31", "Section 4", "Crush", "block damage, armor, stun", "block proficiency, armor break, sustain", "Blocking gets expensive."],
    ["32", "Section 4", "Personal space", "spacing, falter, miss", "true sense, slow, phase", "Spacing tools reduce risk."],
    ["33", "Section 4", "Power shield", "special damage, basic reduction", "special burst, power gain, power control", "Plan for special damage."],
    ["34", "Section 4", "Special delivery", "special lock, intercept, burst", "power control, taunt, intercept", "Special timing is the lane."],
    ["35", "Section 4", "Unblockable finale", "unblockable, low health, burst", "slow, evade, power control", "Finish decisively."],
    ["36", "Section 4", "Masochism", "debuff shrug, regen", "passive utility, heal block, burst", "Debuffs trigger healing."],
    ["37", "Section 4", "Spry", "evade, dex, miss", "anti evade, true strike, slow", "Anti-evade is premium."],
    ["38", "Section 4", "Brute force", "timer, degen, aggression", "aggressive attacker, sustain", "Keep hitting or suffer."],
    ["39", "Section 4", "Arc overload", "regen, armor, power gain", "heal block, nullify, armor break", "Control armor and healing."],
    ["40", "Section 4", "Power alternator", "power swap, power gain", "power control, taunt, special control", "Watch power totals closely."],
    ["41", "Boss Island", "Boss vigor", "regen, sustain, high health", "heal block, poison, heal reversal", "Boss island sustain check."],
    ["42", "Boss Island", "Boss tyranny", "unstoppable, unblockable, protection", "slow, nullify, true strike", "Control unstoppable before pushing."],
    ["43", "Boss Island", "Boss rage", "damage cap, fury, unblockable", "DOT, power control, slow", "Burst caps can punish big hits."],
    ["44", "Boss Island", "Boss power gain", "power gain, special pressure", "power control, taunt, nullify", "Power control is priority."],
    ["45", "Boss Island", "Boss buffet", "buff, regen, nullify", "neutralize, stagger, buff control", "Avoid feeding buffs."],
    ["46", "Boss Island", "Boss hazard", "bleed, poison, incinerate, shock", "immunity, purify, robot", "Immunity check before assignment."],
    ["47", "Boss Island", "Boss evade", "evade, miss, falter", "true strike, true sense, slow", "Bring anti-miss or anti-evade."],
    ["48", "Boss Island", "Boss armor", "armor, crit resist, thorns", "armor break, shock, non contact", "Armor control and safety."],
    ["49", "Boss Island", "Boss final stand", "unblockable, protection, fury", "slow, nullify, power control", "Endgame control node."],
    ["50", "Boss Island", "Final boss", "boss, power gain, unstoppable, regen", "power control, slow, heal block, buff control", "Reserve your safest counter."],
  ];

  return rows.map(([placement, path, name, tags, counters, notes]) => ({
    key: `node-${placement}`,
    placement,
    path,
    name,
    tags,
    counters,
    notes,
  }));
};

export const WAR_NODE_PRESETS = buildNodePresets();

export const CHAMPION_COUNTER_DATABASE: ChampionCounterProfile[] = [
  { name: "Absorbing Man", aliases: ["abs man", "abs"], tags: ["immune", "sustain", "mystic", "burst"], counters: ["hazard shift", "biohazard", "boss hazard"] },
  { name: "America Chavez", aliases: ["america"], tags: ["buff control", "power control", "mystic"], counters: ["power snack", "buff imbalance", "boss buffet"] },
  { name: "Archangel", aliases: ["aa"], tags: ["bleed", "poison", "neurotoxin", "heal block"], counters: ["recovery", "boss vigor", "masochism"] },
  { name: "Baron Zemo", aliases: ["zemo"], tags: ["bleed", "cleanse", "root", "control"], counters: ["recovery", "do you bleed", "pessimist"] },
  { name: "Black Cat", aliases: ["bc"], tags: ["bleed", "defensive ability accuracy", "evade"], counters: ["spry", "mix master", "recovery"] },
  { name: "Bullseye", aliases: ["bullseye"], tags: ["evade", "bleed", "crit", "miss punish"], counters: ["spry", "mix master", "boss evade"] },
  { name: "Captain Britain", aliases: ["cap britain"], tags: ["reverse control immune", "burst", "prowess"], counters: ["encroaching stun", "conflictor"] },
  { name: "CGR", aliases: ["cosmic ghost rider"], tags: ["buff heavy", "power gain", "armor break", "burst"], counters: ["power shield", "boss armor"] },
  { name: "Chee'ilth", aliases: ["cheelith"], tags: ["bleed", "safety", "purify", "utility"], counters: ["do you bleed", "biohazard", "pessimist"] },
  { name: "Colossus", aliases: ["col"], tags: ["armor", "bleed immune", "incinerate immune", "sustain"], counters: ["biohazard", "crush", "boss armor"] },
  { name: "Doctor Doom", aliases: ["doom", "dr doom"], tags: ["power control", "nullify", "shock", "stagger"], counters: ["power gain", "power snack", "boss power gain"] },
  { name: "Domino", aliases: ["domino"], tags: ["critical failure", "evade", "damage over time"], counters: ["spry", "mix master", "personal space"] },
  { name: "Falcon", aliases: ["falcon"], tags: ["lock on", "anti evade", "defensive ability accuracy"], counters: ["spry", "mix master", "boss evade"] },
  { name: "Ghost", aliases: ["ghost"], tags: ["phase", "miss", "power control", "burst"], counters: ["spiked armor", "personal space", "contact punish"] },
  { name: "Guardian", aliases: ["guardian"], tags: ["shock", "armor", "perfect block", "robot"], counters: ["boss armor", "enhanced armor", "crush"] },
  { name: "Hercules", aliases: ["herc"], tags: ["burst", "true strike", "immortality", "cosmic"], counters: ["boss final stand", "unblockable finale", "aspect of war"] },
  { name: "Hit-Monkey", aliases: ["hit monkey"], tags: ["crit", "bleed", "evade", "burst"], counters: ["crit me with your best shot", "spry"] },
  { name: "Hulkling", aliases: ["hulking"], tags: ["buff heavy", "power gain", "unblockable", "cosmic"], counters: ["buff imbalance", "boss buffet", "boss tyranny"] },
  { name: "Human Torch", aliases: ["torch", "ht"], tags: ["incinerate", "mystic killer", "heal reversal"], counters: ["boss vigor", "recovery", "boss buffet"] },
  { name: "Hulk", aliases: ["og hulk"], tags: ["stun", "burst", "physical"], counters: ["stun immune", "crush", "heavy hitter"] },
  { name: "Hyperion", aliases: ["hype"], tags: ["power gain", "buff heavy", "cosmic"], counters: ["power snack", "boss power gain", "power alternator"] },
  { name: "Iceman", aliases: ["ice man"], tags: ["cold snap", "immune", "safety"], counters: ["hazard shift", "boss hazard"] },
  { name: "Infamous Iron Man", aliases: ["i doom", "infamous doom"], tags: ["power control", "shock", "armor", "metal"], counters: ["boss power gain", "enhanced armor"] },
  { name: "Ironheart", aliases: ["iron heart"], tags: ["armor break", "shock", "power control", "metal"], counters: ["boss armor", "enhanced armor"] },
  { name: "Juggernaut", aliases: ["juggs"], tags: ["unstoppable", "nullify immune", "burst"], counters: ["aspect of war", "heavy hitter", "boss tyranny"] },
  { name: "Kate Bishop", aliases: ["kate"], tags: ["slow", "anti evade", "cold snap", "burst"], counters: ["mix master", "spry", "boss evade"] },
  { name: "Kingpin", aliases: ["kp"], tags: ["shrug", "sustain", "power control", "debuff control"], counters: ["masochism", "pessimist", "indomitable"] },
  { name: "Kitty Pryde", aliases: ["kitty"], tags: ["phase", "miss", "prowess", "burst"], counters: ["spiked armor", "personal space", "power shield"] },
  { name: "Longshot", aliases: ["long shot"], tags: ["nullify", "fate seal", "burst"], counters: ["buff imbalance", "boss buffet", "arc overload"] },
  { name: "Magneto", aliases: ["red mags", "magneto red"], tags: ["metal killer", "armor break", "bleed", "prowess"], counters: ["enhanced armor", "boss armor"] },
  { name: "Magneto House of X", aliases: ["white magneto", "magneto white", "mags white"], tags: ["prefight", "support", "metal", "hero"], counters: ["prefight support", "boss island"] },
  { name: "Mantis", aliases: ["mantis"], tags: ["sleep", "burst", "control"], counters: ["stun immune", "window of opportunity stun"] },
  { name: "Mister Fantastic", aliases: ["mr fantastic", "fantastic"], tags: ["prefight", "power control", "petrify", "utility"], counters: ["boss vigor", "power gain"] },
  { name: "Mole Man", aliases: ["moleman"], tags: ["bleed", "evade counter", "unstoppable", "safety"], counters: ["mix master", "spry", "do you bleed"] },
  { name: "Nick Fury", aliases: ["nick"], tags: ["bleed", "safety", "second life", "burst"], counters: ["do you bleed", "boss rage", "unblockable finale"] },
  { name: "Nimrod", aliases: ["nim"], tags: ["robot", "shock", "armor", "mutant killer"], counters: ["boss armor", "hazard shift", "enhanced armor"] },
  { name: "Omega Sentinel", aliases: ["omega sent"], tags: ["robot", "heal block", "tracking", "armor"], counters: ["recovery", "boss vigor", "spry"] },
  { name: "Onslaught", aliases: ["on slaught"], tags: ["reverse control", "neuroshock", "mutant", "control"], counters: ["boss power gain", "personal space", "encroaching stun"] },
  { name: "Quake", aliases: ["quake"], tags: ["slow", "concussion", "no contact"], counters: ["spiked armor", "mix master", "spry"] },
  { name: "Rintrah", aliases: ["rintrah"], tags: ["neutralize", "root", "sustain", "mystic"], counters: ["buff imbalance", "boss buffet"] },
  { name: "Scorpion", aliases: ["scorp"], tags: ["poison", "rupture", "taunt", "debuff"], counters: ["recovery", "boss vigor", "biohazard"] },
  { name: "Shang-Chi", aliases: ["shang chi", "shang"], tags: ["slow", "cleanse", "stun", "burst"], counters: ["aspect of war", "heavy hitter", "mighty charge"] },
  { name: "Shuri", aliases: ["shuri"], tags: ["shock", "block penetration", "non contact"], counters: ["spiked armor", "boss armor"] },
  { name: "Silk", aliases: ["silk"], tags: ["evade", "debuff", "burst"], counters: ["spry", "mix master"] },
  { name: "Spider-Ham", aliases: ["ham", "spider ham"], tags: ["power sting", "evade", "taunt"], counters: ["special delivery", "power focus two"] },
  { name: "Spot", aliases: ["spot"], tags: ["miss", "rupture", "unblockable"], counters: ["personal space", "boss evade", "unblockable finale"] },
  { name: "Sunspot", aliases: ["sun spot"], tags: ["incinerate", "perfect block", "special burst"], counters: ["power shield", "hazard shift"] },
  { name: "Tigra", aliases: ["tigra"], tags: ["neutralize", "miss", "rupture", "mystic"], counters: ["buff imbalance", "personal space"] },
  { name: "Valkyrie", aliases: ["valk"], tags: ["safeguard bypass", "buff control", "unstoppable counter"], counters: ["safeguard", "aspect of war", "boss tyranny"] },
  { name: "Warlock", aliases: ["war lock"], tags: ["robot", "heal block", "power control", "infection"], counters: ["recovery", "boss vigor", "biohazard"] },
  { name: "Wiccan", aliases: ["wiccan"], tags: ["neutralize", "incinerate", "reverse control immune"], counters: ["buff imbalance", "boss buffet"] },
  { name: "Wolverine Weapon X", aliases: ["weapon x", "wwx"], tags: ["regen", "unstoppable", "bleed", "rage"], counters: ["recovery", "boss vigor", "aspect of war"] },
];

const findChampionProfile = (name: string): ChampionCounterProfile | null => {
  const text = normalizeText(name);
  if (!text) return null;
  return (
    CHAMPION_COUNTER_DATABASE.find((profile) => {
      if (normalizeText(profile.name) === text || text.includes(normalizeText(profile.name))) return true;
      return profile.aliases.some((alias) => text.includes(normalizeText(alias)));
    }) ?? null
  );
};

const inferTagsFromChampion = (name: string): string[] => {
  const profile = findChampionProfile(name);
  return profile ? unique(profile.tags) : [];
};

const findNodePreset = (key: string): WarNodePreset | null =>
  WAR_NODE_PRESETS.find((preset) => preset.key === key || preset.placement === key) ?? null;

const createEmptyDefender = (index: number): WarPlannerDefender => {
  const preset = WAR_NODE_PRESETS[index] ?? null;
  return {
    id: makeId("def", index),
    placement: preset?.placement ?? String(index + 1),
    path: preset?.path ?? "",
    name: "",
    nodeKey: preset?.key ?? "",
    node: preset?.name ?? "",
    tags: preset?.tags ?? "",
    notes: "",
  };
};

const createEmptySlot = (index: number): WarPlannerAttackerSlot => ({
  id: makeId("slot", index),
  name: "",
  tags: "",
  notes: "",
});

const createEmptyAttacker = (index: number): WarPlannerAttackerRow => ({
  id: makeId("atk", index),
  name: "",
  roster: "",
  tags: "",
  notes: "",
  prefightSupport: false,
  slots: Array.from({ length: SLOT_COUNT }).map((_, slotIndex) => createEmptySlot(slotIndex)),
});

const createInitialSupport = (): WarPlannerSupport => ({
  name: "White Magneto",
  active: false,
  charges: "3",
  notes: "Hero/metal prefight support.",
});

const createInitialBgPlan = (): WarPlannerBGPlan => ({
  defenders: Array.from({ length: DEFENDER_COUNT }).map((_, index) => createEmptyDefender(index)),
  attackers: Array.from({ length: ATTACKER_COUNT }).map((_, index) => createEmptyAttacker(index)),
  support: createInitialSupport(),
});

export const createInitialWarPlannerState = (): WarPlannerState => ({
  selectedBg: "BG1",
  bgPlans: {
    BG1: createInitialBgPlan(),
    BG2: createInitialBgPlan(),
    BG3: createInitialBgPlan(),
  },
});

const normalizeDefender = (value: unknown, index: number): WarPlannerDefender => {
  const fallback = createEmptyDefender(index);
  const row = (value && typeof value === "object" ? (value as Partial<WarPlannerDefender>) : {}) || {};
  const nodeKey = typeof row.nodeKey === "string" ? row.nodeKey : fallback.nodeKey;
  const preset = findNodePreset(nodeKey) ?? WAR_NODE_PRESETS[index] ?? null;
  return {
    id: typeof row.id === "string" && row.id ? row.id : fallback.id,
    placement: typeof row.placement === "string" && row.placement ? row.placement : preset?.placement ?? fallback.placement,
    path: typeof row.path === "string" && row.path ? row.path : preset?.path ?? fallback.path,
    name: typeof row.name === "string" ? row.name : "",
    nodeKey: preset?.key ?? nodeKey,
    node: typeof row.node === "string" && row.node ? row.node : preset?.name ?? fallback.node,
    tags: typeof row.tags === "string" && row.tags ? row.tags : preset?.tags ?? fallback.tags,
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
    roster: typeof (row as any).roster === "string" ? (row as any).roster : "",
    tags: typeof row.tags === "string" ? row.tags : "",
    notes: typeof row.notes === "string" ? row.notes : "",
    prefightSupport: Boolean(row.prefightSupport),
    slots: Array.from({ length: SLOT_COUNT }).map((_, slotIndex) => normalizeSlot(slots[slotIndex], slotIndex)),
  };
};

const normalizeSupport = (value: unknown): WarPlannerSupport => {
  const fallback = createInitialSupport();
  const row = (value && typeof value === "object" ? (value as Partial<WarPlannerSupport>) : {}) || {};
  return {
    name: typeof row.name === "string" ? row.name : fallback.name,
    active: Boolean(row.active),
    charges: typeof row.charges === "string" ? row.charges : fallback.charges,
    notes: typeof row.notes === "string" ? row.notes : fallback.notes,
  };
};

const normalizeBgPlan = (value: unknown): WarPlannerBGPlan => {
  const row = (value && typeof value === "object" ? (value as Partial<WarPlannerBGPlan>) : {}) || {};
  const defenders = Array.isArray(row.defenders) ? row.defenders : [];
  const attackers = Array.isArray(row.attackers) ? row.attackers : [];
  return {
    defenders: Array.from({ length: DEFENDER_COUNT }).map((_, index) => normalizeDefender(defenders[index], index)),
    attackers: Array.from({ length: ATTACKER_COUNT }).map((_, index) => normalizeAttacker(attackers[index], index)),
    support: normalizeSupport(row.support),
  };
};

export const normalizeWarPlannerState = (maybeState: unknown): WarPlannerState => {
  if (!maybeState || typeof maybeState !== "object") return createInitialWarPlannerState();
  const row = maybeState as Partial<WarPlannerState> & Partial<WarPlannerBGPlan>;
  const selectedBg = BG_NAMES.includes(row.selectedBg as WarPlannerBG) ? (row.selectedBg as WarPlannerBG) : "BG1";

  if (row.bgPlans && typeof row.bgPlans === "object") {
    const plans = row.bgPlans as Partial<Record<WarPlannerBG, WarPlannerBGPlan>>;
    return {
      selectedBg,
      bgPlans: {
        BG1: normalizeBgPlan(plans.BG1),
        BG2: normalizeBgPlan(plans.BG2),
        BG3: normalizeBgPlan(plans.BG3),
      },
    };
  }

  return {
    selectedBg,
    bgPlans: {
      BG1: normalizeBgPlan({
        defenders: Array.isArray(row.defenders) ? row.defenders : [],
        attackers: Array.isArray(row.attackers) ? row.attackers : [],
        support: row.support,
      }),
      BG2: createInitialBgPlan(),
      BG3: createInitialBgPlan(),
    },
  };
};

export const getWarPlannerBgPlan = (state: WarPlannerState, bg: WarPlannerBG = state.selectedBg): WarPlannerBGPlan =>
  normalizeWarPlannerState(state).bgPlans[bg];

export const setWarPlannerBgPlan = (state: WarPlannerState, bg: WarPlannerBG, plan: WarPlannerBGPlan): WarPlannerState => {
  const normalized = normalizeWarPlannerState(state);
  return {
    ...normalized,
    selectedBg: bg,
    bgPlans: {
      ...normalized.bgPlans,
      [bg]: normalizeBgPlan(plan),
    },
  };
};

export const setWarPlannerSelectedBg = (state: WarPlannerState, bg: WarPlannerBG): WarPlannerState => ({
  ...normalizeWarPlannerState(state),
  selectedBg: bg,
});

export const applyNodePresetToDefender = (defender: WarPlannerDefender, presetKey: string): WarPlannerDefender => {
  const preset = findNodePreset(presetKey);
  if (!preset) return defender;
  return {
    ...defender,
    placement: preset.placement,
    path: preset.path,
    nodeKey: preset.key,
    node: preset.name,
    tags: joinTags(defender.tags, preset.tags),
  };
};

export const suggestDefenderTags = (defender: WarPlannerDefender): string => {
  const preset = findNodePreset(defender.nodeKey);
  return joinTags(preset?.tags ?? "", defender.tags, inferTagsFromChampion(defender.name), defender.node, defender.notes);
};

export const suggestSlotTags = (slot: WarPlannerAttackerSlot, attacker?: WarPlannerAttackerRow): string =>
  joinTags(slot.tags, inferTagsFromChampion(slot.name), attacker?.tags ?? "", attacker?.notes ?? "", slot.notes);

export const splitRosterChampions = (value: string): string[] =>
  unique(
    String(value || "")
      .split(/[,;/|+\n]+/g)
      .map((champ) => champ.trim())
      .filter(Boolean),
  );

const formatReasons = (reasons: string[]): string[] => unique(reasons).slice(0, 6);

const keywordBoost = (haystack: string, needles: string[], score: number, label: string, reasons: string[]): number => {
  if (!hasAny(haystack, needles)) return 0;
  reasons.push(label);
  return score;
};

const counterRules: Array<{ label: string; needs: string[]; counters: string[]; score: number }> = [
  { label: "Anti-miss/evade", needs: ["miss", "evade", "phase", "spry", "falter"], counters: ["true strike", "true sense", "precision", "slow", "anti evade"], score: 36 },
  { label: "Buff control", needs: ["buff", "buff heavy", "buffet", "power snack"], counters: ["nullify", "stagger", "neutralize", "buff control"], score: 28 },
  { label: "Power control", needs: ["power gain", "power", "power focus", "power alternator"], counters: ["power control", "power drain", "taunt", "stagger", "nullify"], score: 24 },
  { label: "Heal control", needs: ["regen", "sustain", "heal", "vigor", "recovery"], counters: ["heal block", "heal reversal", "poison", "petrify", "degen"], score: 20 },
  { label: "Hazard safety", needs: ["biohazard", "poison", "bleed", "shock", "incinerate", "hazard"], counters: ["immune", "immunity", "purify", "cleanse", "robot"], score: 18 },
  { label: "Stun-safe", needs: ["limber", "stun immune", "encroaching stun"], counters: ["heavy", "fury", "slow", "power control", "stun immune"], score: 14 },
  { label: "Armor breaker", needs: ["armor", "metal", "robot", "crit resist"], counters: ["armor break", "armor shatter", "shock", "incinerate"], score: 14 },
  { label: "Contact safety", needs: ["thorns", "spiked armor", "contact punish"], counters: ["safeguard", "indestructible", "non contact", "phase"], score: 12 },
  { label: "Unstoppable control", needs: ["unstoppable", "unblockable", "mighty charge"], counters: ["slow", "nullify", "stagger", "neutralize"], score: 18 },
  { label: "Debuff discipline", needs: ["masochism", "conflictor", "debuff punish"], counters: ["passive utility", "shrug", "cleanse", "purify"], score: 14 },
];

const inferPrefightBonus = (attackerText: string, support: WarPlannerSupport): number => {
  if (!support.active) return 0;
  const supportName = normalizeText(support.name);
  const supportText = `${supportName} ${normalizeText(support.notes)}`;
  const teamCharges = Number(support.charges || 0);
  if (teamCharges <= 0 && !hasAny(supportText, ["white magneto", "magneto"])) return 0;
  if (hasAny(attackerText, ["prefight", "setup", "charge", "pre-fight", "prep"])) return hasAny(supportText, ["white magneto"]) ? 18 : 12;
  if (hasAny(attackerText, ["hero", "metal", "robot", "buff control", "utility"])) return hasAny(supportText, ["white magneto"]) ? 10 : 6;
  return 4;
};

const evaluateMatchup = (
  defender: WarPlannerDefender,
  attacker: WarPlannerAttackerRow,
  slot: WarPlannerAttackerSlot,
  support: WarPlannerSupport,
): { score: number; reasons: string[] } => {
  const nodePreset = findNodePreset(defender.nodeKey);
  const defenderProfile = findChampionProfile(defender.name);
  const attackerProfile = findChampionProfile(slot.name) ?? findChampionProfile(attacker.name);
  const defenderText = searchableText(
    defender.name,
    defender.node,
    defender.tags,
    defender.notes,
    nodePreset?.name ?? "",
    nodePreset?.tags ?? "",
    nodePreset?.notes ?? "",
  );
  const slotText = searchableText(slot.name, attacker.name, attacker.tags, attacker.notes, slot.tags, slot.notes, attackerProfile?.tags.join(", ") ?? "");
  const defenderTags = unique([
    ...splitTags(defender.tags),
    ...splitTags(defender.notes),
    ...inferTagsFromChampion(defender.name),
    ...splitTags(defender.node),
    ...splitTags(nodePreset?.tags ?? ""),
  ]);
  const attackerTags = unique([
    ...splitTags(attacker.tags),
    ...splitTags(attacker.notes),
    ...splitTags(slot.tags),
    ...splitTags(slot.notes),
    ...inferTagsFromChampion(slot.name),
    ...inferTagsFromChampion(attacker.name),
  ]);
  const reasons: string[] = [];
  let score = 0;

  if (!normalizeText(slot.name)) {
    return { score: -9999, reasons: ["Empty slot"] };
  }

  score += 8;
  score += Math.min(18, attackerTags.length * 2);
  score += Math.min(12, defenderTags.length);

  if (nodePreset && hasAny(slotText, splitTags(nodePreset.counters))) {
    score += 22;
    reasons.push("Node counter");
  }

  if (defenderProfile && attackerProfile) {
    const profileHits = defenderProfile.tags.filter((tag) => hasAny(slotText, [tag]));
    if (profileHits.length > 0) {
      score += Math.min(18, profileHits.length * 6);
      reasons.push("Defender profile match");
    }
  }

  score += keywordBoost(slotText, ["true strike", "true sense", "precision", "anti evade"], 8, "Anti-evade tools", reasons);
  score += keywordBoost(slotText, ["nullify", "stagger", "neutralize"], 8, "Buff control", reasons);
  score += keywordBoost(slotText, ["power control", "power drain", "power burn", "taunt"], 8, "Power control", reasons);
  score += keywordBoost(slotText, ["heal block", "heal reversal", "poison", "petrify", "degen"], 6, "Heal pressure", reasons);
  score += keywordBoost(slotText, ["shock", "incinerate", "rupture", "bleed", "poison"], 4, "Damage pressure", reasons);
  score += keywordBoost(slotText, ["sustain", "immunity", "immune", "purify", "cleanse"], 4, "Safety", reasons);

  counterRules.forEach((rule) => {
    const defenderHit = hasAny(defenderText, rule.needs) || defenderTags.some((tag) => rule.needs.some((need) => tag.includes(need)));
    const attackerHit = hasAny(slotText, rule.counters) || attackerTags.some((tag) => rule.counters.some((counter) => tag.includes(counter)));
    if (defenderHit && attackerHit) {
      score += rule.score;
      reasons.push(rule.label);
    }
  });

  score += inferPrefightBonus(slotText, support);

  if (hasAny(slotText, ["white magneto", "magneto house of x"])) {
    score += 6;
    reasons.push("Prefight support");
  }

  if (attacker.prefightSupport) {
    score += 4;
    reasons.push("Team prefight");
  }

  if (normalizeText(defender.name) && normalizeText(slot.name) === normalizeText(defender.name)) {
    score -= 8;
    reasons.push("Mirror matchup");
  }

  return { score, reasons: formatReasons(reasons) };
};

const buildRosterSlots = (attackers: WarPlannerAttackerRow[]) =>
  attackers.flatMap((attacker, attackerIndex) => {
    const rosterChampions = splitRosterChampions(attacker.roster);
    const manualSlots = attacker.slots.map((slot) => slot.name.trim()).filter(Boolean);
    const champs = unique(rosterChampions.length > 0 ? rosterChampions : manualSlots);
    return champs.map((champion, rosterChampionIndex) => {
      const manualSlot = attacker.slots.find((slot) => normalizeText(slot.name) === normalizeText(champion));
      return {
        attackerIndex,
        slotIndex: rosterChampionIndex,
        rosterChampionIndex,
        attacker,
        slot: {
          id: `${attacker.id}-roster-${rosterChampionIndex + 1}`,
          name: champion,
          tags: manualSlot?.tags || joinTags(inferTagsFromChampion(champion), attacker.tags),
          notes: manualSlot?.notes || "",
        } satisfies WarPlannerAttackerSlot,
      };
    });
  });

export const recommendWarPlan = (
  state: WarPlannerState,
  bg: WarPlannerBG = normalizeWarPlannerState(state).selectedBg,
): {
  bg: WarPlannerBG;
  assignments: WarPlannerMatchup[];
  defenders: WarPlannerDefenderRecommendation[];
  unmatchedSlots: Array<{ attackerIndex: number; slotIndex: number; attacker: WarPlannerAttackerRow; slot: WarPlannerAttackerSlot }>;
} => {
  const normalized = normalizeWarPlannerState(state);
  const plan = normalized.bgPlans[bg];
  const realSlots = buildRosterSlots(plan.attackers).filter(({ slot }) => normalizeText(slot.name));

  const pairings = plan.defenders.flatMap((defender, defenderIndex) =>
    realSlots.map(({ attackerIndex, slotIndex, rosterChampionIndex, attacker, slot }) => {
      const evaluation = evaluateMatchup(defender, attacker, slot, plan.support);
      return {
        defenderIndex,
        attackerIndex,
        slotIndex,
        rosterChampionIndex,
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
  const usedPlayerChampions = new Set<string>();
  const playerFightCounts = new Map<number, number>();
  const assignments: WarPlannerMatchup[] = [];

  sortedPairs.forEach((pairing) => {
    if (pairing.score <= 0) return;
    const championKey = `${pairing.attackerIndex}-${normalizeText(pairing.slot.name)}`;
    const currentPlayerFights = playerFightCounts.get(pairing.attackerIndex) ?? 0;
    if (usedDefenders.has(pairing.defenderIndex) || usedPlayerChampions.has(championKey) || currentPlayerFights >= SLOT_COUNT) return;
    usedDefenders.add(pairing.defenderIndex);
    usedPlayerChampions.add(championKey);
    playerFightCounts.set(pairing.attackerIndex, currentPlayerFights + 1);
    assignments.push(pairing);
  });

  const recommendations: WarPlannerDefenderRecommendation[] = plan.defenders.map((defender, defenderIndex) => {
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

  const unmatchedSlots = buildRosterSlots(plan.attackers)
    .filter(({ slot }) => normalizeText(slot.name))
    .filter(({ attackerIndex, slot }) => !usedPlayerChampions.has(`${attackerIndex}-${normalizeText(slot.name)}`));

  return {
    bg,
    assignments,
    defenders: recommendations,
    unmatchedSlots,
  };
};

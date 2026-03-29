import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const BG_NAMES = ["BG1", "BG2", "BG3"] as const;
const PLAYERS_PER_BG = 10;

const getAllowedEditorEmails = () =>
  (process.env.EDITOR_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

const getIdentityEmail = (identity: any): string | null => {
  const raw =
    identity?.email ||
    identity?.emailAddress ||
    identity?.claims?.email ||
    identity?.claims?.email_address ||
    identity?.claims?.["email"] ||
    identity?.claims?.["email_address"] ||
    null;
  if (!raw || typeof raw !== "string") return null;
  return raw.toLowerCase().trim();
};

const getIdentityCandidates = (identity: any): string[] => {
  const values = new Set<string>();
  const add = (val: unknown) => {
    if (typeof val !== "string") return;
    const cleaned = val.trim().toLowerCase();
    if (!cleaned) return;
    values.add(cleaned);
    cleaned.split("|").map((part) => part.trim()).filter(Boolean).forEach((part) => values.add(part));
  };

  add(getIdentityEmail(identity));
  add(identity?.subject);
  add(identity?.tokenIdentifier);
  add(identity?.claims?.sub);
  add(identity?.claims?.sid);
  add(identity?.claims?.email);
  add(identity?.claims?.email_address);
  add(identity?.claims?.["email"]);
  add(identity?.claims?.["email_address"]);
  return Array.from(values);
};

const canEditByIdentity = (identity: any): boolean => {
  const allowed = getAllowedEditorEmails();
  if (allowed.length === 0) return true;
  const candidates = getIdentityCandidates(identity);
  if (candidates.length === 0) return false;
  return allowed.some((entry) => candidates.some((candidate) => candidate === entry || candidate.includes(entry)));
};

const requireEditor = (identity: any) => {
  if (!canEditByIdentity(identity)) {
    throw new Error("Forbidden: editor access required");
  }
};

const isDefaultPlayer = (player: any, fallbackName: string) => {
  const name = typeof player?.name === "string" ? player.name.trim() : "";
  const kills = Number(player?.kills || 0);
  const deaths = Number(player?.deaths || 0);
  return (name === "" || name === fallbackName) && kills === 0 && deaths === 0;
};

const hasMeaningfulData = (state: any) => {
  if (!state || typeof state !== "object") return false;
  const historyLen = Array.isArray(state.history) ? state.history.length : 0;
  const bonusHistoryLen = Array.isArray(state.bonusHistory) ? state.bonusHistory.length : 0;
  const defenseHistoryLen = Array.isArray(state.defenseHistory) ? state.defenseHistory.length : 0;
  const submittedMvpsLen = Array.isArray(state.submittedMvps) ? state.submittedMvps.length : 0;
  const seasonTrackerLen =
    state.seasonTracker && typeof state.seasonTracker === "object" ? Object.keys(state.seasonTracker).length : 0;
  if (historyLen > 0 || bonusHistoryLen > 0 || defenseHistoryLen > 0 || submittedMvpsLen > 0 || seasonTrackerLen > 0)
    return true;

  return BG_NAMES.some((bg) => {
    const rows = Array.isArray(state.data?.[bg]) ? state.data[bg] : [];
    return rows.some((row: any, i: number) => !isDefaultPlayer(row, `${bg}-Player${i + 1}`));
  });
};

const isLikelyBootstrapSnapshot = (state: any) => {
  if (!state || typeof state !== "object") return true;
  const historyLen = Array.isArray(state.history) ? state.history.length : 0;
  const bonusHistoryLen = Array.isArray(state.bonusHistory) ? state.bonusHistory.length : 0;
  const defenseHistoryLen = Array.isArray(state.defenseHistory) ? state.defenseHistory.length : 0;
  const submittedMvpsLen = Array.isArray(state.submittedMvps) ? state.submittedMvps.length : 0;
  const seasonTrackerLen =
    state.seasonTracker && typeof state.seasonTracker === "object" ? Object.keys(state.seasonTracker).length : 0;
  if (historyLen > 0 || bonusHistoryLen > 0 || defenseHistoryLen > 0 || submittedMvpsLen > 0 || seasonTrackerLen > 0)
    return false;

  return BG_NAMES.every((bg) => {
    const rows = Array.isArray(state.data?.[bg]) ? state.data[bg] : [];
    return Array.from({ length: PLAYERS_PER_BG }).every((_, i) => isDefaultPlayer(rows[i], `${bg}-Player${i + 1}`));
  });
};

const normalizePlayer = (player: any, fallbackName: string) => {
  return {
    name: typeof player?.name === "string" && player.name.trim() ? player.name : fallbackName,
    kills: Number(player?.kills || 0),
    deaths: Number(player?.deaths || 0),
    updatedAt: Number(player?.updatedAt || 0),
  };
};

const mergeData = (existingData: any, incomingData: any) => {
  const merged: Record<string, unknown[]> = {};
  BG_NAMES.forEach((bg) => {
    const existingRows = Array.isArray(existingData?.[bg]) ? existingData[bg] : [];
    const incomingRows = Array.isArray(incomingData?.[bg]) ? incomingData[bg] : [];
    const rowCount = Math.max(existingRows.length, incomingRows.length, PLAYERS_PER_BG);
    merged[bg] = Array.from({ length: rowCount }).map((_, i) => {
      const fallbackName = `${bg}-Player${i + 1}`;
      const existingPlayer = normalizePlayer(existingRows[i], fallbackName);
      const incomingPlayer = normalizePlayer(incomingRows[i], existingPlayer.name || fallbackName);
      if (incomingPlayer.updatedAt > existingPlayer.updatedAt) {
        if (isDefaultPlayer(incomingPlayer, fallbackName) && !isDefaultPlayer(existingPlayer, fallbackName)) {
          return existingPlayer;
        }
        return incomingPlayer;
      }
      if (existingPlayer.updatedAt > incomingPlayer.updatedAt) return existingPlayer;

      if (isDefaultPlayer(incomingPlayer, fallbackName) && !isDefaultPlayer(existingPlayer, fallbackName)) return existingPlayer;
      if (isDefaultPlayer(existingPlayer, fallbackName) && !isDefaultPlayer(incomingPlayer, fallbackName)) return incomingPlayer;
      return incomingPlayer;
    });
  });
  return merged;
};

const mergeState = (existingState: any, incomingState: any) => {
  if (!existingState) return incomingState;
  if (!incomingState) return existingState;
  if (hasMeaningfulData(existingState) && isLikelyBootstrapSnapshot(incomingState)) {
    return {
      ...existingState,
      updatedAt: Math.max(Number(existingState.updatedAt || 0), Number(incomingState.updatedAt || 0)),
    };
  }

  const existingHistory = Array.isArray(existingState.history) ? existingState.history : [];
  const incomingHistory = Array.isArray(incomingState.history) ? incomingState.history : [];
  const existingBonusHistory = Array.isArray(existingState.bonusHistory) ? existingState.bonusHistory : [];
  const incomingBonusHistory = Array.isArray(incomingState.bonusHistory) ? incomingState.bonusHistory : [];
  const existingDefenseHistory = Array.isArray(existingState.defenseHistory) ? existingState.defenseHistory : [];
  const incomingDefenseHistory = Array.isArray(incomingState.defenseHistory) ? incomingState.defenseHistory : [];
  const existingProgress = Math.max(existingHistory.length, existingBonusHistory.length, existingDefenseHistory.length);
  const incomingProgress = Math.max(incomingHistory.length, incomingBonusHistory.length, incomingDefenseHistory.length);

  const existingUpdatedAt = Number(existingState.updatedAt || 0);
  const incomingUpdatedAt = Number(incomingState.updatedAt || 0);
  const useIncomingMeta =
    incomingProgress > existingProgress || (incomingProgress === existingProgress && incomingUpdatedAt >= existingUpdatedAt);

  return {
    ...existingState,
    ...incomingState,
    data: mergeData(existingState.data, incomingState.data),
    history: useIncomingMeta ? incomingHistory : existingHistory,
    submittedMvps: useIncomingMeta ? incomingState.submittedMvps ?? existingState.submittedMvps : existingState.submittedMvps,
    seasonTracker: useIncomingMeta ? incomingState.seasonTracker ?? existingState.seasonTracker : existingState.seasonTracker,
    bonusDraft: useIncomingMeta ? incomingState.bonusDraft ?? existingState.bonusDraft : existingState.bonusDraft,
    bonusHistory: useIncomingMeta ? incomingBonusHistory : existingBonusHistory,
    defenseDraft: useIncomingMeta ? incomingState.defenseDraft ?? existingState.defenseDraft : existingState.defenseDraft,
    defenseHistory: useIncomingMeta ? incomingDefenseHistory : existingDefenseHistory,
    updatedAt: Math.max(existingUpdatedAt, incomingUpdatedAt),
  };
};

const createInitialState = () => {
  const data: Record<string, unknown[]> = {};
  BG_NAMES.forEach((bg) => {
    data[bg] = Array.from({ length: PLAYERS_PER_BG }).map((_, i) => ({
      name: `${bg}-Player${i + 1}`,
      kills: 0,
      deaths: 0,
      updatedAt: 0,
    }));
  });
  return {
    data,
    history: [],
    submittedMvps: [],
    seasonTracker: {},
    bonusDraft: { BG1: 0, BG2: 0, BG3: 0 },
    bonusHistory: [],
    defenseDraft: { BG1: 0, BG2: 0, BG3: 0 },
    defenseHistory: [],
    updatedAt: 0,
  };
};

const normalizeState = (state: any) => {
  return mergeState(createInitialState(), state);
};

export const getState = query({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("warStates")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .unique();
    return row?.state ?? null;
  },
});

export const getEditAccess = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const candidates = getIdentityCandidates(identity);
    return {
      canEdit: canEditByIdentity(identity),
      email: getIdentityEmail(identity),
      subject: identity?.subject ?? null,
      tokenIdentifier: identity?.tokenIdentifier ?? null,
      candidates,
      hasEditorList: getAllowedEditorEmails().length > 0,
    };
  },
});

export const saveState = mutation({
  args: {
    roomId: v.string(),
    state: v.any(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    requireEditor(identity);

    const existing = await ctx.db
      .query("warStates")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .unique();

    if (existing) {
      const mergedState = mergeState(existing.state, args.state);
      await ctx.db.patch(existing._id, {
        state: mergedState,
        updatedAt: Math.max(Number(existing.updatedAt || 0), Number(args.updatedAt || 0)),
        updatedBy: identity?.subject ?? "anonymous",
      });
      return existing._id;
    }

    return await ctx.db.insert("warStates", {
      roomId: args.roomId,
      state: args.state,
      updatedAt: args.updatedAt,
      updatedBy: identity?.subject ?? "anonymous",
    });
  },
});

export const updatePlayer = mutation({
  args: {
    roomId: v.string(),
    bg: v.union(v.literal("BG1"), v.literal("BG2"), v.literal("BG3")),
    index: v.number(),
    player: v.object({
      name: v.string(),
      kills: v.number(),
      deaths: v.number(),
      updatedAt: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    requireEditor(identity);
    const existing = await ctx.db
      .query("warStates")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .unique();

    const baseState = normalizeState(existing?.state ?? null);
    const rows = Array.isArray(baseState.data?.[args.bg]) ? [...baseState.data[args.bg]] : [];
    const rowCount = Math.max(rows.length, PLAYERS_PER_BG, args.index + 1);
    const nextRows = Array.from({ length: rowCount }).map((_, i) =>
      normalizePlayer(rows[i], `${args.bg}-Player${i + 1}`),
    );
    const current = nextRows[args.index] || normalizePlayer(null, `${args.bg}-Player${args.index + 1}`);
    if (args.player.updatedAt >= Number(current.updatedAt || 0)) {
      nextRows[args.index] = normalizePlayer(args.player, current.name || `${args.bg}-Player${args.index + 1}`);
    }

    const nextState = {
      ...baseState,
      data: {
        ...baseState.data,
        [args.bg]: nextRows,
      },
      updatedAt: Math.max(Number(baseState.updatedAt || 0), Number(args.player.updatedAt || 0), Date.now()),
    };

    if (existing) {
      await ctx.db.patch(existing._id, {
        state: nextState,
        updatedAt: nextState.updatedAt,
        updatedBy: identity?.subject ?? "anonymous",
      });
      return existing._id;
    }

    return await ctx.db.insert("warStates", {
      roomId: args.roomId,
      state: nextState,
      updatedAt: nextState.updatedAt,
      updatedBy: identity?.subject ?? "anonymous",
    });
  },
});

export const updateBonusDraft = mutation({
  args: {
    roomId: v.string(),
    bg: v.union(v.literal("BG1"), v.literal("BG2"), v.literal("BG3")),
    value: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    requireEditor(identity);
    const existing = await ctx.db
      .query("warStates")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .unique();

    const baseState = normalizeState(existing?.state ?? null);
    const nextState = {
      ...baseState,
      bonusDraft: {
        ...(baseState.bonusDraft || { BG1: 0, BG2: 0, BG3: 0 }),
        [args.bg]: Number(args.value || 0),
      },
      updatedAt: Math.max(Number(baseState.updatedAt || 0), Date.now()),
    };

    if (existing) {
      await ctx.db.patch(existing._id, {
        state: nextState,
        updatedAt: nextState.updatedAt,
        updatedBy: identity?.subject ?? "anonymous",
      });
      return existing._id;
    }

    return await ctx.db.insert("warStates", {
      roomId: args.roomId,
      state: nextState,
      updatedAt: nextState.updatedAt,
      updatedBy: identity?.subject ?? "anonymous",
    });
  },
});

export const updateDefenseDraft = mutation({
  args: {
    roomId: v.string(),
    bg: v.union(v.literal("BG1"), v.literal("BG2"), v.literal("BG3")),
    value: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    requireEditor(identity);
    const existing = await ctx.db
      .query("warStates")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .unique();

    const baseState = normalizeState(existing?.state ?? null);
    const nextState = {
      ...baseState,
      defenseDraft: {
        ...(baseState.defenseDraft || { BG1: 0, BG2: 0, BG3: 0 }),
        [args.bg]: Number(args.value || 0),
      },
      updatedAt: Math.max(Number(baseState.updatedAt || 0), Date.now()),
    };

    if (existing) {
      await ctx.db.patch(existing._id, {
        state: nextState,
        updatedAt: nextState.updatedAt,
        updatedBy: identity?.subject ?? "anonymous",
      });
      return existing._id;
    }

    return await ctx.db.insert("warStates", {
      roomId: args.roomId,
      state: nextState,
      updatedAt: nextState.updatedAt,
      updatedBy: identity?.subject ?? "anonymous",
    });
  },
});

export const resetState = mutation({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    requireEditor(identity);
    const existing = await ctx.db
      .query("warStates")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .unique();

    const base = createInitialState();
    const nextState = {
      ...base,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, {
        state: nextState,
        updatedAt: nextState.updatedAt,
        updatedBy: identity?.subject ?? "anonymous",
      });
      return existing._id;
    }

    return await ctx.db.insert("warStates", {
      roomId: args.roomId,
      state: nextState,
      updatedAt: nextState.updatedAt,
      updatedBy: identity?.subject ?? "anonymous",
    });
  },
});

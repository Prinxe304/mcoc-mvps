import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const BG_NAMES = ["BG1", "BG2", "BG3"] as const;
const PLAYERS_PER_BG = 10;

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
      return incomingPlayer.updatedAt >= existingPlayer.updatedAt ? incomingPlayer : existingPlayer;
    });
  });
  return merged;
};

const mergeState = (existingState: any, incomingState: any) => {
  if (!existingState) return incomingState;
  if (!incomingState) return existingState;

  const existingHistory = Array.isArray(existingState.history) ? existingState.history : [];
  const incomingHistory = Array.isArray(incomingState.history) ? incomingState.history : [];
  const existingBonusHistory = Array.isArray(existingState.bonusHistory) ? existingState.bonusHistory : [];
  const incomingBonusHistory = Array.isArray(incomingState.bonusHistory) ? incomingState.bonusHistory : [];
  const existingProgress = Math.max(existingHistory.length, existingBonusHistory.length);
  const incomingProgress = Math.max(incomingHistory.length, incomingBonusHistory.length);

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
    updatedAt: Math.max(existingUpdatedAt, incomingUpdatedAt),
  };
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

export const saveState = mutation({
  args: {
    roomId: v.string(),
    state: v.any(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

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

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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
      await ctx.db.patch(existing._id, {
        state: args.state,
        updatedAt: args.updatedAt,
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

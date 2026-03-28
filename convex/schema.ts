import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  warStates: defineTable({
    roomId: v.string(),
    state: v.any(),
    updatedAt: v.number(),
    updatedBy: v.string(),
  }).index("by_room_id", ["roomId"]),
});

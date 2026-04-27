import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  }).index("by_clerk_id", ["clerkId"]),

  chats: defineTable({
    userId: v.id("users"),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_updated", ["userId", "updatedAt"]),

  messages: defineTable({
    chatId: v.id("chats"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    fileIds: v.optional(v.array(v.id("_storage"))),
    fileUrls: v.optional(v.array(v.string())),
    fileTypes: v.optional(v.array(v.string())),
    fileNames: v.optional(v.array(v.string())),
    createdAt: v.number(),
  }).index("by_chat", ["chatId"]),

  files: defineTable({
    storageId: v.id("_storage"),
    userId: v.id("users"),
    contentType: v.optional(v.string()),
    fileName: v.optional(v.string()),
    size: v.optional(v.number()),
    uploadedAt: v.number(),
  })
    .index("by_storage_id", ["storageId"])
    .index("by_user", ["userId"]),
});

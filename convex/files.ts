import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    return await ctx.storage.generateUploadUrl();
  },
});

export const recordUpload = mutation({
  args: {
    storageId: v.id("_storage"),
    contentType: v.optional(v.string()),
    fileName: v.optional(v.string()),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) throw new Error("Unauthorized");

    if (args.size !== undefined && args.size < 0) {
      throw new Error("Invalid file size");
    }

    const fileName =
      args.fileName !== undefined ? args.fileName.slice(0, 255) : undefined;

    const existing = await ctx.db
      .query("files")
      .withIndex("by_storage_id", (q) => q.eq("storageId", args.storageId))
      .first();

    if (existing) {
      if (existing.userId !== user._id) throw new Error("Unauthorized");
      return null;
    }

    await ctx.db.insert("files", {
      storageId: args.storageId,
      userId: user._id,
      contentType: args.contentType,
      fileName,
      size: args.size,
      uploadedAt: Date.now(),
    });

    return null;
  },
});

export const getUrl = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) throw new Error("Unauthorized");

    const file = await ctx.db
      .query("files")
      .withIndex("by_storage_id", (q) => q.eq("storageId", args.storageId))
      .first();

    if (!file) throw new Error("Unauthorized");

    if (file.userId !== user._id) throw new Error("Unauthorized");

    return await ctx.storage.getUrl(args.storageId);
  },
});

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    chatId: v.id("chats"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    fileIds: v.optional(v.array(v.id("_storage"))),
    fileTypes: v.optional(v.array(v.string())),
    fileNames: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    if (args.content.length > 10000) throw new Error("Content too long");

    const chat = await ctx.db.get(args.chatId);
    if (!chat) throw new Error("Chat not found");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user || chat.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    // verify each fileId belongs to caller before linking — prevents file-grafting
    if (args.fileIds && args.fileIds.length > 0) {
      for (const fileId of args.fileIds) {
        const file = await ctx.db
          .query("files")
          .withIndex("by_storage_id", (q) => q.eq("storageId", fileId))
          .first();
        if (!file || file.userId !== user._id) {
          throw new Error("Unauthorized: file not owned by user");
        }
      }
    }

    const messageId = await ctx.db.insert("messages", {
      chatId: args.chatId,
      role: args.role,
      content: args.content,
      fileIds: args.fileIds,
      fileTypes: args.fileTypes,
      fileNames: args.fileNames,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.chatId, {
      updatedAt: Date.now(),
    });

    return messageId;
  },
});

export const getByChatId = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const chat = await ctx.db.get(args.chatId);
    if (!chat) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user || chat.userId !== user._id) return [];

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .order("asc")
      .collect();

    // Regenerate file URLs from fileIds to ensure they're always fresh
    // Also query file metadata for messages without stored fileTypes
    const messagesWithUrls = await Promise.all(
      messages.map(async (message) => {
        if (message.fileIds && message.fileIds.length > 0) {
          const fileUrls = await Promise.all(
            message.fileIds.map(async (fileId) => {
              const url = await ctx.storage.getUrl(fileId);
              return url || "";
            })
          );

          // If fileTypes are missing, query storage metadata as fallback
          let fileTypes = message.fileTypes;
          if (!fileTypes || fileTypes.length === 0) {
            fileTypes = await Promise.all(
              message.fileIds.map(async (fileId) => {
                try {
                  const metadata = await ctx.db.system.get("_storage", fileId);
                  return metadata?.contentType || "";
                } catch {
                  return "";
                }
              })
            );
            // Filter out empty strings
            fileTypes = fileTypes.filter((type) => type !== "");
          }

          return {
            ...message,
            fileUrls: fileUrls.filter((url) => url !== ""),
            fileTypes: fileTypes.length > 0 ? fileTypes : undefined,
          };
        }
        return message;
      })
    );

    return messagesWithUrls;
  },
});

export const updateContent = mutation({
  args: {
    id: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    if (args.content.length > 10000) throw new Error("Content too long");

    const message = await ctx.db.get(args.id);
    if (!message) throw new Error("Message not found");

    const chat = await ctx.db.get(message.chatId);
    if (!chat) throw new Error("Chat not found");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user || chat.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.id, {
      content: args.content,
    });
  },
});

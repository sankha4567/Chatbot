// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

type ConvexT = ReturnType<typeof convexTest>;

function asUser(t: ConvexT, subject: string, email: string) {
  return t.withIdentity({ subject, email });
}

async function bootstrap(t: ConvexT, subject: string, email: string) {
  const u = asUser(t, subject, email);
  await u.mutation(api.users.getOrCreate, {});
  return u;
}

describe("chats.create", () => {
  test("throws when unauthenticated", async () => {
    const t = convexTest(schema);
    await expect(
      t.mutation(api.chats.create, { title: "Hi" })
    ).rejects.toThrow(/Not authenticated/);
  });

  test("creates a chat owned by the authenticated user", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");

    const chatId = await alice.mutation(api.chats.create, { title: "Hello" });
    expect(chatId).toBeDefined();

    const chat = await t.run(async (ctx) => ctx.db.get(chatId));
    expect(chat).not.toBeNull();
    expect(chat?.title).toBe("Hello");
    const aliceUser = await t.run(async (ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", "clerk_alice"))
        .first()
    );
    expect(chat?.userId).toBe(aliceUser?._id);
  });

  test("uses 'New Chat' as default title when none is supplied", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const chatId = await alice.mutation(api.chats.create, {});
    const chat = await t.run(async (ctx) => ctx.db.get(chatId));
    expect(chat?.title).toBe("New Chat");
  });

  test("rejects titles longer than 255 characters", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const longTitle = "x".repeat(256);
    await expect(
      alice.mutation(api.chats.create, { title: longTitle })
    ).rejects.toThrow(/Title too long/);
  });
});

describe("chats.getById", () => {
  test("returns null when reading another user's chat", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const bob = await bootstrap(t, "clerk_bob", "bob@example.com");

    const aliceChat = await alice.mutation(api.chats.create, { title: "A" });
    const peeked = await bob.query(api.chats.getById, { id: aliceChat });
    expect(peeked).toBeNull();
  });

  test("returns the chat when reading your own", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const chatId = await alice.mutation(api.chats.create, { title: "Mine" });
    const fetched = await alice.query(api.chats.getById, { id: chatId });
    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe("Mine");
  });
});

describe("chats.rename", () => {
  test("throws when unauthenticated", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const chatId = await alice.mutation(api.chats.create, { title: "Old" });

    await expect(
      t.mutation(api.chats.rename, { id: chatId, title: "New" })
    ).rejects.toThrow(/Not authenticated/);
  });

  test("rejects renaming someone else's chat with Unauthorized", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const bob = await bootstrap(t, "clerk_bob", "bob@example.com");
    const aliceChat = await alice.mutation(api.chats.create, { title: "A" });

    await expect(
      bob.mutation(api.chats.rename, { id: aliceChat, title: "Hijack" })
    ).rejects.toThrow(/Unauthorized/);
  });

  test("rejects rename titles longer than 255 characters", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const chatId = await alice.mutation(api.chats.create, { title: "Old" });

    await expect(
      alice.mutation(api.chats.rename, { id: chatId, title: "x".repeat(256) })
    ).rejects.toThrow(/Title too long/);
  });

  test("updates the title for the owner", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const chatId = await alice.mutation(api.chats.create, { title: "Old" });
    await alice.mutation(api.chats.rename, { id: chatId, title: "Renamed" });
    const chat = await t.run(async (ctx) => ctx.db.get(chatId));
    expect(chat?.title).toBe("Renamed");
  });
});

describe("chats.remove", () => {
  test("rejects removing someone else's chat", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const bob = await bootstrap(t, "clerk_bob", "bob@example.com");
    const aliceChat = await alice.mutation(api.chats.create, { title: "A" });

    await expect(
      bob.mutation(api.chats.remove, { id: aliceChat })
    ).rejects.toThrow(/Unauthorized/);
  });

  test("cascades to delete messages in the chat", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const chatId = await alice.mutation(api.chats.create, { title: "A" });

    await alice.mutation(api.messages.create, {
      chatId,
      role: "user",
      content: "msg1",
    });
    await alice.mutation(api.messages.create, {
      chatId,
      role: "assistant",
      content: "msg2",
    });

    const beforeMsgs = await t.run(async (ctx) =>
      ctx.db
        .query("messages")
        .withIndex("by_chat", (q) => q.eq("chatId", chatId))
        .collect()
    );
    expect(beforeMsgs).toHaveLength(2);

    await alice.mutation(api.chats.remove, { id: chatId });

    const afterChat = await t.run(async (ctx) => ctx.db.get(chatId));
    expect(afterChat).toBeNull();

    const afterMsgs = await t.run(async (ctx) =>
      ctx.db
        .query("messages")
        .withIndex("by_chat", (q) => q.eq("chatId", chatId))
        .collect()
    );
    expect(afterMsgs).toHaveLength(0);
  });
});

describe("chats.list", () => {
  test("returns only chats owned by the calling user", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const bob = await bootstrap(t, "clerk_bob", "bob@example.com");

    await alice.mutation(api.chats.create, { title: "A1" });
    await alice.mutation(api.chats.create, { title: "A2" });
    await bob.mutation(api.chats.create, { title: "B1" });

    const aliceList = await alice.query(api.chats.list, {});
    const bobList = await bob.query(api.chats.list, {});

    expect(aliceList).toHaveLength(2);
    expect(bobList).toHaveLength(1);
    expect(aliceList.every((c) => c.title.startsWith("A"))).toBe(true);
    expect(bobList[0].title).toBe("B1");
  });

  test("returns [] for unauthenticated callers", async () => {
    const t = convexTest(schema);
    const list = await t.query(api.chats.list, {});
    expect(list).toEqual([]);
  });
});

describe("chats.search", () => {
  test("returns [] when query exceeds 200 characters", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    await alice.mutation(api.chats.create, { title: "Pizza recipes" });
    const result = await alice.query(api.chats.search, {
      query: "p".repeat(201),
    });
    expect(result).toEqual([]);
  });

  test("filters by case-insensitive substring on owner's chats", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const bob = await bootstrap(t, "clerk_bob", "bob@example.com");
    await alice.mutation(api.chats.create, { title: "Pizza recipes" });
    await alice.mutation(api.chats.create, { title: "Travel notes" });
    await bob.mutation(api.chats.create, { title: "Pizza shop" });

    const results = await alice.query(api.chats.search, { query: "pizza" });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Pizza recipes");
  });
});

describe("chats.updateTimestamp", () => {
  test("throws when unauthenticated", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const chatId = await alice.mutation(api.chats.create, { title: "A" });
    await expect(
      t.mutation(api.chats.updateTimestamp, { id: chatId })
    ).rejects.toThrow(/Not authenticated/);
  });

  test("rejects when caller doesn't own the chat", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const bob = await bootstrap(t, "clerk_bob", "bob@example.com");
    const aliceChat = await alice.mutation(api.chats.create, { title: "A" });
    await expect(
      bob.mutation(api.chats.updateTimestamp, { id: aliceChat })
    ).rejects.toThrow(/Unauthorized/);
  });

  test("bumps updatedAt for the owner", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const chatId: Id<"chats"> = await alice.mutation(api.chats.create, {
      title: "A",
    });
    const before = await t.run(async (ctx) => ctx.db.get(chatId));
    expect(before).not.toBeNull();
    const beforeTs = before!.updatedAt;
    // Make sure clock can advance even on fast machines.
    await new Promise((r) => setTimeout(r, 5));
    await alice.mutation(api.chats.updateTimestamp, { id: chatId });
    const after = await t.run(async (ctx) => ctx.db.get(chatId));
    expect(after!.updatedAt).toBeGreaterThanOrEqual(beforeTs);
  });
});

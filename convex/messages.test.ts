// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

type ConvexT = ReturnType<typeof convexTest>;

async function bootstrap(t: ConvexT, subject: string, email: string) {
  const u = t.withIdentity({ subject, email });
  await u.mutation(api.users.getOrCreate, {});
  return u;
}

describe("messages.create", () => {
  test("throws when unauthenticated", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const chatId = await alice.mutation(api.chats.create, { title: "A" });

    await expect(
      t.mutation(api.messages.create, {
        chatId,
        role: "user",
        content: "hi",
      })
    ).rejects.toThrow(/Not authenticated/);
  });

  test("rejects writing into someone else's chat with Unauthorized", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const bob = await bootstrap(t, "clerk_bob", "bob@example.com");
    const aliceChat = await alice.mutation(api.chats.create, { title: "A" });

    await expect(
      bob.mutation(api.messages.create, {
        chatId: aliceChat,
        role: "user",
        content: "intrusion",
      })
    ).rejects.toThrow(/Unauthorized/);
  });

  test("rejects content longer than 10000 characters", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const chatId = await alice.mutation(api.chats.create, { title: "A" });

    await expect(
      alice.mutation(api.messages.create, {
        chatId,
        role: "user",
        content: "x".repeat(10001),
      })
    ).rejects.toThrow(/Content too long/);
  });

  test("inserts the message and bumps the chat's updatedAt", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const chatId = await alice.mutation(api.chats.create, { title: "A" });
    const before = await t.run(async (ctx) => ctx.db.get(chatId));
    expect(before).not.toBeNull();
    const beforeTs = before!.updatedAt;

    await new Promise((r) => setTimeout(r, 5));

    const messageId = await alice.mutation(api.messages.create, {
      chatId,
      role: "user",
      content: "hello",
    });
    expect(messageId).toBeDefined();

    const stored = await t.run(async (ctx) => ctx.db.get(messageId));
    expect(stored?.content).toBe("hello");
    expect(stored?.role).toBe("user");

    const after = await t.run(async (ctx) => ctx.db.get(chatId));
    expect(after!.updatedAt).toBeGreaterThanOrEqual(beforeTs);
  });
});

describe("messages.updateContent", () => {
  test("throws when unauthenticated", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const chatId = await alice.mutation(api.chats.create, { title: "A" });
    const msgId = await alice.mutation(api.messages.create, {
      chatId,
      role: "assistant",
      content: "hi",
    });
    await expect(
      t.mutation(api.messages.updateContent, { id: msgId, content: "x" })
    ).rejects.toThrow(/Not authenticated/);
  });

  test("rejects updating a message in someone else's chat", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const bob = await bootstrap(t, "clerk_bob", "bob@example.com");
    const aliceChat = await alice.mutation(api.chats.create, { title: "A" });
    const msgId = await alice.mutation(api.messages.create, {
      chatId: aliceChat,
      role: "assistant",
      content: "hi",
    });
    await expect(
      bob.mutation(api.messages.updateContent, { id: msgId, content: "hax" })
    ).rejects.toThrow(/Unauthorized/);
  });

  test("rejects content longer than 10000 characters", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const chatId = await alice.mutation(api.chats.create, { title: "A" });
    const msgId = await alice.mutation(api.messages.create, {
      chatId,
      role: "assistant",
      content: "hi",
    });
    await expect(
      alice.mutation(api.messages.updateContent, {
        id: msgId,
        content: "x".repeat(10001),
      })
    ).rejects.toThrow(/Content too long/);
  });

  test("updates content for the owning user", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const chatId = await alice.mutation(api.chats.create, { title: "A" });
    const msgId = await alice.mutation(api.messages.create, {
      chatId,
      role: "assistant",
      content: "old",
    });
    await alice.mutation(api.messages.updateContent, {
      id: msgId,
      content: "new",
    });
    const stored = await t.run(async (ctx) => ctx.db.get(msgId));
    expect(stored?.content).toBe("new");
  });
});

describe("messages.getByChatId", () => {
  test("returns [] when reading someone else's chat", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const bob = await bootstrap(t, "clerk_bob", "bob@example.com");
    const aliceChat = await alice.mutation(api.chats.create, { title: "A" });
    await alice.mutation(api.messages.create, {
      chatId: aliceChat,
      role: "user",
      content: "secret",
    });

    const list = await bob.query(api.messages.getByChatId, {
      chatId: aliceChat,
    });
    expect(list).toEqual([]);
  });

  test("returns owner's messages in ascending createdAt order", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const chatId = await alice.mutation(api.chats.create, { title: "A" });

    await alice.mutation(api.messages.create, {
      chatId,
      role: "user",
      content: "first",
    });
    await new Promise((r) => setTimeout(r, 3));
    await alice.mutation(api.messages.create, {
      chatId,
      role: "assistant",
      content: "second",
    });
    await new Promise((r) => setTimeout(r, 3));
    await alice.mutation(api.messages.create, {
      chatId,
      role: "user",
      content: "third",
    });

    const list = await alice.query(api.messages.getByChatId, { chatId });
    expect(list.map((m) => m.content)).toEqual(["first", "second", "third"]);
    for (let i = 1; i < list.length; i += 1) {
      expect(list[i].createdAt).toBeGreaterThanOrEqual(list[i - 1].createdAt);
    }
  });
});

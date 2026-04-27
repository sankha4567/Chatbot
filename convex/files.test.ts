// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

type ConvexT = ReturnType<typeof convexTest>;

async function bootstrap(t: ConvexT, subject: string, email: string) {
  const u = t.withIdentity({ subject, email });
  await u.mutation(api.users.getOrCreate, {});
  return u;
}

describe("files.generateUploadUrl", () => {
  test("throws when unauthenticated", async () => {
    const t = convexTest(schema);
    await expect(
      t.mutation(api.files.generateUploadUrl, {})
    ).rejects.toThrow(/Not authenticated/);
  });
});

describe("files.recordUpload", () => {
  test("throws when unauthenticated", async () => {
    const t = convexTest(schema);
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["hello"]))
    );
    await expect(
      t.mutation(api.files.recordUpload, { storageId })
    ).rejects.toThrow(/Not authenticated/);
  });

  test("rejects re-recording a storageId already owned by another user", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const bob = await bootstrap(t, "clerk_bob", "bob@example.com");

    const storageId: Id<"_storage"> = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["x"]))
    );
    await alice.mutation(api.files.recordUpload, {
      storageId,
      contentType: "text/plain",
      fileName: "x.txt",
      size: 1,
    });

    await expect(
      bob.mutation(api.files.recordUpload, { storageId })
    ).rejects.toThrow(/Unauthorized/);
  });

  test("inserts a files row tied to the caller's user with the given metadata", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const storageId: Id<"_storage"> = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["abc"]))
    );

    await alice.mutation(api.files.recordUpload, {
      storageId,
      contentType: "text/plain",
      fileName: "file.txt",
      size: 3,
    });

    const aliceUser = await t.run(async (ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", "clerk_alice"))
        .first()
    );
    const fileRow = await t.run(async (ctx) =>
      ctx.db
        .query("files")
        .withIndex("by_storage_id", (q) => q.eq("storageId", storageId))
        .first()
    );
    expect(fileRow).not.toBeNull();
    expect(fileRow?.userId).toBe(aliceUser?._id);
    expect(fileRow?.contentType).toBe("text/plain");
    expect(fileRow?.fileName).toBe("file.txt");
    expect(fileRow?.size).toBe(3);
  });
});

describe("files.getUrl", () => {
  test("throws when unauthenticated", async () => {
    const t = convexTest(schema);
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["x"]))
    );
    await expect(
      t.mutation(api.files.getUrl, { storageId })
    ).rejects.toThrow(/Not authenticated/);
  });

  test("throws Unauthorized for a storageId not in the files table", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const storageId: Id<"_storage"> = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["x"]))
    );
    // Note: storageId exists in storage but no files row → must reject.
    await expect(
      alice.mutation(api.files.getUrl, { storageId })
    ).rejects.toThrow(/Unauthorized/);
  });

  test("throws Unauthorized when asking for someone else's file", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const bob = await bootstrap(t, "clerk_bob", "bob@example.com");
    const storageId: Id<"_storage"> = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["x"]))
    );
    await alice.mutation(api.files.recordUpload, { storageId });

    await expect(
      bob.mutation(api.files.getUrl, { storageId })
    ).rejects.toThrow(/Unauthorized/);
  });

  test("returns a URL string for the file's owner", async () => {
    const t = convexTest(schema);
    const alice = await bootstrap(t, "clerk_alice", "alice@example.com");
    const storageId: Id<"_storage"> = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["x"]))
    );
    await alice.mutation(api.files.recordUpload, { storageId });
    const url = await alice.mutation(api.files.getUrl, { storageId });
    expect(typeof url).toBe("string");
    expect((url ?? "").length).toBeGreaterThan(0);
  });
});

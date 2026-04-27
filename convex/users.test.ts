// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

describe("users.getOrCreate", () => {
  test("throws when called without an identity", async () => {
    const t = convexTest(schema);
    await expect(t.mutation(api.users.getOrCreate, {})).rejects.toThrow(
      /Not authenticated/
    );
  });

  test("creates a new users row whose clerkId matches identity.subject", async () => {
    const t = convexTest(schema);
    const asAlice = t.withIdentity({
      subject: "clerk_alice",
      email: "alice@example.com",
      name: "Alice",
    });

    const id = await asAlice.mutation(api.users.getOrCreate, {});
    expect(id).toBeDefined();

    const row = await t.run(async (ctx) => ctx.db.get(id));
    expect(row).not.toBeNull();
    expect(row?.clerkId).toBe("clerk_alice");
    expect(row?.email).toBe("alice@example.com");
    expect(row?.name).toBe("Alice");
  });

  test("is idempotent: calling twice returns the same Id and inserts only one row", async () => {
    const t = convexTest(schema);
    const asAlice = t.withIdentity({
      subject: "clerk_alice",
      email: "alice@example.com",
    });

    const first = await asAlice.mutation(api.users.getOrCreate, {});
    const second = await asAlice.mutation(api.users.getOrCreate, {});

    expect(second).toBe(first);

    const all = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(all).toHaveLength(1);
  });
});

describe("users.getByClerkId", () => {
  test("returns null when caller has no identity", async () => {
    const t = convexTest(schema);
    const result = await t.query(api.users.getByClerkId, {
      clerkId: "clerk_alice",
    });
    expect(result).toBeNull();
  });

  test("returns null when caller asks for someone else's clerkId", async () => {
    const t = convexTest(schema);
    const asAlice = t.withIdentity({
      subject: "clerk_alice",
      email: "alice@example.com",
    });
    await asAlice.mutation(api.users.getOrCreate, {});

    const asBob = t.withIdentity({
      subject: "clerk_bob",
      email: "bob@example.com",
    });
    const peeked = await asBob.query(api.users.getByClerkId, {
      clerkId: "clerk_alice",
    });
    expect(peeked).toBeNull();
  });

  test("returns the user row when caller asks for their own clerkId", async () => {
    const t = convexTest(schema);
    const asAlice = t.withIdentity({
      subject: "clerk_alice",
      email: "alice@example.com",
    });
    await asAlice.mutation(api.users.getOrCreate, {});

    const own = await asAlice.query(api.users.getByClerkId, {
      clerkId: "clerk_alice",
    });
    expect(own).not.toBeNull();
    expect(own?.clerkId).toBe("clerk_alice");
    expect(own?.email).toBe("alice@example.com");
  });
});

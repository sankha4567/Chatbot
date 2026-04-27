import { describe, expect, test } from "vitest";
import { cn } from "./utils";

describe("cn()", () => {
  test("returns empty string for no inputs", () => {
    expect(cn()).toBe("");
  });

  test("returns empty string when only falsy values are given", () => {
    expect(cn(false, undefined, null, "")).toBe("");
  });

  test("passes a single class through unchanged", () => {
    expect(cn("text-sm")).toBe("text-sm");
  });

  test("joins multiple classes with single spaces", () => {
    expect(cn("flex", "items-center", "gap-2")).toBe("flex items-center gap-2");
  });

  test("dedupes conflicting tailwind classes via twMerge (later wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  test("dedupes conflicting bg utilities via twMerge", () => {
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
  });

  test("drops conditional false/undefined and keeps truthy classes", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });

  test("flattens arrays of class values", () => {
    expect(cn(["flex", "gap-2"], "p-2")).toBe("flex gap-2 p-2");
  });
});

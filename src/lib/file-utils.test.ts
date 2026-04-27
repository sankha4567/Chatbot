import { afterEach, describe, expect, test, vi } from "vitest";
import { getFileUrlsFromIds, uploadFiles } from "./file-utils";
import type { Id } from "../../convex/_generated/dataModel";

afterEach(() => {
  vi.restoreAllMocks();
});

function storageId(s: string): Id<"_storage"> {
  return s as Id<"_storage">;
}

describe("getFileUrlsFromIds()", () => {
  test("returns urls in input order, calling getUrl per id", async () => {
    const getUrl = vi
      .fn<(args: { storageId: Id<"_storage"> }) => Promise<string | null>>()
      .mockImplementation(async ({ storageId: id }) => `https://files/${id}`);

    const ids = [storageId("a"), storageId("b"), storageId("c")];
    const urls = await getFileUrlsFromIds(ids, getUrl);

    expect(urls).toEqual([
      "https://files/a",
      "https://files/b",
      "https://files/c",
    ]);
    expect(getUrl).toHaveBeenCalledTimes(3);
    expect(getUrl).toHaveBeenNthCalledWith(1, { storageId: storageId("a") });
    expect(getUrl).toHaveBeenNthCalledWith(3, { storageId: storageId("c") });
  });

  test("skips entries where getUrl resolves to null", async () => {
    const getUrl = vi
      .fn<(args: { storageId: Id<"_storage"> }) => Promise<string | null>>()
      .mockResolvedValueOnce("https://files/a")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("https://files/c");

    const urls = await getFileUrlsFromIds(
      [storageId("a"), storageId("b"), storageId("c")],
      getUrl
    );

    expect(urls).toEqual(["https://files/a", "https://files/c"]);
  });
});

interface UploadResp {
  ok: boolean;
  json: () => Promise<{ storageId: string }>;
}

function makeUploadResponse(id: string, ok = true): UploadResp {
  return {
    ok,
    json: async () => ({ storageId: id }),
  };
}

describe("uploadFiles()", () => {
  test("happy path: returns one entry and calls the four collaborators with expected args", async () => {
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    const generateUploadUrl = vi
      .fn<() => Promise<string>>()
      .mockResolvedValue("https://upload/1");
    const recordUpload = vi
      .fn<
        (args: {
          storageId: Id<"_storage">;
          contentType?: string;
          fileName?: string;
          size?: number;
        }) => Promise<null>
      >()
      .mockResolvedValue(null);
    const getUrl = vi
      .fn<(args: { storageId: Id<"_storage"> }) => Promise<string | null>>()
      .mockResolvedValue("https://files/sid_1");
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeUploadResponse("sid_1") as unknown as Response);

    const result = await uploadFiles(
      [file],
      generateUploadUrl,
      recordUpload,
      getUrl
    );

    expect(result.fileIds).toEqual([storageId("sid_1")]);
    expect(result.fileTypes).toEqual(["text/plain"]);
    expect(result.fileNames).toEqual(["hello.txt"]);
    expect(result.fileUrls).toEqual(["https://files/sid_1"]);

    expect(generateUploadUrl).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://upload/1");
    const initObj = init as RequestInit;
    expect(initObj.method).toBe("POST");
    expect(
      (initObj.headers as Record<string, string>)["Content-Type"]
    ).toBe("text/plain");

    expect(recordUpload).toHaveBeenCalledTimes(1);
    expect(recordUpload).toHaveBeenCalledWith({
      storageId: "sid_1",
      contentType: "text/plain",
      fileName: "hello.txt",
      size: file.size,
    });

    expect(getUrl).toHaveBeenCalledWith({ storageId: "sid_1" });
  });

  test("continues with other files when one upload errors mid-batch", async () => {
    const files = [
      new File(["a"], "a.txt", { type: "text/plain" }),
      new File(["b"], "b.txt", { type: "text/plain" }),
      new File(["c"], "c.txt", { type: "text/plain" }),
    ];
    const generateUploadUrl = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("https://upload/a")
      .mockResolvedValueOnce("https://upload/b")
      .mockResolvedValueOnce("https://upload/c");
    const recordUpload = vi
      .fn<
        (args: {
          storageId: Id<"_storage">;
          contentType?: string;
          fileName?: string;
          size?: number;
        }) => Promise<null>
      >()
      .mockResolvedValue(null);
    const getUrl = vi
      .fn<(args: { storageId: Id<"_storage"> }) => Promise<string | null>>()
      .mockImplementation(async ({ storageId: id }) => `https://files/${id}`);

    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://upload/b") {
        throw new Error("network blip");
      }
      const sid = url.endsWith("/a") ? "sid_a" : "sid_c";
      return makeUploadResponse(sid) as unknown as Response;
    });

    const result = await uploadFiles(
      files,
      generateUploadUrl,
      recordUpload,
      getUrl
    );

    expect(result.fileIds).toEqual([storageId("sid_a"), storageId("sid_c")]);
    expect(result.fileNames).toEqual(["a.txt", "c.txt"]);
    expect(result.fileUrls).toEqual(["https://files/sid_a", "https://files/sid_c"]);
    expect(recordUpload).toHaveBeenCalledTimes(2);
  });

  test("skips a file whose POST returns !ok", async () => {
    const files = [
      new File(["a"], "a.txt", { type: "text/plain" }),
      new File(["b"], "b.txt", { type: "text/plain" }),
    ];
    const generateUploadUrl = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("https://upload/a")
      .mockResolvedValueOnce("https://upload/b");
    const recordUpload = vi
      .fn<
        (args: {
          storageId: Id<"_storage">;
          contentType?: string;
          fileName?: string;
          size?: number;
        }) => Promise<null>
      >()
      .mockResolvedValue(null);
    const getUrl = vi
      .fn<(args: { storageId: Id<"_storage"> }) => Promise<string | null>>()
      .mockResolvedValue("https://files/sid_a");

    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://upload/a") {
        return makeUploadResponse("sid_a") as unknown as Response;
      }
      return makeUploadResponse("sid_b", false) as unknown as Response;
    });

    const result = await uploadFiles(
      files,
      generateUploadUrl,
      recordUpload,
      getUrl
    );

    expect(result.fileIds).toEqual([storageId("sid_a")]);
    expect(result.fileNames).toEqual(["a.txt"]);
    expect(recordUpload).toHaveBeenCalledTimes(1);
  });

  test("does not push to fileUrls when getUrl resolves to null", async () => {
    const file = new File(["x"], "x.png", { type: "image/png" });
    const generateUploadUrl = vi
      .fn<() => Promise<string>>()
      .mockResolvedValue("https://upload/x");
    const recordUpload = vi
      .fn<
        (args: {
          storageId: Id<"_storage">;
          contentType?: string;
          fileName?: string;
          size?: number;
        }) => Promise<null>
      >()
      .mockResolvedValue(null);
    const getUrl = vi
      .fn<(args: { storageId: Id<"_storage"> }) => Promise<string | null>>()
      .mockResolvedValue(null);
    vi.spyOn(global, "fetch").mockResolvedValue(
      makeUploadResponse("sid_x") as unknown as Response
    );

    const result = await uploadFiles(
      [file],
      generateUploadUrl,
      recordUpload,
      getUrl
    );

    // FileId, type, name still recorded, but URL skipped.
    expect(result.fileIds).toEqual([storageId("sid_x")]);
    expect(result.fileTypes).toEqual(["image/png"]);
    expect(result.fileNames).toEqual(["x.png"]);
    expect(result.fileUrls).toEqual([]);
  });
});

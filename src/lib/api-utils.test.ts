import { afterEach, describe, expect, test, vi } from "vitest";
import { prepareMessageHistory, streamApiResponse } from "./api-utils";
import type { ChatMessage, MessageForAPI } from "@/types/chat";
import type { Id } from "../../convex/_generated/dataModel";

afterEach(() => {
  vi.restoreAllMocks();
});

function makeChatMessage(
  overrides: Partial<ChatMessage> & Pick<ChatMessage, "role" | "content">
): ChatMessage {
  return {
    _id: "msg_1" as Id<"messages">,
    chatId: "chat_1" as Id<"chats">,
    createdAt: 0,
    ...overrides,
  };
}

describe("prepareMessageHistory()", () => {
  test("maps ChatMessage[] to MessageForAPI[] keeping only role/content/fileUrls/fileTypes", () => {
    const fileIds = ["file_1" as Id<"_storage">];
    const messages: ChatMessage[] = [
      makeChatMessage({
        _id: "msg_a" as Id<"messages">,
        role: "user",
        content: "hello",
        fileIds,
        fileNames: ["a.png"],
        fileUrls: ["https://example.com/a.png"],
        fileTypes: ["image/png"],
        createdAt: 1234,
      }),
    ];

    const result = prepareMessageHistory(messages);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: "user",
      content: "hello",
      fileUrls: ["https://example.com/a.png"],
      fileTypes: ["image/png"],
    });
    // Confirm internal Convex fields were stripped.
    expect(result[0]).not.toHaveProperty("_id");
    expect(result[0]).not.toHaveProperty("chatId");
    expect(result[0]).not.toHaveProperty("fileIds");
    expect(result[0]).not.toHaveProperty("fileNames");
    expect(result[0]).not.toHaveProperty("createdAt");
  });

  test("appends currentMessage to the end when provided", () => {
    const messages: ChatMessage[] = [
      makeChatMessage({ role: "user", content: "first" }),
      makeChatMessage({ role: "assistant", content: "second" }),
    ];
    const current: MessageForAPI = { role: "user", content: "third" };

    const result = prepareMessageHistory(messages, current);

    expect(result).toHaveLength(3);
    expect(result[2]).toEqual({ role: "user", content: "third" });
  });

  test("returns just the mapped messages when no currentMessage is provided", () => {
    const messages: ChatMessage[] = [
      makeChatMessage({ role: "user", content: "only" }),
    ];

    const result = prepareMessageHistory(messages);

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("only");
  });
});

function makeStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    statusText: "OK",
    headers: { "Content-Type": "text/plain" },
  });
}

describe("streamApiResponse()", () => {
  test("emits cumulative content via onChunk and returns the full text", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      makeStreamResponse(["Hello, ", "world!"])
    );
    const seen: string[] = [];

    const result = await streamApiResponse(
      [{ role: "user", content: "hi" }],
      (c) => seen.push(c)
    );

    expect(seen).toEqual(["Hello, ", "Hello, world!"]);
    expect(result).toBe("Hello, world!");
  });

  test("throws including the response statusText when response.ok is false", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("nope", { status: 500, statusText: "Internal Server Error" })
    );

    await expect(
      streamApiResponse([{ role: "user", content: "hi" }], () => {})
    ).rejects.toThrow(/Internal Server Error/);
  });

  test("returns empty string when fetch rejects with an aborted signal", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("aborted", "AbortError"));
    vi.spyOn(global, "fetch").mockRejectedValue(
      new DOMException("aborted", "AbortError")
    );

    const result = await streamApiResponse(
      [{ role: "user", content: "hi" }],
      () => {},
      controller.signal
    );

    expect(result).toBe("");
  });

  test("rethrows non-abort fetch errors", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network down"));

    await expect(
      streamApiResponse([{ role: "user", content: "hi" }], () => {})
    ).rejects.toThrow(/network down/);
  });

  test("returns partial content if signal is aborted mid-stream", async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();
    let readCount = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        readCount += 1;
        if (readCount === 1) {
          ctrl.enqueue(encoder.encode("Partial"));
        } else {
          // Simulate abort happening between reads.
          controller.abort(new DOMException("aborted", "AbortError"));
          ctrl.error(new DOMException("aborted", "AbortError"));
        }
      },
    });
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(stream, { status: 200, statusText: "OK" })
    );

    const seen: string[] = [];
    const result = await streamApiResponse(
      [{ role: "user", content: "hi" }],
      (c) => seen.push(c),
      controller.signal
    );

    expect(seen).toEqual(["Partial"]);
    expect(result).toBe("Partial");
  });

  test("posts to /api/chat with JSON body containing messages", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeStreamResponse(["x"]));

    await streamApiResponse([{ role: "user", content: "hi" }], () => {});

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/chat");
    const initObj = init as RequestInit;
    expect(initObj.method).toBe("POST");
    const body = JSON.parse(initObj.body as string) as {
      messages: MessageForAPI[];
    };
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });
});

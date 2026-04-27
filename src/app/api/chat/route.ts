import { GoogleGenerativeAI, GenerateContentStreamResult } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { MessageForAPI } from "@/types/chat";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Try models in priority order. Each model has its own per-day free-tier
// counter, so when one returns 429 we transparently retry with the next.
const MODEL_FALLBACK_ORDER = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-1.5-flash",
];

const SYSTEM_INSTRUCTION =
  "You are GemifyChat, a helpful AI assistant. Be concise, friendly, and helpful. Format responses with markdown when appropriate. For code, always specify the language.";

function getAllowedHost(): string | null {
  // Convex storage download URLs returned by ctx.storage.getUrl() live on the
  // .convex.cloud (API) domain, not .convex.site (HTTP actions).
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

type FilePayload =
  | { kind: "text"; text: string }
  | { kind: "inline"; mimeType: string; data: string };

function isTextMimeType(mimeType: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml"
  );
}

function isSupportedMime(mimeType: string): boolean {
  return (
    isTextMimeType(mimeType) ||
    mimeType === "application/pdf" ||
    mimeType.startsWith("image/") ||
    mimeType.startsWith("audio/") ||
    mimeType.startsWith("video/")
  );
}

function findUnsupportedMime(messages: MessageForAPI[]): string | null {
  for (const msg of messages) {
    if (!msg.fileTypes) continue;
    for (const mime of msg.fileTypes) {
      if (mime && !isSupportedMime(mime)) return mime;
    }
  }
  return null;
}

// Restrict outbound fetches to the configured Convex site host. Without this,
// a crafted message could coerce the server into fetching arbitrary URLs
// (SSRF) — internal metadata endpoints, intranet services, etc.
async function fetchFilePayload(url: string): Promise<FilePayload | null> {
  try {
    const allowedHost = getAllowedHost();
    if (!allowedHost) return null;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.host !== allowedHost) return null;

    const response = await fetch(url);
    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > 10_000_000) return null;

    const contentType =
      response.headers.get("content-type") || "application/octet-stream";

    if (!isSupportedMime(contentType)) return null;

    if (isTextMimeType(contentType)) {
      return { kind: "text", text: Buffer.from(arrayBuffer).toString("utf-8") };
    }

    return {
      kind: "inline",
      mimeType: contentType,
      data: Buffer.from(arrayBuffer).toString("base64"),
    };
  } catch (error) {
    console.error("Error fetching file:", error);
    return null;
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isMessageForAPI(x: unknown): x is MessageForAPI {
  if (typeof x !== "object" || x === null) return false;
  const obj = x as Record<string, unknown>;
  if (obj.role !== "user" && obj.role !== "assistant") return false;
  if (typeof obj.content !== "string") return false;
  if (obj.fileUrls !== undefined && !isStringArray(obj.fileUrls)) return false;
  if (obj.fileTypes !== undefined && !isStringArray(obj.fileTypes)) return false;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const messages: unknown = (body as { messages?: unknown })?.messages;

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Gemini API key not configured" },
        { status: 500 }
      );
    }

    if (!Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Invalid request body: messages must be an array" },
        { status: 400 }
      );
    }

    if (messages.length === 0) {
      return NextResponse.json(
        { error: "Invalid request body: messages must not be empty" },
        { status: 400 }
      );
    }

    if (messages.length > 200) {
      return NextResponse.json(
        { error: "Too many messages" },
        { status: 400 }
      );
    }

    if (!messages.every(isMessageForAPI)) {
      return NextResponse.json(
        { error: "Invalid message shape" },
        { status: 400 }
      );
    }

    const typedMessages: MessageForAPI[] = messages;
    const recent = typedMessages.slice(-30);

    const unsupported = findUnsupportedMime(recent);
    if (unsupported) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${unsupported}. Gemini accepts PDF, images, audio, video, and text. DOCX/XLSX/PPTX are not supported — convert to PDF or paste the text.`,
        },
        { status: 400 }
      );
    }

    const history = await Promise.all(
      recent.slice(0, -1).map(async (msg: MessageForAPI) => {
        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

        if (msg.content) {
          parts.push({ text: msg.content });
        }

        if (msg.fileUrls && msg.fileTypes) {
          for (let i = 0; i < msg.fileUrls.length; i++) {
            const fileData = await fetchFilePayload(msg.fileUrls[i]);
            if (!fileData) continue;
            if (fileData.kind === "text") {
              parts.push({ text: fileData.text });
            } else {
              parts.push({
                inlineData: {
                  mimeType: msg.fileTypes[i] || fileData.mimeType,
                  data: fileData.data,
                },
              });
            }
          }
        }

        return {
          role: msg.role === "assistant" ? "model" : "user",
          parts: parts.length > 0 ? parts : [{ text: msg.content || "" }],
        };
      })
    );

    const lastMessage = recent[recent.length - 1];
    const lastParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    if (lastMessage.content) {
      lastParts.push({ text: lastMessage.content });
    }

    if (lastMessage.fileUrls && lastMessage.fileTypes) {
      for (let i = 0; i < lastMessage.fileUrls.length; i++) {
        const fileData = await fetchFilePayload(lastMessage.fileUrls[i]);
        if (!fileData) continue;
        if (fileData.kind === "text") {
          lastParts.push({ text: fileData.text });
        } else {
          lastParts.push({
            inlineData: {
              mimeType: lastMessage.fileTypes[i] || fileData.mimeType,
              data: fileData.data,
            },
          });
        }
      }
    }

    const finalParts =
      lastParts.length > 0 ? lastParts : [{ text: lastMessage.content || "" }];

    let result: GenerateContentStreamResult | null = null;
    let modelUsed: string | null = null;
    let lastQuotaError: unknown = null;

    for (const modelName of MODEL_FALLBACK_ORDER) {
      try {
        const m = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: SYSTEM_INSTRUCTION,
        });
        const chat = m.startChat({ history });
        result = await chat.sendMessageStream(finalParts);
        modelUsed = modelName;
        break;
      } catch (error) {
        const status = (error as { status?: number })?.status;
        if (status === 429 || status === 503) {
          const reason = status === 429 ? "quota exhausted" : "upstream overloaded (503)";
          console.warn(
            `${modelName}: ${reason}, falling back to next model`
          );
          lastQuotaError = error;
          continue;
        }
        throw error;
      }
    }

    if (!result || !modelUsed) {
      console.error("All models unavailable:", lastQuotaError);
      const lastStatus = (lastQuotaError as { status?: number })?.status;
      const message =
        lastStatus === 503
          ? "All Gemini models are temporarily overloaded. Please try again in a moment."
          : "All Gemini free-tier daily quotas exhausted on your project. Reset at midnight Pacific.";
      return NextResponse.json(
        { error: message },
        { status: lastStatus === 503 ? 503 : 429 }
      );
    }

    console.log(`Gemini model used: ${modelUsed}`);

    const encoder = new TextEncoder();
    const streamedResult = result;
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamedResult.stream) {
            const text = chunk.text();
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Gemini-Model": modelUsed,
      },
    });
  } catch (error) {
    console.error("Gemini API error:", error);
    const status = (error as { status?: number })?.status;
    if (status === 429) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment and try again." },
        { status: 429 }
      );
    }
    if (status === 400) {
      return NextResponse.json(
        { error: "Bad request to Gemini. Check file types and content." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { MessageForAPI } from "@/types/chat";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Helper function to fetch file from URL and convert to base64
async function fetchFileAsBase64(
  url: string
): Promise<{ mimeType: string; data: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const contentType =
      response.headers.get("content-type") || "application/octet-stream";

    return { mimeType: contentType, data: base64 };
  } catch (error) {
    console.error("Error fetching file:", error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Gemini API key not configured" },
        { status: 500 }
      );
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      systemInstruction:
        "You are GemifyChat, a helpful AI assistant. Be concise, friendly, and helpful. Format responses with markdown when appropriate. For code, always specify the language.",
    });

    // Convert messages to Gemini format with file support
    const typedMessages = messages as MessageForAPI[];
    const history = await Promise.all(
      typedMessages.slice(0, -1).map(async (msg: MessageForAPI) => {
        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

        // Add text if present
        if (msg.content) {
          parts.push({ text: msg.content });
        }

        // Add file parts if present
        if (msg.fileUrls && msg.fileTypes) {
          for (let i = 0; i < msg.fileUrls.length; i++) {
            const fileData = await fetchFileAsBase64(msg.fileUrls[i]);
            if (fileData) {
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

    const chat = model.startChat({ history });

    // Get the last message
    const lastMessage = typedMessages[typedMessages.length - 1];
    const lastParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    // Add text
    if (lastMessage.content) {
      lastParts.push({ text: lastMessage.content });
    }

    // Add files
    if (lastMessage.fileUrls && lastMessage.fileTypes) {
      for (let i = 0; i < lastMessage.fileUrls.length; i++) {
        const fileData = await fetchFileAsBase64(lastMessage.fileUrls[i]);
        if (fileData) {
          lastParts.push({
            inlineData: {
              mimeType: lastMessage.fileTypes[i] || fileData.mimeType,
              data: fileData.data,
            },
          });
        }
      }
    }

    // Create streaming response
    const result = await chat.sendMessageStream(
      lastParts.length > 0 ? lastParts : [{ text: lastMessage.content || "" }]
    );

    // Create a readable stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
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
      },
    });
  } catch (error) {
    console.error("Gemini API error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}

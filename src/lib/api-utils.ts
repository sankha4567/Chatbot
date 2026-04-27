import { MessageForAPI, ChatMessage } from "@/types/chat";

export function prepareMessageHistory(
  messages: ChatMessage[],
  currentMessage?: MessageForAPI
): MessageForAPI[] {
  const history: MessageForAPI[] = messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
    fileUrls: msg.fileUrls,
    fileTypes: msg.fileTypes,
  }));

  if (currentMessage) {
    history.push(currentMessage);
  }

  return history;
}

export async function streamApiResponse(
  messages: MessageForAPI[],
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<string> {
  let response: Response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) return "";
    throw error;
  }

  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable");
  }

  const decoder = new TextDecoder();
  let fullContent = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      fullContent += chunk;
      onChunk(fullContent);
    }
  } catch (error) {
    if (signal?.aborted) return fullContent;
    throw error;
  }

  return fullContent;
}

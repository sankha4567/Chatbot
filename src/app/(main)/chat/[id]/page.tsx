"use client";

import { useState, useEffect, useRef, use } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { ChatInput } from "@/components/chat-input";
import { ChatMessage } from "@/components/chat-message";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { uploadFiles, getFileUrlsFromIds } from "@/lib/file-utils";
import { streamApiResponse, prepareMessageHistory } from "@/lib/api-utils";
import type { ChatMessage as ChatMessageType } from "@/types/chat";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ChatPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const chatId = id as Id<"chats">;

  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasProcessedInitialMessage = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  const chat = useQuery(api.chats.getById, { id: chatId });
  const messages = useQuery(api.messages.getByChatId, { chatId });

  const createMessage = useMutation(api.messages.create);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const recordUpload = useMutation(api.files.recordUpload);
  const getUrl = useMutation(api.files.getUrl);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  // Redirect if chat doesn't exist
  useEffect(() => {
    if (chat === null) {
      router.push("/");
    }
  }, [chat, router]);

  // Reset auto-trigger flag when chatId changes
  useEffect(() => {
    hasProcessedInitialMessage.current = false;
  }, [chatId]);

  const handleAutoSubmit = async (userMessage: ChatMessageType) => {
    try {
      setIsLoading(true);
      setStreamingContent("");

      // Get file URLs if message has files
      let fileUrls: string[] = [];
      if (userMessage.fileIds && userMessage.fileIds.length > 0) {
        fileUrls = await getFileUrlsFromIds(userMessage.fileIds, getUrl);
      } else if (userMessage.fileUrls && userMessage.fileUrls.length > 0) {
        fileUrls = userMessage.fileUrls;
      }

      // Prepare message history
      const allMessages = messages || [];
      const history = prepareMessageHistory(
        allMessages.slice(0, -1),
        {
          role: "user",
          content: userMessage.content,
          fileUrls: fileUrls.length > 0 ? fileUrls : undefined,
          fileTypes: userMessage.fileTypes,
        }
      );

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const fullContent = await streamApiResponse(
        history,
        (chunk) => setStreamingContent(chunk),
        controller.signal
      );

      if (fullContent.trim()) {
        await createMessage({
          chatId,
          role: "assistant",
          content: fullContent,
        });
      }

      setStreamingContent("");
    } catch (error) {
      console.error("Error processing message:", error);
      hasProcessedInitialMessage.current = false;
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  // Auto-trigger API call for first message if it's unanswered
  useEffect(() => {
    // Skip if:
    // - Messages not loaded yet
    // - Already processed
    // - Currently loading/streaming
    // - No messages
    if (
      messages === undefined ||
      hasProcessedInitialMessage.current ||
      isLoading ||
      streamingContent ||
      !messages ||
      messages.length === 0
    ) {
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === "user") {
      hasProcessedInitialMessage.current = true;
      queueMicrotask(() => handleAutoSubmit(lastMessage));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isLoading, streamingContent]);

  const handleSubmit = async (message: string, files: File[]) => {
    if (!message.trim() && files.length === 0) return;

    try {
      setIsLoading(true);
      setStreamingContent("");

      // Upload files using utility
      const { fileIds, fileTypes, fileNames, fileUrls } = await uploadFiles(
        files,
        generateUploadUrl,
        recordUpload,
        getUrl
      );

      // Create user message
      await createMessage({
        chatId,
        role: "user",
        content: message,
        fileIds: fileIds.length > 0 ? fileIds : undefined,
        fileTypes: fileTypes.length > 0 ? fileTypes : undefined,
        fileNames: fileNames.length > 0 ? fileNames : undefined,
      });

      // Prepare message history
      const allMessages = messages || [];
      const history = prepareMessageHistory(allMessages, {
        role: "user",
        content: message,
        fileUrls: fileUrls.length > 0 ? fileUrls : undefined,
        fileTypes: fileTypes.length > 0 ? fileTypes : undefined,
      });

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const fullContent = await streamApiResponse(
        history,
        (chunk) => setStreamingContent(chunk),
        controller.signal
      );

      if (fullContent.trim()) {
        await createMessage({
          chatId,
          role: "assistant",
          content: fullContent,
        });
      }

      setStreamingContent("");
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  if (chat === undefined || messages === undefined) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (chat === null) {
    return null;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Messages area */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="max-w-3xl mx-auto px-4 pb-4">
          {messages.map((message) => (
            <ChatMessage
              key={message._id}
              role={message.role}
              content={message.content}
              fileUrls={message.fileUrls}
              fileTypes={message.fileTypes}
              fileNames={message.fileNames}
            />
          ))}

          {/* Streaming message */}
          {streamingContent && (
            <ChatMessage
              role="assistant"
              content={streamingContent}
              isStreaming={true}
            />
          )}

          {/* Loading indicator */}
          {isLoading && !streamingContent && (
            <div className="flex gap-4 py-6">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <Loader2 className="h-5 w-5 text-primary-foreground animate-spin" />
              </div>
              <div className="flex items-center">
                <span className="text-muted-foreground">Thinking...</span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="border-t bg-background/95 backdrop-blur p-4">
        <div className="max-w-3xl mx-auto">
          <ChatInput
            onSubmit={handleSubmit}
            onStop={handleStop}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}

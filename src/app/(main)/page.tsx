"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ChatInput } from "@/components/chat-input";
import { Sparkles } from "lucide-react";
import { uploadFiles } from "@/lib/file-utils";

export default function HomePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const createChat = useMutation(api.chats.create);
  const createMessage = useMutation(api.messages.create);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const handleSubmit = async (message: string, files: File[]) => {
    try {
      setIsLoading(true);

      // Upload files using utility
      const { fileIds, fileTypes, fileNames } = await uploadFiles(
        files,
        generateUploadUrl,
        async () => null // Home page doesn't need URLs immediately
      );

      // Generate title (slice to 25 characters as requested)
      const title = message.trim().slice(0, 25) || "New Chat";

      // Create chat
      const chatId = await createChat({ title });

      // Create first message
      await createMessage({
        chatId,
        role: "user",
        content: message,
        fileIds: fileIds.length > 0 ? fileIds : undefined,
        fileTypes: fileTypes.length > 0 ? fileTypes : undefined,
        fileNames: fileNames.length > 0 ? fileNames : undefined,
      });

      // Navigate to chat page
      router.push(`/chat/${chatId}`);
    } catch (error) {
      console.error("Error creating chat:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-3xl space-y-8">
        {/* Welcome section */}
        <div className="text-center space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center mx-auto">
            <Sparkles className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold">Welcome to GemifyChat</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Start a conversation with AI powered by Google Gemini. Ask questions,
            get help with code, analyze images, and more.
          </p>
        </div>

        {/* Suggestions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            "Explain quantum computing in simple terms",
            "Help me write a Python script to process CSV files",
            "What are the best practices for React development?",
            "Create a meal plan for the week",
          ].map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => handleSubmit(suggestion, [])}
              disabled={isLoading}
              className="p-4 rounded-xl border bg-card hover:bg-accent transition-colors text-left text-sm"
            >
              {suggestion}
            </button>
          ))}
        </div>

        {/* Input */}
        <ChatInput onSubmit={handleSubmit} isLoading={isLoading} />
      </div>
    </div>
  );
}

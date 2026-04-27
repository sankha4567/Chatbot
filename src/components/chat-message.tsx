"use client";

import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "@/lib/utils";
import { User, Sparkles, Copy, Check, FileText } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  fileUrls?: string[];
  fileTypes?: string[];
  fileNames?: string[];
  isStreaming?: boolean;
}

// Helper function to detect file type from MIME type or URL
function getFileType(url: string, mimeType?: string): "pdf" | "image" {
  // Prioritize MIME type if available
  if (mimeType) {
    if (mimeType === "application/pdf") return "pdf";
    if (mimeType.startsWith("image/")) return "image";
  }
  // Fallback to URL check
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.endsWith(".pdf") || lowerUrl.includes("application/pdf")) {
    return "pdf";
  }
  return "image";
}

export function ChatMessage({
  role,
  content,
  fileUrls,
  fileTypes,
  fileNames,
  isStreaming,
}: ChatMessageProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const copyToClipboard = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    if (copyTimeoutRef.current !== null) {
      clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div
      className={cn(
        "flex gap-4 py-6",
        role === "user" ? "justify-end" : "justify-start"
      )}
    >
      {role === "assistant" && (
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
      )}

      <div
        className={cn(
          "flex flex-col gap-3 max-w-[85%] md:max-w-[75%]",
          role === "user" && "items-end"
        )}
      >
        {/* File previews */}
        {fileUrls && fileUrls.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {fileUrls.map((url, index) => {
              const mimeType = fileTypes?.[index];
              const fileType = getFileType(url, mimeType);
              if (fileType === "pdf") {
                const fileName = fileNames?.[index] || "PDF file";
                return (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg border bg-muted hover:bg-accent transition-colors"
                  >
                    <div className="h-12 w-12 rounded-lg bg-destructive flex items-center justify-center shrink-0">
                      <FileText className="h-6 w-6 text-destructive-foreground" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium truncate">{fileName}</span>
                      <span className="text-sm text-muted-foreground">PDF</span>
                    </div>
                  </a>
                );
              }
              return (
                <img
                  key={url}
                  src={url}
                  alt={`Uploaded file ${index + 1}`}
                  className="max-h-48 rounded-lg border"
                  onError={(e) => {
                    // Fallback for broken image URLs
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Message content */}
        <div
          className={cn(
            "rounded-2xl px-4 py-3",
            role === "user"
              ? "bg-primary text-primary-foreground"
              : "bg-muted"
          )}
        >
          {role === "user" ? (
            <p className="whitespace-pre-wrap">{content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                components={{
                  code({ node, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const codeString = String(children).replace(/\n$/, "");
                    const isInline = !match && !codeString.includes("\n");

                    if (isInline) {
                      return (
                        <code
                          className="bg-secondary px-1.5 py-0.5 rounded text-sm"
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    }

                    return (
                      <div className="relative group my-4">
                        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => copyToClipboard(codeString)}
                          >
                            {copiedCode === codeString ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <SyntaxHighlighter
                          style={oneDark}
                          language={match?.[1] || "text"}
                          PreTag="div"
                          className="rounded-lg !my-0"
                        >
                          {codeString}
                        </SyntaxHighlighter>
                      </div>
                    );
                  },
                  p({ children }) {
                    return <p className="mb-4 last:mb-0">{children}</p>;
                  },
                  ul({ children }) {
                    return <ul className="mb-4 last:mb-0 list-disc pl-6">{children}</ul>;
                  },
                  ol({ children }) {
                    return <ol className="mb-4 last:mb-0 list-decimal pl-6">{children}</ol>;
                  },
                }}
              >
                {content}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-foreground/50 animate-pulse ml-1" />
              )}
            </div>
          )}
        </div>
      </div>

      {role === "user" && (
        <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <User className="h-5 w-5" />
        </div>
      )}
    </div>
  );
}

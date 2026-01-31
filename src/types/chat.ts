import { Id } from "../../convex/_generated/dataModel";

export interface FileUploadResult {
  fileIds: Id<"_storage">[];
  fileTypes: string[];
  fileNames: string[];
  fileUrls: string[];
}

export interface MessageForAPI {
  role: "user" | "assistant";
  content: string;
  fileUrls?: string[];
  fileTypes?: string[];
}

export interface ChatMessage {
  _id: Id<"messages">;
  chatId: Id<"chats">;
  role: "user" | "assistant";
  content: string;
  fileIds?: Id<"_storage">[];
  fileUrls?: string[];
  fileTypes?: string[];
  fileNames?: string[];
  createdAt: number;
}

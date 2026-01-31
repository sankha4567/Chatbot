import { Id } from "../../convex/_generated/dataModel";
import { FileUploadResult } from "@/types/chat";

export async function uploadFiles(
  files: File[],
  generateUploadUrl: () => Promise<string>,
  getUrl: (args: { storageId: Id<"_storage"> }) => Promise<string | null>
): Promise<FileUploadResult> {
  const fileIds: Id<"_storage">[] = [];
  const fileTypes: string[] = [];
  const fileNames: string[] = [];
  const fileUrls: string[] = [];

  for (const file of files) {
    try {
      // Get upload URL
      const uploadUrl = await generateUploadUrl();
      
      // Upload file
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!response.ok) {
        throw new Error(`Failed to upload file: ${file.name}`);
      }

      const { storageId } = await response.json();
      if (!storageId) {
        throw new Error(`No storageId returned for file: ${file.name}`);
      }

      fileIds.push(storageId as Id<"_storage">);
      fileTypes.push(file.type);
      fileNames.push(file.name);

      // Get file URL
      const url = await getUrl({ storageId: storageId as Id<"_storage"> });
      if (url) fileUrls.push(url);
    } catch (error) {
      console.error(`Error uploading file ${file.name}:`, error);
      // Continue with other files instead of failing completely
    }
  }

  return { fileIds, fileTypes, fileNames, fileUrls };
}

export async function getFileUrlsFromIds(
  fileIds: Id<"_storage">[],
  getUrl: (args: { storageId: Id<"_storage"> }) => Promise<string | null>
): Promise<string[]> {
  const fileUrls: string[] = [];
  
  for (const fileId of fileIds) {
    const url = await getUrl({ storageId: fileId });
    if (url) fileUrls.push(url);
  }
  
  return fileUrls;
}

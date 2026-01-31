"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  MessageSquare,
  Pencil,
  Trash2,
  X,
  PanelLeftClose,
  MoreHorizontal,
} from "lucide-react";
import { useSidebar } from "@/hooks/use-sidebar";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { isCollapsed, collapse } = useSidebar();

  const [searchQuery, setSearchQuery] = useState("");
  const [renameDialog, setRenameDialog] = useState<{
    open: boolean;
    chatId: Id<"chats"> | null;
    title: string;
  }>({ open: false, chatId: null, title: "" });
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    chatId: Id<"chats"> | null;
  }>({ open: false, chatId: null });

  const chats = useQuery(api.chats.list);
  const searchResults = useQuery(
    api.chats.search,
    searchQuery ? { query: searchQuery } : "skip"
  );
  const renameChat = useMutation(api.chats.rename);
  const deleteChat = useMutation(api.chats.remove);

  const displayedChats = searchQuery ? searchResults : chats;

  const handleNewChat = () => {
    router.push("/");
  };

  const handleChatClick = (chatId: Id<"chats">) => {
    router.push(`/chat/${chatId}`);
  };

  const handleRename = async () => {
    if (renameDialog.chatId && renameDialog.title.trim()) {
      await renameChat({
        id: renameDialog.chatId,
        title: renameDialog.title.trim(),
      });
      setRenameDialog({ open: false, chatId: null, title: "" });
    }
  };

  const handleDelete = async () => {
    if (deleteDialog.chatId) {
      await deleteChat({ id: deleteDialog.chatId });
      setDeleteDialog({ open: false, chatId: null });
      if (pathname === `/chat/${deleteDialog.chatId}`) {
        router.push("/");
      }
    }
  };

  const currentChatId = pathname.startsWith("/chat/")
    ? pathname.split("/chat/")[1]
    : null;

  return (
    <>
      {/* Mobile overlay */}
      {!isCollapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={collapse}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-full w-64 bg-sidebar border-r border-border flex flex-col transition-transform duration-300",
          isCollapsed ? "-translate-x-full" : "translate-x-0"
        )}
      >
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-3 border-b border-border">
          <Button
            variant="ghost"
            className="flex-1 justify-start gap-2 hover:bg-accent"
            onClick={handleNewChat}
          >
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={collapse}
            className="ml-2"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Chat list */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            <h3 className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Your Chats
            </h3>
            {displayedChats === undefined ? (
              <div className="px-2 py-4 text-sm text-muted-foreground">
                Loading...
              </div>
            ) : displayedChats.length === 0 ? (
              <div className="px-2 py-4 text-sm text-muted-foreground">
                {searchQuery ? "No chats found" : "No chats yet"}
              </div>
            ) : (
              <div className="space-y-1">
                {displayedChats.map((chat) => (
                  <div
                    key={chat._id}
                    className={cn(
                      "group relative flex items-center rounded-lg px-2 py-2 cursor-pointer hover:bg-accent transition-colors",
                      currentChatId === chat._id && "bg-accent"
                    )}
                    onClick={() => handleChatClick(chat._id)}
                  >
                    <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground mr-2" />

                    {/* Chat title - properly truncated */}
                    <span className="flex-1 text-sm truncate pr-2">{chat.title.slice(0, 25)}{chat.title.length > 25 ? "..." : ""}</span>

                    {/* Three dots - positioned at the end */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-7 w-7 shrink-0 absolute right-1",
                            "opacity-0 group-hover:opacity-100",
                            "bg-accent hover:bg-accent-foreground/10 transition-opacity"
                          )}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-40"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenameDialog({
                              open: true,
                              chatId: chat._id,
                              title: chat.title,
                            });
                          }}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteDialog({ open: true, chatId: chat._id });
                          }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* Rename Dialog */}
      <Dialog
        open={renameDialog.open}
        onOpenChange={(open) =>
          setRenameDialog({ open, chatId: null, title: "" })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Chat</DialogTitle>
          </DialogHeader>
          <Input
            value={renameDialog.title}
            onChange={(e) =>
              setRenameDialog((prev) => ({ ...prev, title: e.target.value }))
            }
            placeholder="Chat title"
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setRenameDialog({ open: false, chatId: null, title: "" })
              }
            >
              Cancel
            </Button>
            <Button onClick={handleRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ open, chatId: null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Chat</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this chat? This action cannot be
            undone.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, chatId: null })}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
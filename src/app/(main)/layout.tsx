"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Sidebar } from "@/components/sidebar";
import { Navbar } from "@/components/navbar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSidebar } from "@/hooks/use-sidebar";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoaded } = useUser();
  const getOrCreateUser = useMutation(api.users.getOrCreate);
  const { isCollapsed } = useSidebar();

  useEffect(() => {
    if (isLoaded && user) {
      getOrCreateUser({});
    }
  }, [isLoaded, user, getOrCreateUser]);

  return (
    <TooltipProvider>
      <div className="h-screen flex overflow-hidden">
        <Sidebar />
        <div
          className={`flex-1 flex flex-col transition-all duration-300 ${
            isCollapsed ? "ml-0" : "ml-0 md:ml-64"
          }`}
        >
          <Navbar />
          <main className="flex-1 overflow-hidden">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}

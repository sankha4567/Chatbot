"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useTheme } from "next-themes";

export function ClerkThemedProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <ClerkProvider
      appearance={{
        baseTheme: isDark ? dark : undefined,
        variables: {
          colorPrimary: "hsl(262 83% 58%)",
          borderRadius: "0.5rem",
        },
        elements: {
          // The card token is identical to the background token in this
          // design (both 240 10% 3.9% in dark, both white in light), so
          // we can't use bg-card here — it would render the card invisible.
          // Use explicit zinc shades that contrast with the page background
          // in both modes, plus a backdrop blur for a glass-morphism feel.
          cardBox: "shadow-2xl shadow-black/40 dark:shadow-primary/10",
          card: [
            "bg-white/95 dark:bg-zinc-900/80",
            "backdrop-blur-2xl",
            "border border-zinc-200 dark:border-zinc-800/60",
            "shadow-2xl",
            "rounded-2xl",
          ].join(" "),
          headerTitle: "text-foreground text-2xl font-semibold",
          headerSubtitle: "text-muted-foreground",
          socialButtonsBlockButton: [
            "border border-zinc-200 dark:border-zinc-800",
            "bg-white dark:bg-zinc-800/50",
            "hover:bg-zinc-50 dark:hover:bg-zinc-800",
            "text-foreground",
            "transition-colors",
          ].join(" "),
          socialButtonsBlockButtonText: "text-foreground font-medium",
          dividerLine: "bg-zinc-200 dark:bg-zinc-800",
          dividerText: "text-muted-foreground",
          formFieldLabel: "text-foreground font-medium",
          formFieldInput: [
            "bg-zinc-50 dark:bg-zinc-950/50",
            "border border-zinc-200 dark:border-zinc-800",
            "text-foreground",
            "focus:ring-2 focus:ring-primary focus:border-primary",
            "transition-colors",
          ].join(" "),
          formButtonPrimary: [
            "bg-primary text-primary-foreground",
            "hover:bg-primary/90",
            "shadow-lg shadow-primary/20",
            "transition-all",
          ].join(" "),
          footerActionText: "text-muted-foreground",
          footerActionLink: "text-primary hover:text-primary/90 font-medium",
          identityPreviewText: "text-foreground",
          identityPreviewEditButton: "text-primary",
          formFieldInputShowPasswordButton:
            "text-muted-foreground hover:text-foreground",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}

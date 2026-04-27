import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/providers/convex-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ClerkThemedProvider } from "@/components/providers/clerk-themed-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GemifyChat",
  description: "AI-powered chat application using Gemini",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <ClerkThemedProvider>
            <ConvexClientProvider>{children}</ConvexClientProvider>
          </ClerkThemedProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

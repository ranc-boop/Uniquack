import type { Metadata } from "next";
import Link from "next/link";
import "katex/dist/katex.min.css";

import "./globals.css";

import { AuthNav } from "@/components/auth-nav";
import { ThemeProvider } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "O2I Practice",
  description: "Student-first AP practice workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <header className="border-b">
            <div className="mx-auto flex min-h-14 max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <Link href="/" className="text-sm font-semibold">
                O2I Practice
              </Link>
              <nav className="flex flex-wrap items-center gap-2">
                <Button asChild variant="ghost" size="sm">
                  <Link href="/practice">Practice</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/questions">Question Bank</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/mistakes">Mistakes</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/videos">Videos</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/admin">Admin</Link>
                </Button>
                <AuthNav />
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

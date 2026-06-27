import type { Metadata } from "next";
import Link from "next/link";
import "katex/dist/katex.min.css";

import "./globals.css";

import { AuthNav } from "@/components/auth-nav";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const studentNavItems = [
  { href: "/practice", label: "Practice" },
  { href: "/questions", label: "Question Bank" },
  { href: "/mistakes", label: "Mistakes" },
  { href: "/videos", label: "Videos" },
];

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
          enableSystem={false}
          forcedTheme="light"
          disableTransitionOnChange
        >
          <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur">
            <div className="mx-auto flex min-h-16 max-w-[92rem] flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
              <Link href="/" className="flex items-center gap-3 text-sm font-bold tracking-tight">
                <span className="flex size-9 items-center justify-center rounded-lg bg-sky-600 text-sm font-black text-white shadow-sm">
                  O2I
                </span>
                <span>Practice</span>
              </Link>
              <nav className="flex flex-wrap items-center gap-1.5">
                {studentNavItems.map((item) => (
                  <Link
                    className="rounded-md px-3 py-2 text-sm font-semibold text-slate-600 transition-colors duration-200 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                    href={item.href}
                    key={item.href}
                  >
                    {item.label}
                  </Link>
                ))}
                <Link
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-colors duration-200 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                  href="/admin"
                >
                  Admin
                </Link>
                <AuthNav />
              </nav>
            </div>
          </header>
          <main className="student-shell">{children}</main>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

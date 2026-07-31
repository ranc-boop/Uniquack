import type { Metadata } from "next";
import Link from "next/link";
import "katex/dist/katex.min.css";

import "./globals.css";

import { AuthNav } from "@/components/auth-nav";
import { AppChrome } from "@/components/app-chrome";
import { AppPrimaryNav } from "@/components/app-primary-nav";
import { teacherWorkspaceNavItems } from "@/components/teacher/teacher-workspace-nav";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { getCurrentProfile } from "@/lib/auth/guards";

const studentNavItems = [
  { href: "/practice", label: "Practice" },
  { href: "/questions", label: "Public Library" },
  { href: "/mistakes", label: "Mistakes" },
  { href: "/videos", label: "Videos" },
];

export const metadata: Metadata = {
  title: "O2I Practice",
  description: "Student-first AP practice workspace",
};

async function getPrimaryNavModel() {
  try {
    const profile = await getCurrentProfile();

    if (profile?.role && ["teacher", "admin", "super_admin"].includes(profile.role)) {
      return {
        canOpenAdmin: ["admin", "super_admin"].includes(profile.role),
        items: teacherWorkspaceNavItems,
      };
    }
  } catch {
    return { canOpenAdmin: false, items: studentNavItems };
  }

  return { canOpenAdmin: false, items: studentNavItems };
}

async function PrimaryNav() {
  const { canOpenAdmin, items } = await getPrimaryNavModel();

  return (
    <>
      <AppPrimaryNav items={items} />
      {canOpenAdmin ? (
        <Link
          className="inline-flex min-h-10 shrink-0 items-center rounded-md px-3 py-2 text-sm font-semibold text-slate-600 transition-colors duration-200 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          href="/admin"
        >
          Admin
        </Link>
      ) : null}
    </>
  );
}

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
          <AppChrome
            header={
              <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur">
                <div className="mx-auto flex min-h-16 max-w-[100rem] items-center gap-4 px-4 py-2 sm:px-6 lg:px-8">
                  <Link
                    href="/"
                    className="flex shrink-0 items-center gap-3 text-sm font-bold tracking-tight"
                  >
                    <span className="flex size-9 items-center justify-center rounded-lg bg-sky-600 text-sm font-black text-white shadow-sm">
                      O2I
                    </span>
                    <span className="hidden sm:inline">Practice</span>
                  </Link>
                  <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <PrimaryNav />
                  </nav>
                  <AuthNav />
                </div>
              </header>
            }
          >
            {children}
          </AppChrome>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

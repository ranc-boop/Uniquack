import type { Metadata } from "next";
import Link from "next/link";
import "katex/dist/katex.min.css";

import "./globals.css";

import { AuthNav } from "@/components/auth-nav";
import { AppChrome } from "@/components/app-chrome";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const studentNavItems = [
  { href: "/practice", label: "Practice" },
  { href: "/questions", label: "Public Library" },
  { href: "/mistakes", label: "Mistakes" },
  { href: "/videos", label: "Videos" },
];

const teacherNavItems = [
  { href: "/teacher", label: "Dashboard" },
  { href: "/teacher/banks", label: "Libraries" },
  { href: "/teacher/blueprints", label: "Blueprints" },
  { href: "/teacher/classrooms", label: "Classrooms" },
  { href: "/teacher/publish", label: "Assignments" },
  { href: "/teacher/progress", label: "Progress" },
];

const platformNavItems = [{ href: "/admin", label: "Admin" }];

export const metadata: Metadata = {
  title: "O2I Practice",
  description: "Student-first AP practice workspace",
};

async function getPrimaryNavItems() {
  if (!isSupabaseConfigured()) {
    return studentNavItems;
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return studentNavItems;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role && ["teacher", "admin", "super_admin"].includes(profile.role)) {
      return teacherNavItems;
    }
  } catch {
    return studentNavItems;
  }

  return studentNavItems;
}

async function PrimaryNav() {
  const navItems = await getPrimaryNavItems();

  return (
    <>
      {navItems.map((item) => (
        <Link
          className="rounded-md px-3 py-2 text-sm font-semibold text-slate-600 transition-colors duration-200 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          href={item.href}
          key={item.href}
        >
          {item.label}
        </Link>
      ))}
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
                <div className="mx-auto flex min-h-16 max-w-[92rem] flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
                  <Link href="/" className="flex items-center gap-3 text-sm font-bold tracking-tight">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-sky-600 text-sm font-black text-white shadow-sm">
                      O2I
                    </span>
                    <span>Practice</span>
                  </Link>
                  <nav className="flex flex-wrap items-center gap-1.5">
                    <PrimaryNav />
                    {platformNavItems.map((item) => (
                      <Link
                        className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-colors duration-200 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                        href={item.href}
                        key={item.href}
                      >
                        {item.label}
                      </Link>
                    ))}
                    <AuthNav />
                  </nav>
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

import type { Metadata } from "next";
import { Suspense } from "react";
import "katex/dist/katex.min.css";

import "./globals.css";

import { AuthNav } from "@/components/auth-nav";
import { AppChrome } from "@/components/app-chrome";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { getCurrentProfile } from "@/lib/auth/guards";

export const metadata: Metadata = {
  title: "EduStruct",
  description: "Private multimodal mastery workspace",
};

async function getWorkspaceIdentity() {
  try {
    const profile = await getCurrentProfile();
    return { role: profile?.role ?? null };
  } catch {
    return { role: null };
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const identity = await getWorkspaceIdentity();

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
          <Suspense fallback={<main>{children}</main>}>
            <AppChrome accountMenu={<AuthNav />} role={identity.role}>
              {children}
            </AppChrome>
          </Suspense>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

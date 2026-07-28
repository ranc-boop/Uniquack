import "server-only";

import { NextResponse } from "next/server";

type SupabaseLike = {
  auth: {
    getClaims: () => Promise<{
      data: {
        claims?: {
          sub?: unknown;
        } | null;
      } | null;
      error?: { message?: string } | null;
    }>;
  };
};

export async function requirePracticeApiUser(supabase: SupabaseLike) {
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || typeof userId !== "string" || !userId) {
    return {
      response: NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      ),
      user: null,
    };
  }

  return { response: null, user: { id: userId } };
}

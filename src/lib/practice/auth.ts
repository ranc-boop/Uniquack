import "server-only";

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

type SupabaseLike = {
  auth: {
    getUser: () => Promise<{ data: { user: User | null }; error?: { message?: string } | null }>;
  };
};

export async function requirePracticeApiUser(supabase: SupabaseLike) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      response: NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      ),
      user: null,
    };
  }

  return { response: null, user };
}

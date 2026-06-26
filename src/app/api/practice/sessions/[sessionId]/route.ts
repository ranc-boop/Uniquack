import { NextResponse } from "next/server";

import { requirePracticeApiUser } from "@/lib/practice/auth";
import { getPracticeSession } from "@/lib/practice/persistence";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { sessionId } = await params;
  const supabase = await createClient();
  const auth = await requirePracticeApiUser(supabase);
  if (auth.response) {
    return auth.response;
  }

  const session = await getPracticeSession({ sessionId, supabase, userId: auth.user.id });
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  return NextResponse.json({ session });
}

export async function PATCH(request: Request, { params }: Params) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { sessionId } = await params;
  const supabase = await createClient();
  const auth = await requirePracticeApiUser(supabase);
  if (auth.response) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    nextUserNotes?: string;
    outlineUserNotes?: string;
    status?: "active" | "archived";
    title?: string;
  };
  const patch: {
    next_user_notes?: string;
    outline_user_notes?: string;
    preference_dirty_at?: string;
    status?: "active" | "archived";
    title?: string;
  } = {};

  if (typeof body.title === "string") {
    const title = body.title.trim().slice(0, 160);
    if (title) {
      patch.title = title;
    }
  }
  if (typeof body.outlineUserNotes === "string") {
    patch.outline_user_notes = body.outlineUserNotes.trim().slice(0, 4000);
    patch.preference_dirty_at = new Date().toISOString();
  }
  if (typeof body.nextUserNotes === "string") {
    patch.next_user_notes = body.nextUserNotes.trim().slice(0, 4000);
    patch.preference_dirty_at = new Date().toISOString();
  }
  if (body.status === "active" || body.status === "archived") {
    patch.status = body.status;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { error } = await supabase
    .from("practice_sessions")
    .update(patch)
    .eq("user_id", auth.user.id)
    .eq("id", sessionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const session = await getPracticeSession({ sessionId, supabase, userId: auth.user.id });
  return NextResponse.json({ session });
}

export async function DELETE(_request: Request, { params }: Params) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { sessionId } = await params;
  const supabase = await createClient();
  const auth = await requirePracticeApiUser(supabase);
  if (auth.response) {
    return auth.response;
  }

  const { error } = await supabase
    .from("practice_sessions")
    .delete()
    .eq("user_id", auth.user.id)
    .eq("id", sessionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

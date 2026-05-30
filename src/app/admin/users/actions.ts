"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { profileRoleUpdateSchema } from "@/lib/validations/profile";

export async function updateUserRole(formData: FormData) {
  await requireSuperAdmin();
  const parsed = profileRoleUpdateSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();

  await supabase
    .from("profiles")
    .update({ role: parsed.role })
    .eq("id", parsed.id);

  revalidatePath("/admin/users");
}

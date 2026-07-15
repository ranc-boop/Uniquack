"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { profileRoleUpdateSchema } from "@/lib/validations/profile";

export async function updateUserRole(formData: FormData) {
  await requireSuperAdmin();
  const parsed = profileRoleUpdateSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();

  const { error } = await supabase.rpc("transition_profile_role_as_super_admin", {
    p_next_role: parsed.role,
    p_target_profile_id: parsed.id,
  });

  if (error) {
    throw new Error("Unable to update the user role.");
  }

  revalidatePath("/admin/users");
}

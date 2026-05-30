import { z } from "zod";

import { uuidSchema } from "@/lib/validations/common";

export const profileRoleUpdateSchema = z.object({
  id: uuidSchema,
  role: z.enum(["super_admin", "admin", "student"]),
});

import { z } from "zod";

const tagIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .regex(/^[a-z][a-z0-9]*(\.[a-z0-9_]+)*$/);

export const taxonomyNodeCreateSchema = z
  .object({
    tag_id: tagIdSchema,
    parent_tag_id: tagIdSchema,
    facet_key: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).default(""),
    is_assignable: z
      .union([z.literal("on"), z.literal("true"), z.literal("false")])
      .optional()
      .transform((value) => value !== "false"),
  })
  .superRefine((value, context) => {
    if (value.tag_id === value.parent_tag_id) {
      context.addIssue({
        code: "custom",
        message: "New taxonomy ID must add a suffix under the selected parent.",
        path: ["tag_id"],
      });
    }

    if (!value.tag_id.startsWith(`${value.parent_tag_id}.`)) {
      context.addIssue({
        code: "custom",
        message: "New taxonomy ID must be nested under the selected parent.",
        path: ["tag_id"],
      });
    }
  });

export const taxonomyNodeDeleteSchema = z.object({
  tag_id: tagIdSchema,
});

export const taxonomyActionSchema = z.object({
  id: z.uuid(),
});

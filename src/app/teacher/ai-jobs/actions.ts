"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  buildAIPdfJobIdempotencyKey,
  buildBlueprintGenerationJobIdempotencyKey,
  cancelAIProviderJob,
  enqueueAIProviderJob,
} from "@/lib/ai-jobs/queue";
import type { AIProviderJob } from "@/lib/ai-jobs/types";
import { formatActionError } from "@/lib/actions/feedback";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

const jobActionSchema = z.object({
  jobId: z.string().uuid(),
  returnTo: z.string().startsWith("/teacher/").max(500),
});

function appendMessage(path: string, key: "saved" | "error", message: string) {
  const delimiter = path.includes("?") ? "&" : "?";
  return `${path}${delimiter}${key}=${encodeURIComponent(message)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function cancelTeacherAIProviderJob(formData: FormData) {
  const fallbackPath = typeof formData.get("returnTo") === "string"
    ? String(formData.get("returnTo"))
    : "/teacher";

  try {
    await requireTeacher();
    const parsed = jobActionSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const cancelled = await cancelAIProviderJob({ jobId: parsed.jobId, supabase });

    if (!cancelled) {
      throw new Error("Only queued or scheduled retry work can be cancelled.");
    }

    revalidatePath(parsed.returnTo);
    redirect(appendMessage(parsed.returnTo, "saved", "Queued AI work was cancelled. Your source and target Library were preserved."));
  } catch (error) {
    redirect(appendMessage(fallbackPath, "error", formatActionError(error)));
  }
}

export async function retryTeacherAIProviderJob(formData: FormData) {
  const fallbackPath = typeof formData.get("returnTo") === "string"
    ? String(formData.get("returnTo"))
    : "/teacher";

  try {
    await requireTeacher();
    const parsed = jobActionSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ai_provider_jobs")
      .select("*")
      .eq("id", parsed.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const job = data as AIProviderJob | null;
    if (!job || job.status !== "failed" || !job.target_bank_id) {
      throw new Error("Only a failed AI run in an authorized Library can be retried.");
    }

    const retryGeneration = job.retry_generation + 1;
    const payload: Record<string, unknown> = {
      ...asRecord(job.payload),
      retryGeneration,
    };
    let idempotencyKey: string;

    if (job.job_kind === "ai_pdf_extract") {
      const sourceAssetId = typeof payload.sourceAssetId === "string"
        ? payload.sourceAssetId
        : "";
      if (!sourceAssetId) {
        throw new Error("The original private PDF reference is missing, so this run cannot be retried.");
      }
      idempotencyKey = buildAIPdfJobIdempotencyKey({
        batchId: job.resource_id,
        retryGeneration,
        sourceAssetId,
      });
    } else {
      const blueprintVersion = Number(payload.blueprintVersion);
      if (!Number.isFinite(blueprintVersion)) {
        throw new Error("The original Blueprint version is missing, so this run cannot be retried.");
      }
      idempotencyKey = buildBlueprintGenerationJobIdempotencyKey({
        blueprintId: job.resource_id,
        blueprintVersion,
        retryGeneration,
        targetBankId: job.target_bank_id,
      });
    }

    await enqueueAIProviderJob({
      idempotencyKey,
      jobKind: job.job_kind,
      payload,
      providerProfileId: job.provider_profile_id,
      resourceId: job.resource_id,
      resourceType: job.resource_type,
      supabase,
      targetBankId: job.target_bank_id,
    });

    revalidatePath(parsed.returnTo);
    redirect(appendMessage(parsed.returnTo, "saved", "AI work was queued again. The original source and target Library were preserved."));
  } catch (error) {
    redirect(appendMessage(fallbackPath, "error", formatActionError(error)));
  }
}

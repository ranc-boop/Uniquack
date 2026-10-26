import "server-only";

import type {
  AIOperationTelemetry,
  AIOperationsControl,
} from "@/types/database";

type SupabaseAdminClient = any;

type AIOperationsAlert = {
  code:
    | "budget_threshold"
    | "circuit_open"
    | "fallback_rate"
    | "permanent_configuration"
    | "queue_depth"
    | "queue_oldest"
    | "stale_lease"
    | "worker_stale"
    | "zero_draft";
  message: string;
  severity: "critical" | "warning";
};

type SafeCircuitState = {
  circuit_state: "closed" | "open" | "half_open";
  last_safe_error_code: string | null;
  open_until: string | null;
  operation_kind: string;
  provider_profile_id: string;
  updated_at: string;
};

const DEFAULT_CONTROL: Pick<
  AIOperationsControl,
  | "alert_circuit_open_seconds"
  | "alert_fallback_rate_basis_points"
  | "alert_oldest_queue_seconds"
  | "alert_queue_depth"
  | "alert_worker_stale_seconds"
  | "daily_estimated_cost_micros"
  | "max_jobs_per_invocation"
  | "max_provider_calls_per_execution"
  | "monthly_estimated_cost_micros"
  | "pause_new_enqueues"
  | "pause_worker_claims"
  | "queue_cost_reservation_micros"
  | "selective_execution_enabled"
> = {
  alert_circuit_open_seconds: 900,
  alert_fallback_rate_basis_points: 2500,
  alert_oldest_queue_seconds: 900,
  alert_queue_depth: 10,
  alert_worker_stale_seconds: 600,
  daily_estimated_cost_micros: 10_000_000,
  max_jobs_per_invocation: 2,
  max_provider_calls_per_execution: 4,
  monthly_estimated_cost_micros: 50_000_000,
  pause_new_enqueues: false,
  pause_worker_claims: false,
  queue_cost_reservation_micros: 100_000,
  selective_execution_enabled: false,
};

function isMissingSchemaError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST204" ||
    error?.code === "PGRST205" ||
    message.includes("ai_operation") ||
    message.includes("ai_operations")
  );
}

function millisSince(value: string | null | undefined, now: number) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? Math.max(0, now - parsed) : null;
}

function percentile(values: Array<number | null>, target: number) {
  const sorted = values
    .filter((value): value is number => typeof value === "number" && value >= 0)
    .sort((left, right) => left - right);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * target) - 1)] ?? null;
}

function sum(values: Array<number | null | undefined>) {
  return values.reduce<number>(
    (total, value) => total + (typeof value === "number" ? value : 0),
    0,
  );
}

function safeRows(value: unknown): AIOperationTelemetry[] {
  return Array.isArray(value) ? (value as AIOperationTelemetry[]) : [];
}

export async function getAIOperationsDashboard(supabase: SupabaseAdminClient) {
  const now = Date.now();
  const dayStart = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).toISOString();
  const [controlResult, operationControlResult, jobResult, telemetryResult, circuitResult] = await Promise.all([
    supabase
      .from("ai_operations_controls")
      .select("*")
      .is("organization_id", null)
      .is("operation_kind", null)
      .maybeSingle(),
    supabase
      .from("ai_operations_controls")
      .select("operation_kind, pause_new_enqueues")
      .is("organization_id", null)
      .not("operation_kind", "is", null),
    supabase
      .from("ai_provider_jobs")
      .select("id, job_kind, status, created_at, updated_at, safe_error_code, execution_attempt_count")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("ai_operation_telemetry")
      .select("*")
      .order("created_at", { ascending: false })
      // perf-budget-allow-large-query: the admin-only dashboard bounds recent telemetry to 1,000 aggregate rows for p95 and alert calculations.
      .limit(1000),
    supabase.rpc("list_ai_provider_runtime_states_for_admin"),
  ]);

  if (
    [controlResult.error, operationControlResult.error, telemetryResult.error, circuitResult.error].some((error) =>
      isMissingSchemaError(error),
    )
  ) {
    return { schemaReady: false as const };
  }
  for (const result of [controlResult, operationControlResult, jobResult, telemetryResult, circuitResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const control = {
    ...DEFAULT_CONTROL,
    ...(controlResult.data as AIOperationsControl | null),
  };
  const operationPauses = new Map<string, boolean>(
    (Array.isArray(operationControlResult.data) ? operationControlResult.data : [])
      .filter((row: any) => typeof row.operation_kind === "string")
      .map((row: any): [string, boolean] => [
        row.operation_kind,
        row.pause_new_enqueues === true,
      ]),
  );
  const jobs = Array.isArray(jobResult.data) ? jobResult.data : [];
  const telemetry = safeRows(telemetryResult.data);
  const circuits = Array.isArray(circuitResult.data)
    ? (circuitResult.data as SafeCircuitState[])
    : [];
  const queued = jobs.filter((job: any) => ["queued", "retry_wait"].includes(job.status));
  const active = jobs.filter((job: any) => ["leased", "processing"].includes(job.status));
  const retryWaiting = jobs.filter((job: any) => job.status === "retry_wait");
  const failed = jobs.filter((job: any) => job.status === "failed");
  const oldestQueueAgeMs = queued.length
    ? Math.max(...queued.map((job: any) => millisSince(job.created_at, now) ?? 0))
    : null;
  const recentTelemetry = telemetry.filter((row) => row.created_at >= dayStart);
  const completed = recentTelemetry.filter((row) => row.final_status === "completed");
  const attemptedTerminal = recentTelemetry.filter((row) =>
    ["completed", "failed", "cancelled"].includes(row.final_status),
  );
  const fallbackCount = recentTelemetry.filter((row) => row.fallback_used).length;
  const successRate = attemptedTerminal.length
    ? completed.length / attemptedTerminal.length
    : null;
  const fallbackRate = completed.length ? fallbackCount / completed.length : null;
  const costTodayMicros = sum(recentTelemetry.map((row) => row.estimated_total_cost_micros));
  const costMonthMicros = sum(
    telemetry.filter((row) => row.created_at >= monthStart).map((row) => row.estimated_total_cost_micros),
  );
  const draftsCreated = sum(completed.map((row) => row.drafts_created));
  const latestWorkerAt = telemetry[0]?.created_at ?? null;
  const openCircuits = circuits.filter((state) => state.circuit_state !== "closed");
  const alerts: AIOperationsAlert[] = [];

  if (queued.length >= control.alert_queue_depth) {
    alerts.push({ code: "queue_depth", message: "Queue depth exceeds the closed-beta threshold.", severity: "warning" });
  }
  if ((oldestQueueAgeMs ?? 0) >= control.alert_oldest_queue_seconds * 1_000) {
    alerts.push({ code: "queue_oldest", message: "The oldest queued job exceeds the queue-age threshold.", severity: "warning" });
  }
  if (!latestWorkerAt || (millisSince(latestWorkerAt, now) ?? Infinity) >= control.alert_worker_stale_seconds * 1_000) {
    alerts.push({ code: "worker_stale", message: "No recent worker telemetry was recorded within the configured window.", severity: "warning" });
  }
  if (openCircuits.some((state) => (millisSince(state.updated_at, now) ?? 0) >= control.alert_circuit_open_seconds * 1_000)) {
    alerts.push({ code: "circuit_open", message: "A provider circuit has remained open longer than the configured threshold.", severity: "critical" });
  }
  if ((fallbackRate ?? 0) * 10_000 >= control.alert_fallback_rate_basis_points) {
    alerts.push({ code: "fallback_rate", message: "Fallback use exceeds the configured closed-beta threshold.", severity: "warning" });
  }
  if (control.daily_estimated_cost_micros > 0 && costTodayMicros >= control.daily_estimated_cost_micros) {
    alerts.push({ code: "budget_threshold", message: "Estimated daily provider-cost budget is exhausted.", severity: "critical" });
  }
  if (completed.filter((row) => row.drafts_created === 0).length >= 3) {
    alerts.push({ code: "zero_draft", message: "Repeated completed operations produced zero Review Drafts.", severity: "warning" });
  }
  if (recentTelemetry.filter((row) => row.safe_error_code === "lease_expired").length >= 2) {
    alerts.push({ code: "stale_lease", message: "Repeated stale lease recovery was observed.", severity: "warning" });
  }
  if (recentTelemetry.filter((row) => row.safe_error_code === "provider_configuration").length >= 2) {
    alerts.push({ code: "permanent_configuration", message: "Repeated permanent provider configuration errors were observed.", severity: "critical" });
  }

  return {
    alerts,
    circuits: openCircuits,
    control,
    metrics: {
      activeJobs: active.length,
      costMonthMicros,
      costPerCompletedPdfMicros: (() => {
        const pdfs = completed.filter((row) => row.operation_kind === "ai_pdf_extract");
        return pdfs.length ? Math.round(sum(pdfs.map((row) => row.estimated_total_cost_micros)) / pdfs.length) : null;
      })(),
      costPerDraftMicros: draftsCreated ? Math.round(costTodayMicros / draftsCreated) : null,
      costTodayMicros,
      failedJobs: failed.length,
      fallbackRate,
      oldestQueueAgeMs,
      operationBreakdown: ["ai_pdf_extract", "blueprint_generate_questions", "blueprint_observe_pdf", "blueprint_analyze_text"].map((operationKind) => ({
        completed: completed.filter((row) => row.operation_kind === operationKind).length,
        operationKind,
        tokens: sum(recentTelemetry.filter((row) => row.operation_kind === operationKind).map((row) => row.actual_total_tokens)),
      })),
      p50ProviderLatencyMs: percentile(recentTelemetry.map((row) => row.provider_latency_ms), 0.5),
      p50QueueWaitMs: percentile(recentTelemetry.map((row) => row.queue_wait_ms), 0.5),
      p95ProviderLatencyMs: percentile(recentTelemetry.map((row) => row.provider_latency_ms), 0.95),
      p95QueueWaitMs: percentile(recentTelemetry.map((row) => row.queue_wait_ms), 0.95),
      queueDepth: queued.length,
      retryWaitingJobs: retryWaiting.length,
      successRate,
      throughput24h: completed.length,
      tokensToday: sum(recentTelemetry.map((row) => row.actual_total_tokens)),
    },
    operationPauses,
    recentTelemetry: telemetry.slice(0, 24),
    schemaReady: true as const,
  };
}

export function formatEstimatedMicros(value: number | null) {
  if (value === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value / 1_000_000);
}

export function formatDuration(value: number | null) {
  if (value === null) return "Not observed";
  if (value < 1_000) return `${value} ms`;
  if (value < 60_000) return `${(value / 1_000).toFixed(1)} s`;
  return `${Math.round(value / 60_000)} min`;
}

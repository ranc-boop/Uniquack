import {
  cancelQueuedAIJobAsAdmin,
  createAIProviderProfile,
  deleteAIProviderProfile,
  resetAIProviderCircuit,
  saveAIOperationsControl,
  saveAIProviderRoutingPolicy,
  setAIOperationPause,
  updateAIProviderProfile,
} from "@/app/admin/ai-settings/actions";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AIProviderModeFields } from "@/components/ai-provider-mode-fields";
import { AIProviderTestButton } from "@/components/ai-provider-test-button";
import { DeleteSubmitButton } from "@/components/delete-submit-button";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageFeedback } from "@/components/page-feedback";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { requireSuperAdmin } from "@/lib/auth/guards";
import {
  aiPdfInputStrategyLabel,
  aiProviderModeSummaryLabel,
  describeAiPdfProviderInput,
  getAiProviderCapabilities,
  inferAiProviderMode,
} from "@/lib/ai-providers/adapters";
import { listSafeAIProviderProfiles } from "@/lib/ai-providers/profiles";
import {
  AI_PROVIDER_ROUTING_OPERATION_KINDS,
  AIProviderRoutingSchemaMissingError,
  aiProviderRoutingOperationLabel,
  listAIProviderRoutingPoliciesForGateway,
  providerSupportsAIProviderRoutingOperation,
  type AIProviderRoutingPolicy,
} from "@/lib/ai-providers/routing";
import {
  formatDuration,
  formatEstimatedMicros,
  getAIOperationsDashboard,
} from "@/lib/ai-operations/dashboard";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

function Checkbox({
  defaultChecked,
  label,
  name,
}: {
  defaultChecked?: boolean;
  label: string;
  name: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4 rounded border"
      />
      {label}
    </label>
  );
}

export default async function AdminAISettingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  await requireSuperAdmin();
  const supabase = await createClient();
  const profiles = await listSafeAIProviderProfiles(supabase);
  let routingPolicies: AIProviderRoutingPolicy[] = [];
  let routingSchemaMissing = false;
  try {
    routingPolicies = await listAIProviderRoutingPoliciesForGateway(supabase);
  } catch (error) {
    if (error instanceof AIProviderRoutingSchemaMissingError) {
      routingSchemaMissing = true;
    } else {
      throw error;
    }
  }
  const hasEncryptionKey = Boolean(process.env.AI_PROVIDER_ENCRYPTION_KEY);
  const operations = await getAIOperationsDashboard(supabase);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Configure AI providers."
        eyebrow="Settings"
        help="Super admin settings for PDF import and blueprint model providers. API keys are encrypted server-side and never displayed back in the UI."
        helpLabel="AI settings details"
        title="AI Settings"
      />
      <PageFeedback error={params.error} saved={params.saved} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI operations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!operations.schemaReady ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              AI operations telemetry and closed-beta controls need clean migration
              0036 before this operational view can collect data.
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Queue depth", operations.metrics.queueDepth],
                  ["Active jobs", operations.metrics.activeJobs],
                  ["Retry waiting", operations.metrics.retryWaitingJobs],
                  ["Failed jobs", operations.metrics.failedJobs],
                  ["Oldest queued", formatDuration(operations.metrics.oldestQueueAgeMs ?? null)],
                  ["Success rate", operations.metrics.successRate == null ? "Not observed" : `${Math.round(operations.metrics.successRate * 100)}%`],
                  ["Tokens today", Number(operations.metrics.tokensToday ?? 0).toLocaleString()],
                  ["Estimated cost today", formatEstimatedMicros(operations.metrics.costTodayMicros ?? null)],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-md border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-lg font-semibold">{value}</p>
                  </div>
                ))}
              </div>
              {operations.alerts.length ? (
                <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-medium">Operational alerts</p>
                  {operations.alerts.map((alert) => (
                    <p key={alert.code}>{alert.message}</p>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  No current operational alert conditions were observed.
                </p>
              )}
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer font-medium">Closed-beta controls</summary>
                <form action={saveAIOperationsControl} className="mt-4 grid gap-3 md:grid-cols-3">
                  <label className="space-y-1 text-sm"><span>Daily estimated cost budget (microdollars)</span><Input name="daily_estimated_cost_micros" type="number" min="0" defaultValue={operations.control.daily_estimated_cost_micros} /></label>
                  <label className="space-y-1 text-sm"><span>Monthly estimated cost budget (microdollars)</span><Input name="monthly_estimated_cost_micros" type="number" min="0" defaultValue={operations.control.monthly_estimated_cost_micros} /></label>
                  <label className="space-y-1 text-sm"><span>Per-job cost reservation (microdollars)</span><Input name="queue_cost_reservation_micros" type="number" min="0" defaultValue={operations.control.queue_cost_reservation_micros} /></label>
                  <label className="space-y-1 text-sm"><span>Max jobs per worker invocation</span><Input name="max_jobs_per_invocation" type="number" min="1" max="2" defaultValue={operations.control.max_jobs_per_invocation} /></label>
                  <label className="space-y-1 text-sm"><span>Max provider calls per execution</span><Input name="max_provider_calls_per_execution" type="number" min="1" max="4" defaultValue={operations.control.max_provider_calls_per_execution} /></label>
                  <label className="space-y-1 text-sm"><span>Queue depth alert</span><Input name="alert_queue_depth" type="number" min="1" defaultValue={operations.control.alert_queue_depth} /></label>
                  <label className="space-y-1 text-sm"><span>Oldest queue alert (seconds)</span><Input name="alert_oldest_queue_seconds" type="number" min="60" defaultValue={operations.control.alert_oldest_queue_seconds} /></label>
                  <label className="space-y-1 text-sm"><span>Worker stale alert (seconds)</span><Input name="alert_worker_stale_seconds" type="number" min="60" defaultValue={operations.control.alert_worker_stale_seconds} /></label>
                  <label className="space-y-1 text-sm"><span>Circuit open alert (seconds)</span><Input name="alert_circuit_open_seconds" type="number" min="60" defaultValue={operations.control.alert_circuit_open_seconds} /></label>
                  <label className="space-y-1 text-sm"><span>Fallback alert (basis points)</span><Input name="alert_fallback_rate_basis_points" type="number" min="0" max="10000" defaultValue={operations.control.alert_fallback_rate_basis_points} /></label>
                  <div className="flex flex-col justify-end gap-2 text-sm"><Checkbox name="pause_new_enqueues" label="Pause new AI work" defaultChecked={operations.control.pause_new_enqueues} /><Checkbox name="pause_worker_claims" label="Pause worker claims" defaultChecked={operations.control.pause_worker_claims} /></div>
                  <div className="md:col-span-3"><FormSubmitButton pendingLabel="Saving controls...">Save closed-beta controls</FormSubmitButton></div>
                </form>
              </details>
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer font-medium">Operation pauses and circuits</summary>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {AI_PROVIDER_ROUTING_OPERATION_KINDS.map((operationKind) => (
                    <form key={operationKind} action={setAIOperationPause} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                      <input type="hidden" name="operation_kind" value={operationKind} />
                      <span>{aiProviderRoutingOperationLabel(operationKind)}</span>
                      <label className="flex items-center gap-2"><input type="checkbox" name="pause_new_enqueues" defaultChecked={operations.operationPauses.get(operationKind) ?? false} /> Pause new work</label>
                      <FormSubmitButton pendingLabel="Saving...">Save</FormSubmitButton>
                    </form>
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  {operations.circuits.length ? operations.circuits.map((circuit) => (
                    <form key={`${circuit.provider_profile_id}:${circuit.operation_kind}`} action={resetAIProviderCircuit} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
                      <input type="hidden" name="provider_profile_id" value={circuit.provider_profile_id} />
                      <input type="hidden" name="operation_kind" value={circuit.operation_kind} />
                      <span>{aiProviderRoutingOperationLabel(circuit.operation_kind as typeof AI_PROVIDER_ROUTING_OPERATION_KINDS[number])}: {circuit.circuit_state}</span>
                      <FormSubmitButton pendingLabel="Resetting...">Reset circuit</FormSubmitButton>
                    </form>
                  )) : <p className="text-sm text-muted-foreground">No open or half-open circuits.</p>}
                </div>
              </details>
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer font-medium">Recent safe telemetry and queued-job cancellation</summary>
                <form action={cancelQueuedAIJobAsAdmin} className="mt-3 flex flex-wrap gap-2">
                  <Input name="job_id" className="max-w-md" placeholder="Queued job ID" required />
                  <FormSubmitButton pendingLabel="Cancelling...">Cancel queued job</FormSubmitButton>
                </form>
                <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                  {operations.recentTelemetry.map((row) => (
                    <p key={row.id}>{row.operation_kind} · {row.final_status} · {row.drafts_created} drafts · {formatEstimatedMicros(row.estimated_total_cost_micros)} · {formatDuration(row.provider_latency_ms)}</p>
                  ))}
                  {!operations.recentTelemetry.length ? <p>No safe telemetry records yet.</p> : null}
                </div>
              </details>
            </>
          )}
        </CardContent>
      </Card>
      {!hasEncryptionKey ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          AI_PROVIDER_ENCRYPTION_KEY is not configured. You can test a provider
          with the API key currently typed in the form, but saving provider keys
          or using saved provider keys requires this server env and a dev server
          restart.
        </div>
      ) : null}
      <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Provider modes</p>
        <p>
          DeepSeek is OpenAI-compatible and should usually be configured as a
          text/json provider, not as the main scanned PDF parser.
        </p>
        <p>
          Gemini OpenAI-compatible can use page images but should not be marked
          as native/full PDF input. Gemini Native uses the native Gemini API and
          can use full PDF input through the Files API.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Server-side provider routing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {routingSchemaMissing ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Provider routing setup is needed before durable fallback can run.
              Apply clean migration 0035, then return here to configure each
              operation&apos;s primary and optional fallback profiles.
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                These routes are resolved only on the server. Teachers and
                students never select a provider or model.
              </p>
              <div className="grid gap-4">
                {AI_PROVIDER_ROUTING_OPERATION_KINDS.map((operationKind) => {
                  const policy = routingPolicies.find(
                    (item) =>
                      item.organizationId === null &&
                      item.operationKind === operationKind,
                  );
                  const routeProfileIds = policy?.providerProfileIds ?? [];
                  const compatibleProfiles = profiles.filter(
                    (profile) =>
                      profile.enabled &&
                      Boolean(profile.api_key_last4) &&
                      providerSupportsAIProviderRoutingOperation(
                        profile,
                        operationKind,
                      ),
                  );

                  return (
                    <form
                      key={operationKind}
                      action={saveAIProviderRoutingPolicy}
                      className="grid gap-3 rounded-md border p-4 md:grid-cols-4"
                    >
                      <input
                        type="hidden"
                        name="operation_kind"
                        value={operationKind}
                      />
                      <div className="md:col-span-4">
                        <p className="font-medium text-sm">
                          {aiProviderRoutingOperationLabel(operationKind)}
                        </p>
                      </div>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Primary</span>
                        <select
                          name="provider_profile_id"
                          defaultValue={routeProfileIds[0] ?? ""}
                          className="h-10 w-full rounded-md border bg-background px-3"
                        >
                          <option value="">No configured route</option>
                          {compatibleProfiles.map((profile) => (
                              <option key={profile.id} value={profile.id}>
                                {profile.name} ({profile.model})
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Fallback 1</span>
                        <select
                          name="provider_profile_id"
                          defaultValue={routeProfileIds[1] ?? ""}
                          className="h-10 w-full rounded-md border bg-background px-3"
                        >
                          <option value="">No fallback</option>
                          {compatibleProfiles.map((profile) => (
                              <option key={profile.id} value={profile.id}>
                                {profile.name} ({profile.model})
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Fallback 2</span>
                        <select
                          name="provider_profile_id"
                          defaultValue={routeProfileIds[2] ?? ""}
                          className="h-10 w-full rounded-md border bg-background px-3"
                        >
                          <option value="">No fallback</option>
                          {compatibleProfiles.map((profile) => (
                              <option key={profile.id} value={profile.id}>
                                {profile.name} ({profile.model})
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Route state</span>
                        <span className="flex h-10 items-center gap-2">
                          <input
                            type="checkbox"
                            name="enabled"
                            defaultChecked={policy?.enabled ?? false}
                            className="size-4 rounded border"
                          />
                          Enabled
                        </span>
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Max attempts</span>
                        <select
                          name="max_profiles_per_execution"
                          defaultValue={String(policy?.maxProfilesPerExecution ?? 2)}
                          className="h-10 w-full rounded-md border bg-background px-3"
                        >
                          <option value="1">Primary only</option>
                          <option value="2">Primary + one fallback</option>
                          <option value="3">Primary + two fallbacks</option>
                        </select>
                      </label>
                      <div className="flex items-end md:col-span-3">
                        <FormSubmitButton pendingLabel="Saving route...">
                          Save route
                        </FormSubmitButton>
                      </div>
                    </form>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create provider profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createAIProviderProfile} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new_name">Name</Label>
              <Input
                id="new_name"
                name="name"
                placeholder="Gemini Native PDF"
                required
              />
            </div>
            <AIProviderModeFields
              idPrefix="new"
              defaultProvider="openai_compatible"
            />
            <div className="space-y-2">
              <Label htmlFor="new_api_key">API key</Label>
              <Input id="new_api_key" name="api_key" type="password" required />
            </div>
            <div className="flex flex-wrap gap-4 md:col-span-2">
              <Checkbox name="enabled" label="Enabled" defaultChecked />
              <Checkbox name="is_default" label="Default provider" />
            </div>
            <div className="md:col-span-2">
              <div className="flex flex-wrap gap-2">
                <FormSubmitButton pendingLabel="Creating provider...">
                  Create provider
                </FormSubmitButton>
                <AIProviderTestButton mode="new" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Testing uses a tiny text request with the current form values
                and does not save the provider. DeepSeek defaults should stay
                text/json unless multimodal support is explicitly verified.
                For Gemini Native full PDF, use provider type gemini_native,
                the generativelanguage base URL, and enable native/full PDF.
                Test connection uses Gemini Native generateContent with a tiny
                text prompt; PDF import uses the Files API separately.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {profiles.map((profile) => {
          const providerMode = inferAiProviderMode(profile);
          const providerInput = describeAiPdfProviderInput(profile);
          const capabilities = getAiProviderCapabilities(profile);

          return (
          <Card key={profile.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{profile.name}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {aiProviderModeSummaryLabel(providerMode)} / {profile.model}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Mode: {aiProviderModeSummaryLabel(providerMode)} / PDF input:{" "}
                    {aiPdfInputStrategyLabel(providerInput.strategy)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge variant={profile.enabled ? "secondary" : "outline"}>
                    {profile.enabled ? "enabled" : "disabled"}
                  </Badge>
                  {profile.is_default ? (
                    <Badge variant="secondary">default</Badge>
                  ) : null}
                  <Badge variant="outline">
                    key {profile.api_key_last4 ? `...${profile.api_key_last4}` : "missing"}
                  </Badge>
                  {capabilities.supportsPageImages ? (
                    <Badge variant="outline">page images</Badge>
                  ) : null}
                  {capabilities.supportsNativePdf ? (
                    <Badge variant="outline">native PDF</Badge>
                  ) : null}
                  {!capabilities.supportsPageImages &&
                  !capabilities.supportsNativePdf ? (
                    <Badge variant="outline">text/json</Badge>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form action={updateAIProviderProfile} className="grid gap-4 md:grid-cols-2">
                <input type="hidden" name="id" value={profile.id} />
                <div className="space-y-2">
                  <Label htmlFor={`name_${profile.id}`}>Name</Label>
                  <Input id={`name_${profile.id}`} name="name" defaultValue={profile.name} required />
                </div>
                <AIProviderModeFields
                  idPrefix={`profile_${profile.id}`}
                  defaultProvider={providerMode}
                  defaultBaseUrl={profile.base_url}
                  defaultModel={profile.model}
                  defaultSupportsPdfInput={profile.supports_pdf_input}
                  defaultSupportsVisionImages={profile.supports_vision_images}
                />
                <div className="space-y-2">
                  <Label htmlFor={`api_key_${profile.id}`}>Replace API key</Label>
                  <Input
                    id={`api_key_${profile.id}`}
                    name="api_key"
                    type="password"
                    placeholder="Leave blank to keep existing key"
                  />
                </div>
                <div className="flex flex-wrap gap-4 md:col-span-2">
                  <Checkbox name="enabled" label="Enabled" defaultChecked={profile.enabled} />
                  <Checkbox
                    name="is_default"
                    label="Default provider"
                    defaultChecked={profile.is_default}
                  />
                </div>
                <div className="flex flex-wrap gap-2 md:col-span-2">
                  <FormSubmitButton pendingLabel="Saving provider...">
                    Save provider
                  </FormSubmitButton>
                  <AIProviderTestButton mode="saved" />
                  <Button asChild type="button" variant="outline">
                    <a href="/admin/imports/pdf">Use in PDF import</a>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground md:col-span-2">
                  Testing uses a tiny text request with the current visible
                  values. If Replace API key is blank, the saved encrypted key
                  is used. Gemini OpenAI-compatible providers should use page
                  images; Gemini Native should use native/full PDF input. For
                  Gemini Native, Test connection checks generateContent only;
                  full PDF import uses the Files API.
                </p>
              </form>
              <form action={deleteAIProviderProfile} className="mt-3">
                <input type="hidden" name="id" value={profile.id} />
                <DeleteSubmitButton label={`AI provider ${profile.name}`} />
              </form>
            </CardContent>
          </Card>
          );
        })}
        {!profiles.length ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            No AI provider profiles yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}

import {
  createAIProviderProfile,
  deleteAIProviderProfile,
  updateAIProviderProfile,
} from "@/app/admin/ai-settings/actions";
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
  const hasEncryptionKey = Boolean(process.env.AI_PROVIDER_ENCRYPTION_KEY);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Settings</h1>
        <p className="text-sm text-muted-foreground">
          Super admin settings for PDF import model providers. API keys are
          encrypted server-side and never displayed back in the UI.
        </p>
      </div>
      <PageFeedback error={params.error} saved={params.saved} />
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

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/guards";

export default async function AdminBlueprintsPage() {
  await requireAdmin();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <section className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Admin tools
        </p>
        <h1 className="text-3xl font-semibold">
          Blueprint Engine is being rebuilt around AI Parsing observation.
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The previous Question/Practice Blueprint implementation has been
          rolled back. This placeholder keeps the admin route intentional while
          the next Blueprint design is rebuilt from the AI Parsing observation
          workflow.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Blueprint rebuild status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Old DeepSeek generation, provider runner shadow plans, and
            generated-drafts-to-review handoff are disabled on this route.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>No AI provider call is available here.</li>
            <li>No draft or Review queue write is triggered here.</li>
            <li>No taxonomy, AI import, provider gateway, or practice behavior is changed.</li>
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}

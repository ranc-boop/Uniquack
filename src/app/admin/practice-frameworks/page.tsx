import { archivePracticeFramework, createPracticeFramework } from "@/app/admin/practice-frameworks/actions";
import { PageFeedback } from "@/components/page-feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PracticeFrameworksPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("practice_course_frameworks")
    .select("*")
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Practice Frameworks</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload course frameworks that constrain practice direction while still allowing personalized remediation.
        </p>
      </div>
      <PageFeedback error={params.error ?? error?.message} saved={params.saved ? "Framework saved." : undefined} />
      <Card>
        <CardHeader>
          <CardTitle>Create framework</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createPracticeFramework} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" rows={3} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="framework_prompt">Framework prompt</Label>
              <Textarea id="framework_prompt" name="framework_prompt" required rows={8} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="learning_path">Learning path</Label>
              <Textarea
                id="learning_path"
                name="learning_path"
                placeholder="One node per line, or a JSON array."
                rows={4}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="allowed_tag_ids">Allowed tag IDs</Label>
              <Textarea
                id="allowed_tag_ids"
                name="allowed_tag_ids"
                placeholder="Optional: comma or newline separated taxonomy tag IDs."
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="priority_rules">Priority rules</Label>
              <Textarea id="priority_rules" name="priority_rules" rows={4} />
            </div>
            <Button className="w-fit" type="submit">Save framework</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Existing frameworks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data ?? []).length ? (data ?? []).map((framework) => (
            <div key={framework.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{framework.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{framework.description || "No description."}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {framework.status} / {framework.allowed_tag_ids?.length ?? 0} allowed tags
                  </p>
                </div>
                {framework.status === "active" ? (
                  <form action={archivePracticeFramework}>
                    <input name="id" type="hidden" value={framework.id} />
                    <Button size="sm" type="submit" variant="outline">Archive</Button>
                  </form>
                ) : null}
              </div>
            </div>
          )) : (
            <p className="text-sm text-muted-foreground">No frameworks yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

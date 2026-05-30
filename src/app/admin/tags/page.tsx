import { createTag, deleteTag, updateTag } from "@/app/admin/tags/actions";
import { DeleteSubmitButton } from "@/components/delete-submit-button";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageFeedback } from "@/components/page-feedback";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

type AdminTagsPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

export default async function AdminTagsPage({ searchParams }: AdminTagsPageProps) {
  const params = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const { data: tags, error } = await supabase
    .from("tags")
    .select("id, name, slug, parent_id, tag_type, status")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tags</h1>
        <p className="text-sm text-muted-foreground">
          Knowledge tags may have parents. Attribute tags must remain root
          level by database constraint.
        </p>
      </div>
      <PageFeedback error={params.error} saved={params.saved} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create tag</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createTag} className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="Newton's laws"
                required
                minLength={1}
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                name="slug"
                placeholder="newtons-laws"
                required
                minLength={1}
                maxLength={120}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                title="Use lowercase letters, numbers, and hyphens."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent_id">Parent</Label>
              <select
                id="parent_id"
                name="parent_id"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">None</option>
                {(tags ?? [])
                  .filter((tag) => tag.tag_type === "knowledge")
                  .map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Parent is only kept for knowledge tags. Attribute tags are saved
                at root level.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag_type">Type</Label>
              <select
                id="tag_type"
                name="tag_type"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                defaultValue="knowledge"
              >
                <option value="knowledge">Knowledge</option>
                <option value="attribute">Attribute</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                defaultValue="draft"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="flex items-end">
              <FormSubmitButton pendingLabel="Creating tag...">
                Create tag
              </FormSubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[260px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(tags ?? []).map((tag) => (
              <TableRow key={tag.id}>
                <TableCell>{tag.name}</TableCell>
                <TableCell className="font-mono text-xs">{tag.slug}</TableCell>
                <TableCell>{tag.tag_type}</TableCell>
                <TableCell className="font-mono text-xs">
                  {tag.parent_id ?? "-"}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{tag.status}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <form
                      action={updateTag}
                      className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto_auto]"
                    >
                      <input type="hidden" name="id" value={tag.id} />
                      <Input
                        name="name"
                        defaultValue={tag.name}
                        aria-label="Name"
                        required
                      />
                      <Input
                        name="slug"
                        defaultValue={tag.slug}
                        aria-label="Slug"
                        required
                        pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                        title="Use lowercase letters, numbers, and hyphens."
                      />
                      <select
                        name="parent_id"
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                        defaultValue={tag.parent_id ?? ""}
                        aria-label="Parent tag"
                      >
                        <option value="">No parent</option>
                        {(tags ?? [])
                          .filter(
                            (candidate) =>
                              candidate.id !== tag.id &&
                              candidate.tag_type === "knowledge",
                          )
                          .map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.name}
                            </option>
                          ))}
                      </select>
                      <select
                        name="tag_type"
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                        defaultValue={tag.tag_type}
                        aria-label="Tag type"
                      >
                        <option value="knowledge">Knowledge</option>
                        <option value="attribute">Attribute</option>
                      </select>
                      <select
                        name="status"
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                        defaultValue={tag.status}
                        aria-label="Status"
                      >
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                        <option value="archived">Archived</option>
                      </select>
                      <FormSubmitButton size="sm" pendingLabel="Saving...">
                        Save
                      </FormSubmitButton>
                    </form>
                    <form action={deleteTag}>
                      <input type="hidden" name="id" value={tag.id} />
                      <DeleteSubmitButton label={`tag ${tag.name}`} />
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!tags?.length ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No tags yet. Create an AP Physics or AP Calculus tag to start.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

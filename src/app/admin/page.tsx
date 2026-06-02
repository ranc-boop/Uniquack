import Link from "next/link";

import { createDemoContent } from "@/app/admin/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageFeedback } from "@/components/page-feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const cards = [
  {
    href: "/admin/questions",
    title: "Questions",
    body: "Create draft questions, change status, and delete records.",
  },
  {
    href: "/admin/tags",
    title: "Tags",
    body: "Manage knowledge-tree and attribute tags.",
  },
  {
    href: "/admin/videos",
    title: "Videos",
    body: "Bind one external video to one question.",
  },
  {
    href: "/admin/imports",
    title: "Batch import",
    body: "Validate JSON and create draft questions for review.",
  },
  {
    href: "/admin/users",
    title: "Users",
    body: "Super admin role management.",
  },
];

type AdminPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Foundation skeleton for content CRUD and role-protected management.
        </p>
      </div>
      <PageFeedback error={params.error} saved={params.saved} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Demo seed data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Creates AP Physics and AP Calculus tags, one published question, and
            one published video through the signed-in admin session. No
            elevated server key is used.
          </p>
          <form action={createDemoContent}>
            <FormSubmitButton pendingLabel="Creating demo data...">
              Create demo records
            </FormSubmitButton>
          </form>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <Card key={card.href}>
            <CardHeader>
              <CardTitle className="text-base">{card.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{card.body}</p>
              <Button asChild size="sm">
                <Link href={card.href}>Open</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

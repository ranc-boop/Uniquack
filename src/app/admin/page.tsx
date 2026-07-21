import Link from "next/link";

import { createDemoContent } from "@/app/admin/actions";
import { AdminActionGroup } from "@/components/admin/admin-action-group";
import { AdminCard } from "@/components/admin/admin-card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageFeedback } from "@/components/page-feedback";
import { Button } from "@/components/ui/button";

const experienceLinks = [
  { href: "/teacher", label: "Teacher Studio" },
  { href: "/practice", label: "Student Practice" },
  { href: "/questions", label: "Question Bank" },
  { href: "/videos", label: "Student Videos" },
];

const cards = [
  {
    href: "/admin/review",
    title: "Review Drafts",
    body: "Check draft readiness before publishing.",
  },
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
      <AdminPageHeader
        eyebrow="Admin"
        help="Review drafts, manage content, run imports, and keep the question library ready for teachers and students."
        helpLabel="Admin dashboard details"
        title="Dashboard"
      />
      <PageFeedback error={params.error} saved={params.saved} />
      <AdminCard
        description="Create safe demo content."
        help="Creates AP Physics and AP Calculus tags, one published question, and one published video through the signed-in admin session. No elevated server key is used."
        helpLabel="Demo seed data details"
        title="Demo seed data"
      >
        <form action={createDemoContent}>
          <FormSubmitButton pendingLabel="Creating demo data...">
            Create demo records
          </FormSubmitButton>
        </form>
      </AdminCard>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Platform operations</h2>
          <span className="text-sm text-muted-foreground">Manage</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {cards.map((card) => (
            <AdminCard
              actions={
                <AdminActionGroup
                  primary={
                    <Button asChild size="sm">
                      <Link href={card.href}>Open</Link>
                    </Button>
                  }
                />
              }
              description={card.body}
              key={card.href}
              title={card.title}
            />
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Product experience</h2>
          <span className="text-sm text-muted-foreground">Inspect</span>
        </div>
        <AdminCard
          description="Open the product as a teacher or student."
          help="These shortcuts preserve the admin role while letting you inspect the teacher and student experiences without leaving the admin workspace."
          helpLabel="Experience shortcuts"
          title="Teacher and student entry points"
        >
          <div className="flex flex-wrap gap-2">
            {experienceLinks.map((link) => (
              <Button asChild key={link.href} size="sm" variant="outline">
                <Link href={link.href}>{link.label}</Link>
              </Button>
            ))}
          </div>
        </AdminCard>
      </section>
    </div>
  );
}

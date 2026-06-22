import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const links = [
  {
    href: "/questions",
    title: "Questions",
    body: "Browse published AP questions with difficulty and tags.",
  },
  {
    href: "/practice",
    title: "Practice Agent",
    body: "Try the local-session MVP for agent-driven multi-round practice.",
  },
  {
    href: "/videos",
    title: "Videos",
    body: "Browse published explanations linked to their source question.",
  },
  {
    href: "/admin",
    title: "Admin",
    body: "Manage tags, questions, videos, and user roles with RLS-backed access.",
  },
];

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Badge variant="secondary">MVP demo</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">
          AI-powered AP content management platform for teachers and tutoring centers.
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          This demo focuses on the verified foundation: Supabase auth, RLS,
          role-protected admin routes, public published content, and the minimum
          content CRUD workflow. AI parsing and uploads are intentionally out of
          scope for this phase.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {links.map((item) => (
          <Card key={item.href}>
            <CardHeader>
              <CardTitle className="text-base">{item.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{item.body}</p>
              <Button asChild size="sm">
                <Link href={item.href}>Open</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

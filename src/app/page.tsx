import Link from "next/link";
import { BookOpen, ClipboardList, Play, Video } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const primaryActions = [
  {
    body: "Resume your latest saved session, generate a focused round, and keep memory across attempts.",
    href: "/practice",
    icon: Play,
    label: "Continue practice",
    title: "Practice workspace",
  },
  {
    body: "Search published questions, build a basket, and turn selected items into a custom round.",
    href: "/questions",
    icon: BookOpen,
    label: "Choose questions",
    title: "Question Bank",
  },
  {
    body: "Review active missed questions from saved snapshots and send them back into the current session.",
    href: "/mistakes",
    icon: ClipboardList,
    label: "Review mistakes",
    title: "Mistakes",
  },
];

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section className="rounded-md border bg-muted/20 p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Badge variant="secondary">Student workspace</Badge>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight">
              Practice smarter from question bank to mistake review.
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              O2I now centers the full learning loop: AI-guided practice, self-selected question baskets,
              single-question practice, saved session memory, and active mistake recovery.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link href="/practice">Start practice</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/questions">Open question bank</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {primaryActions.map((item) => {
          const Icon = item.icon;

          return (
            <Card key={item.href} className="shadow-none transition-colors duration-200 hover:border-sky-300">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-background">
                    <Icon className="size-4 text-sky-700" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Button asChild size="sm" variant="outline">
                  <Link href={item.href}>{item.label}</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">A continuous study path</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium text-foreground">1. Pick a direction</p>
              <p className="mt-1">Use an AI goal or build a hand-picked basket from the bank.</p>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium text-foreground">2. Practice and review</p>
              <p className="mt-1">Hints, answers, grading, and compact session memory stay attached.</p>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium text-foreground">3. Recover misses</p>
              <p className="mt-1">Wrong questions keep snapshots and return to practice when ready.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Video references</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3 text-sm text-muted-foreground">
              <Video className="mt-0.5 size-4 shrink-0 text-sky-700" aria-hidden="true" />
              <p>Browse published explanations linked to source questions when you want a worked walkthrough.</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/videos">Open videos</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

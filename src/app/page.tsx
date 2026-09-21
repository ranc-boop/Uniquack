import Link from "next/link";
import { ArrowRight, BookOpen, Brain, ClipboardList, Play, Sparkles, Video } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { translate } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";

export default async function HomePage() {
  const locale = await getRequestLocale();
  const primaryActions = [
    {
      body: translate(locale, "home.continuePracticeDescription"),
      href: "/practice",
      icon: Play,
      label: translate(locale, "home.continuePractice"),
      title: translate(locale, "home.practiceWorkspace"),
    },
    {
      body: translate(locale, "home.chooseQuestionsDescription"),
      href: "/questions",
      icon: BookOpen,
      label: translate(locale, "home.chooseQuestions"),
      title: translate(locale, "home.library"),
    },
    {
      body: translate(locale, "home.reviewMistakesDescription"),
      href: "/mistakes",
      icon: ClipboardList,
      label: translate(locale, "home.reviewMistakes"),
      title: translate(locale, "home.mistakes"),
    },
  ];

  return (
    <div className="space-y-7">
      <section className="student-hero overflow-hidden">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-center">
          <div className="space-y-5">
            <Badge className="border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-50" variant="outline">
              {translate(locale, "home.workspaceBadge")}
            </Badge>
            <div className="space-y-4">
              <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                {translate(locale, "home.heroTitle")}
              </h1>
              <p className="max-w-3xl text-base leading-7 text-slate-600">
                {translate(locale, "home.heroDescription")}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/practice">
                  {translate(locale, "home.startPractice")}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/questions">{translate(locale, "home.buildBasket")}</Link>
              </Button>
            </div>
          </div>
          <div className="student-soft-panel p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-lg bg-white shadow-sm">
                <Brain className="size-5 text-sky-700" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-950">{translate(locale, "home.studyLoop")}</p>
                <p className="text-sm text-slate-600">{translate(locale, "home.studyLoopDescription")}</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3">
              {[translate(locale, "home.chooseFocus"), translate(locale, "home.practiceSelected"), translate(locale, "home.reviewSavedMistakes")].map((step, index) => (
                <div className="flex items-center gap-3 rounded-md border border-sky-100 bg-white/85 p-3 shadow-sm" key={step}>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold text-slate-700">{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {primaryActions.map((item) => {
          const Icon = item.icon;

          return (
            <Card key={item.href} className="student-panel student-card-hover">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-sky-100 bg-sky-50">
                    <Icon className="size-5 text-sky-700" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-lg">{item.title}</CardTitle>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Button asChild size="sm" variant="outline">
                  <Link href={item.href}>
                    {item.label}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="student-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="size-5 text-amber-500" aria-hidden="true" />
              {translate(locale, "home.continuousPath")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-slate-600 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <p className="font-bold text-slate-950">{translate(locale, "home.pickDirection")}</p>
              <p className="mt-2 leading-6">{translate(locale, "home.pickDirectionDescription")}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <p className="font-bold text-slate-950">{translate(locale, "home.practiceReview")}</p>
              <p className="mt-2 leading-6">{translate(locale, "home.practiceReviewDescription")}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <p className="font-bold text-slate-950">{translate(locale, "home.recoverMisses")}</p>
              <p className="mt-2 leading-6">{translate(locale, "home.recoverMissesDescription")}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="student-panel">
          <CardHeader>
            <CardTitle className="text-xl">{translate(locale, "home.videoReferences")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3 text-sm leading-6 text-slate-600">
              <Video className="mt-0.5 size-5 shrink-0 text-sky-700" aria-hidden="true" />
              <p>{translate(locale, "home.videoReferencesDescription")}</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/videos">{translate(locale, "home.openVideos")}</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

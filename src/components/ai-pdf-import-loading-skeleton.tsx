import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

function SourceCardSkeleton() {
  return (
    <div className="space-y-3 rounded-md border bg-background p-3">
      <div className="flex items-start gap-2">
        <SkeletonBlock className="mt-0.5 size-4 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="h-4 w-2/3" />
          <SkeletonBlock className="h-3 w-1/2" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <SkeletonBlock className="h-6 w-24" />
        <SkeletonBlock className="h-6 w-24" />
        <SkeletonBlock className="h-6 w-32" />
      </div>
      <div className="flex flex-wrap gap-2">
        <SkeletonBlock className="h-9 w-32" />
        <SkeletonBlock className="h-9 w-40" />
        <SkeletonBlock className="h-9 w-24" />
      </div>
    </div>
  );
}

function DashboardBatchSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-5 w-2/3" />
          <SkeletonBlock className="h-4 w-1/2" />
        </div>
        <SkeletonBlock className="h-8 w-28" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <SkeletonBlock className="h-16 w-full" />
        <SkeletonBlock className="h-16 w-full" />
        <SkeletonBlock className="h-16 w-full" />
        <SkeletonBlock className="h-16 w-full" />
      </div>
    </div>
  );
}

export function AIPdfImportLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI PDF Import</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Loading AI PDF import controls... Upload, provider selection, source
            PDFs, and recent extraction batches will appear below.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/imports">Back to imports</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/ai-settings">AI settings</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import PDF with AI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Loading provider and private source PDF access...
          </div>

          <div className="space-y-3 rounded-md border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <SkeletonBlock className="h-5 w-40" />
                <SkeletonBlock className="h-4 w-72" />
              </div>
              <SkeletonBlock className="h-10 w-44" />
            </div>
            <div className="rounded-md border border-dashed bg-background p-6 text-center">
              <SkeletonBlock className="mx-auto h-10 w-10 rounded-full" />
              <SkeletonBlock className="mx-auto mt-3 h-4 w-64" />
              <SkeletonBlock className="mx-auto mt-2 h-3 w-80 max-w-full" />
            </div>
          </div>

          <div className="space-y-3 rounded-md border bg-muted/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <p className="text-sm font-medium">Uploaded PDF sources</p>
                <p className="text-xs text-muted-foreground">
                  Loading private source PDFs...
                </p>
              </div>
              <SkeletonBlock className="h-6 w-16" />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <SourceCardSkeleton />
              <SourceCardSkeleton />
            </div>
          </div>

          <div className="space-y-4 rounded-md border bg-muted/20 p-4">
            <div className="grid gap-4 xl:grid-cols-[1fr_1fr_0.9fr_auto]">
              <div className="space-y-2">
                <SkeletonBlock className="h-4 w-24" />
                <SkeletonBlock className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <SkeletonBlock className="h-4 w-44" />
                <SkeletonBlock className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <SkeletonBlock className="h-4 w-32" />
                <SkeletonBlock className="h-10 w-full" />
              </div>
              <div className="flex items-end">
                <SkeletonBlock className="h-10 w-40" />
              </div>
            </div>
            <div className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
              Loading extraction mode and source batch details...
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3" aria-busy="true" aria-label="Loading AI PDF import dashboard">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <SkeletonBlock className="h-5 w-48" />
            <SkeletonBlock className="h-4 w-72" />
          </div>
          <SkeletonBlock className="h-9 w-32" />
        </div>
        <DashboardBatchSkeleton />
        <DashboardBatchSkeleton />
      </section>
    </div>
  );
}

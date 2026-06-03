import Link from "next/link";

import { PackageImportPanel } from "@/components/package-import-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function AdminPackageImportPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Package import
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Import one ZIP package containing questions.json, images, and PDFs.
            The system previews everything first, creates draft questions, then
            attaches referenced assets for admin review.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/imports">Back to imports</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Supported package format</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Required: questions.json at the ZIP root. Optional files can be
            placed directly under images/ and pdfs/.
          </p>
          <p>
            Allowed: images/*.png, images/*.jpg, images/*.jpeg,
            images/*.webp, images/*.gif, and pdfs/*.pdf. SVG, nested ZIPs,
            path traversal, absolute paths, and unknown file types are rejected.
          </p>
          <p className="font-mono text-xs">
            questions.json references files using image_files and source_files,
            for example images/Q1001_diagram.png and pdfs/Q1001_source.pdf.
          </p>
        </CardContent>
      </Card>

      <PackageImportPanel />
    </div>
  );
}

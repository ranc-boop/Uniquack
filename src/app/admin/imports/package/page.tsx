import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PackageImportPanelLoader } from "@/components/package-import-panel-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function AdminPackageImportPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/imports">Back to imports</Link>
          </Button>
        }
        description="Import one ZIP package containing questions.json, images, and PDFs. The system previews everything first, creates draft questions, then attaches referenced assets for admin review."
        eyebrow="Import tools"
        title="Package import"
      />

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

      <PackageImportPanelLoader />
    </div>
  );
}

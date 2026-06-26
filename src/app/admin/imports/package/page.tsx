import Link from "next/link";

import { AdminCard } from "@/components/admin/admin-card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { PackageImportPanelLoader } from "@/components/package-import-panel-loader";
import { Button } from "@/components/ui/button";
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
        description="Preview a ZIP before importing."
        eyebrow="Import tools"
        help="Import one ZIP package containing questions.json, images, and PDFs. The system previews everything first, creates draft questions, then attaches referenced assets for admin review."
        helpLabel="Package import details"
        title="Package import"
      />

      <AdminCard
        badge={<AdminStatusBadge status="pending_review">Preview first</AdminStatusBadge>}
        description="Validate, preview, then import."
        help="Validate a ZIP package, inspect the import preview, then create draft questions and attach assets for Review Drafts."
        helpLabel="Package workflow details"
        title="Package import workflow"
      >
        <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-4">
          {[
            ["1", "Choose a ZIP package"],
            ["2", "Validate questions.json and assets"],
            ["3", "Preview questions and file references"],
            ["4", "Confirm package import"],
          ].map(([step, label]) => (
            <div
              className="rounded-md border bg-muted/20 p-3 leading-6"
              key={step}
            >
              <span className="mb-2 inline-flex size-6 items-center justify-center rounded-full border bg-background text-xs font-semibold text-foreground">
                {step}
              </span>
              <p>{label}</p>
            </div>
          ))}
        </div>
      </AdminCard>

      <AdminCard
        badge={<AdminStatusBadge status="info">ZIP contract</AdminStatusBadge>}
        description="Use safe predictable paths."
        help="Allowed files are images/*.png, images/*.jpg, images/*.jpeg, images/*.webp, images/*.gif, and pdfs/*.pdf. SVG, nested ZIPs, path traversal, absolute paths, and unknown file types are rejected. Imported questions remain drafts until reviewed."
        helpLabel="ZIP package contract details"
        title="Supported package format"
      >
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Required: questions.json at the ZIP root.
          </p>
          <p className="font-mono text-xs">
            questions.json references files using image_files and source_files,
            for example images/Q1001_diagram.png and pdfs/Q1001_source.pdf.
          </p>
        </div>
      </AdminCard>

      <PackageImportPanelLoader />
    </div>
  );
}

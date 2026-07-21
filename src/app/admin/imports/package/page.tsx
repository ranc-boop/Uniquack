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
        eyebrow="Import tools"
        help="Import one ZIP package containing questions.json, images, and PDFs. The system previews everything first, creates draft questions, then attaches referenced assets for admin review."
        helpLabel="Package import details"
        title="Package import"
      />

      <AdminCard
        badge={<AdminStatusBadge status="pending_review">Preview first</AdminStatusBadge>}
        help="Validate a ZIP package, inspect the import preview, then create draft questions and attach assets for Review Drafts."
        helpLabel="Package workflow details"
        title="Package import workflow"
      >
        <ol className="grid gap-2 text-sm md:grid-cols-4">
          {[
            "Choose ZIP",
            "Validate",
            "Preview",
            "Confirm",
          ].map((label) => (
            <li className="rounded-md border bg-muted/20 px-3 py-2 font-medium" key={label}>
              {label}
            </li>
          ))}
        </ol>
      </AdminCard>

      <AdminCard
        badge={<AdminStatusBadge status="info">ZIP contract</AdminStatusBadge>}
        help="Allowed files are images/*.png, images/*.jpg, images/*.jpeg, images/*.webp, images/*.gif, and pdfs/*.pdf. SVG, nested ZIPs, path traversal, absolute paths, and unknown file types are rejected. Imported questions remain drafts until reviewed."
        helpLabel="ZIP package contract details"
        title="Supported package format"
      />

      <PackageImportPanelLoader />
    </div>
  );
}

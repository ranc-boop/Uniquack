import { BatchImportJsonPanel } from "@/components/batch-import-json-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminImportsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: batches, error } = await supabase
    .from("import_batches")
    .select("id, source_type, status, summary, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Batch import</h1>
          <p className="text-sm text-muted-foreground">
            Manual JSON import pipeline for draft questions. Future AI parsing can
            feed normalized records into the same tables.
          </p>
          <p className="mt-2 max-w-3xl text-xs text-muted-foreground">
            Asset references are preserved for review only. Use Bulk asset upload
            to attach image and PDF files to imported drafts by filename prefix.
            Future package import will support questions.json + images + PDFs.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/imports/assets">Bulk asset upload</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manual JSON import</CardTitle>
        </CardHeader>
        <CardContent>
          <BatchImportJsonPanel />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent import batches</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error.message}
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Created</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Summary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(batches ?? []).map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell className="text-xs">
                        {new Date(batch.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>{batch.source_type}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{batch.status}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {JSON.stringify(batch.summary)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!batches?.length ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center">
                        No import batches yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

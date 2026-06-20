"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AdminAnalyticsActions() {
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleExport = () => {
    window.location.href = "/api/page-visits/export";
  };

  const handleDelete = async () => {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 5000);
      return;
    }

    setDeleting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/page-visits/delete", {
        method: "POST",
      });

      if (res.ok) {
        setMessage("All analytics data deleted.");
        setTimeout(() => window.location.reload(), 1200);
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(`Failed: ${(data as { error?: string }).error ?? "unknown"}`);
      }
    } catch {
      setMessage("Failed to delete. Try again.");
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Admin actions</CardTitle>
        <CardDescription>Export or reset analytics data.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <Button onClick={handleExport} variant="outline" size="sm">
          Export CSV
        </Button>
        <Button
          onClick={handleDelete}
          variant={confirming ? "destructive" : "outline"}
          size="sm"
          disabled={deleting}
        >
          {deleting
            ? "Deleting..."
            : confirming
              ? "Click again to confirm delete"
              : "Delete all analytics data"}
        </Button>
        {message ? (
          <span className="text-sm text-muted-foreground">{message}</span>
        ) : null}
      </CardContent>
    </Card>
  );
}

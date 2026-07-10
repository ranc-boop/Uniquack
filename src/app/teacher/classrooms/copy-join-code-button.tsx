"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CopyJoinCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      onClick={async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }}
      type="button"
      variant="outline"
    >
      <Copy aria-hidden="true" className="mr-2 h-4 w-4" />
      {copied ? "Copied" : "Copy code"}
    </Button>
  );
}

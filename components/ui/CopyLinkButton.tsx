"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";

/**
 * Copy a URL to the clipboard, with the copied state shown on the button.
 *
 * `navigator.clipboard` is secure-context only — https or localhost — which is
 * the same constraint `randomUuid()` works around in lib/utils.ts. Over plain
 * http on a LAN IP it is undefined, so the URL is shown in a prompt-style toast
 * instead of the button silently doing nothing.
 */
export function CopyLinkButton({
  url,
  label = "Copy link",
  title,
  size = "sm",
  variant = "secondary",
}: {
  url: string;
  label?: string;
  title?: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Not a failure worth an error toast: the operator can still take the
      // link, they just have to select it.
      toast.message("Copy it by hand — the clipboard needs https", {
        description: url,
        duration: 10_000,
      });
    }
  }

  return (
    <Button size={size} variant={variant} onClick={copy} title={title ?? url}>
      {copied ? "Copied" : label}
    </Button>
  );
}

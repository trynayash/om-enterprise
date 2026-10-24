"use client";
import Link from "next/link";
import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaperSheet, SheetStamp } from "@/components/ui/paper-sheet";

/** Any page that fails to load. The reference matches the server log entry for the failure. */
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const reference = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;

  return (
    <PaperSheet stamp={<SheetStamp>Error</SheetStamp>}>
      <h1 className="headline text-[2.25rem] font-bold text-navy-950">This page didn&apos;t load</h1>
      <p className="mt-2 text-sm leading-relaxed text-navy-500">This is usually a brief connection problem. Try again in a moment.</p>
      {reference && (
        <p className="mt-4 font-mono text-[11.5px] text-navy-500">
          Reference <span className="text-navy-900">{reference}</span>
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Button onClick={() => retry()} icon={<RotateCcw className="h-4 w-4" />}>
          Try again
        </Button>
        <Link href="/" className="link-draw text-sm font-semibold text-navy-950">
          Go to the home page
        </Link>
      </div>
    </PaperSheet>
  );
}

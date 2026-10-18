"use client";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  // Neutralise spreadsheet formula injection (=, +, -, @ at the start of text values)
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Download the rows currently shown as a CSV file (UTF-8 with BOM for Excel). */
export function CsvExportButton({ rows, filename, label = "Export CSV" }: { rows: Record<string, unknown>[]; filename: string; label?: string }) {
  return (
    <Button
      variant="outline"
      icon={<Download className="h-4 w-4" />}
      disabled={!rows.length}
      onClick={() => {
        const headers = Object.keys(rows[0]);
        const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\r\n");
        const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      {label}
    </Button>
  );
}

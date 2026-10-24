"use client";
import { useState } from "react";
import { FileDown } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Select } from "@/components/ui/field";

/**
 * Choose which copy label is printed on the PDF (Rule 48: original / duplicate / triplicate).
 * The first choice says what the PDF route will actually stamp: "Original for recipient" the first
 * time, "Reprint (copy n)" once the document has been printed or downloaded.
 */
export function PdfCopySelector({ documentId, printCount }: { documentId: string; printCount: number }) {
  const [copy, setCopy] = useState("original");
  return (
    <div className="no-print flex items-center gap-2">
      <div className="w-56">
        <Select aria-label="PDF copy" value={copy} onChange={(e) => setCopy(e.target.value)}>
          <option value="original">{printCount > 0 ? `Reprint (copy ${printCount + 1})` : "Original for recipient"}</option>
          <option value="duplicate">Duplicate copy</option>
          <option value="triplicate">Triplicate — for supplier</option>
        </Select>
      </div>
      <a className={buttonClass("outline", "md", "whitespace-nowrap")} href={`/api/documents/${documentId}/pdf${copy === "original" ? "" : `?copy=${copy}`}`} target="_blank" rel="noopener noreferrer">
        <FileDown className="h-4 w-4" /> Open PDF
      </a>
    </div>
  );
}

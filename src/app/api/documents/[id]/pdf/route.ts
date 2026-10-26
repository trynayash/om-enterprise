import { api } from "@/server/http";
import { getDocument, recordPrint } from "@/server/services/documents";
import { renderDocumentPdf } from "@/server/pdf/document-pdf";
import { customerCopyLabel } from "@/lib/bill-layout";

export const GET = api({ permission: ["documents.reprint", "documents.issue"] }, async ({ actor, params, query }) => {
  const doc = await getDocument(actor, params.id);
  const copy = query.get("copy");
  // "customer": the customer's copy, handed to WhatsApp on the counter phone. Labelled like an emailed
  // bill, and not a print.
  if (copy !== "customer") await recordPrint(actor, doc.id, "pdf");
  const pdf = await renderDocumentPdf(doc.snapshot, {
    status: doc.status,
    cancelReason: doc.cancelReason,
    copyLabel:
      copy === "customer" || doc.docType === "quotation"
        ? customerCopyLabel(doc.docType)
        : copy === "duplicate"
          ? "Duplicate copy"
          : copy === "triplicate"
            ? "Triplicate — for supplier"
            : doc.printCount > 0
              ? `Reprint (copy ${doc.printCount + 1})`
              : "Original for recipient",
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${query.get("download") === "1" ? "attachment" : "inline"}; filename="${doc.docNumber.replace(/\//g, "-")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});

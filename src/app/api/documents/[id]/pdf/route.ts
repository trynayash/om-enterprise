import { api } from "@/server/http";
import { getDocument, recordPrint } from "@/server/services/documents";
import { renderDocumentPdf } from "@/server/pdf/document-pdf";

export const GET = api({ permission: ["documents.reprint", "documents.issue"] }, async ({ actor, params, query }) => {
  const doc = await getDocument(actor, params.id);
  await recordPrint(actor, doc.id, "pdf");
  const copy = query.get("copy");
  const pdf = await renderDocumentPdf(doc.snapshot, {
    status: doc.status,
    cancelReason: doc.cancelReason,
    copyLabel: copy === "duplicate" ? "Duplicate copy" : copy === "triplicate" ? "Triplicate — for supplier" : doc.printCount > 0 ? `Reprint (copy ${doc.printCount + 1})` : "Original for recipient",
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${query.get("download") === "1" ? "attachment" : "inline"}; filename="${doc.docNumber.replace(/\//g, "-")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});

import { Suspense } from "react";
import Link from "next/link";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { getDocument } from "@/server/services/documents";
import { emailInfoFor } from "@/server/services/document-email";
import { whatsappInfoFor } from "@/server/services/document-whatsapp";
import { DocumentView } from "@/components/documents/document-view";
import { DocumentActions } from "@/components/documents/document-actions";
import { Alert, PageHeader, PageSkeleton } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/badge";
import { TrainingBadge } from "@/components/staff/labels";
import { DateTime } from "@/components/ui/money";
import { PdfCopySelector } from "@/components/dashboard/ops/pdf-copy";
import { ClientOnly } from "@/components/dashboard/ops/client-only";
import { DOC_LABEL, loadOr404 } from "@/components/dashboard/ops/guard";
import { BackLink } from "@/components/dashboard/back-link";
import { TitleStamps } from "@/components/dashboard/title-stamps";
import { DeleteRecord } from "@/components/dashboard/ops/delete-record";
import { deletePhrase } from "@/lib/delete-phrase";

export const metadata = { title: "Document" };

export default function DocumentPage({
  params,
}: PageProps<"/dashboard/documents/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DocumentDetail params={params} />
    </Suspense>
  );
}

async function DocumentDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor([
    "documents.reprint",
    "documents.issue",
    "sales.view_all",
  ]);
  const { id } = await params;
  const doc = await loadOr404(getDocument(actor, id));
  const s = doc.snapshot;

  return (
    // Same A4-width sheet as the POS bill page, so a bill looks identical in both places.
    <div className="mx-auto w-full max-w-[210mm] space-y-4 print:max-w-none">
      <div className="no-print space-y-4">
        <div>
          <BackLink href="/dashboard/documents">All documents</BackLink>
          <PageHeader
            eyebrow={DOC_LABEL[doc.docType] ?? doc.docType}
            title={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="tabular text-[0.72em] font-semibold tracking-tight">{doc.docNumber}</span>
                <TitleStamps>
                  <StatusBadge status={doc.status} />
                  {doc.isTraining && <TrainingBadge />}
                </TitleStamps>
              </span>
            }
            description={
              <>
                Issued by {doc.issuedByName} on <DateTime value={doc.issuedAt} /> · sale{" "}
                <Link href={`/dashboard/sales/${doc.saleId}`} className="tabular font-medium text-navy-700 underline-offset-[3px] hover:underline">
                  {s.saleNumber}
                </Link>
                {doc.printCount > 0 && (
                  <>
                    {" "}
                    · printed/downloaded {doc.printCount}× (last <DateTime value={doc.lastPrintedAt} />)
                  </>
                )}
              </>
            }
          />
        </div>
        {/*
          One row of actions. The shared actions' own "PDF" download is left out here: the copy selector's
          "Open PDF" does the same job and also lets the duplicate / triplicate copy be chosen.
        */}
        <div className="-mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-navy-200 pb-3">
          <ClientOnly fallback={<div className="h-10" />}>
            <DocumentActions
              documentId={doc.id}
              docNumber={doc.docNumber}
              title={s.title}
              grandTotal={s.totals.grandTotal}
              shareToken={doc.status === "issued" ? doc.shareToken : null}
              businessName={s.seller.name}
              canShare={can(actor, "documents.share")}
              showPdf={doc.docType === "quotation"}
              email={await emailInfoFor(doc)}
          whatsapp={await whatsappInfoFor(doc)}
            />
          </ClientOnly>
          <div className="flex flex-wrap items-center gap-2">
            {doc.docType !== "quotation" && <PdfCopySelector documentId={doc.id} printCount={doc.printCount} />}
            {actor.isSuperAdmin && doc.docType === "quotation" && (
              <DeleteRecord kind="quotation" id={doc.id} name={doc.docNumber} phrase={deletePhrase(actor.username)} consequences={[]} afterDelete="/dashboard/documents" />
            )}
          </div>
        </div>
        {doc.status === "cancelled" && (
          <Alert tone="danger" title="This document has been cancelled">
            {doc.cancelReason}{" "}
            {doc.cancelledAt && (
              <>
                · <DateTime value={doc.cancelledAt} />
              </>
            )}
            . It keeps its number and stays on record; the number will never be
            reused.
          </Alert>
        )}
        {doc.docType === "quotation" && doc.validUntil && (
          <Alert tone={doc.validUntil < new Date() ? "warning" : "info"}>
            {doc.validUntil < new Date()
              ? "This quotation has expired"
              : "Quoted prices are held until"}{" "}
            <DateTime value={doc.validUntil} />.
          </Alert>
        )}
        {s.original && (
          <p className="text-sm text-navy-600">
            Credit note against <span className="tabular font-medium text-navy-900">{s.original.number}</span>
            {s.reason ? ` — ${s.reason}` : ""}
          </p>
        )}
      </div>
      <div className="animate-rise overflow-hidden rounded-md border border-navy-200 bg-white shadow-[0_1px_0_rgb(13_27_48/0.04),0_18px_40px_-24px_rgb(13_27_48/0.35)] print:animate-none print:rounded-none print:border-0 print:shadow-none">
        <DocumentView
          snapshot={s}
          status={doc.status}
          cancelReason={doc.cancelReason}
          // Matches what the PDF stamps (and the POS bill page): the original until it has been printed once.
          copyLabel={doc.docType === "quotation" ? null : doc.printCount > 0 ? "Reprint" : "Original for recipient"}
        />
      </div>
    </div>
  );
}

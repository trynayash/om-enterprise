import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { getDocument } from "@/server/services/documents";
import { DocumentView } from "@/components/documents/document-view";
import { DocumentActions } from "@/components/documents/document-actions";
import { Alert, PageSkeleton } from "@/components/ui/page";
import { Badge, SampleBadge, StatusBadge } from "@/components/ui/badge";
import { DateTime } from "@/components/ui/money";
import { PdfCopySelector } from "@/components/dashboard/ops/pdf-copy";
import { ClientOnly } from "@/components/dashboard/ops/client-only";
import { DOC_LABEL, loadOr404 } from "@/components/dashboard/ops/guard";

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
    <div className="space-y-5">
      <div className="no-print space-y-4">
        <Link
          href="/dashboard/documents"
          className="inline-flex items-center gap-1 text-sm font-semibold text-navy-600 hover:text-navy-900"
        >
          <ArrowLeft className="h-4 w-4" /> All documents
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-gold-600">
              {DOC_LABEL[doc.docType] ?? doc.docType}
            </div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
              <span className="tabular">{doc.docNumber}</span>
              <StatusBadge status={doc.status} />
              {doc.isTraining && <SampleBadge label="Training" />}
            </h1>
            <p className="mt-1 text-sm text-navy-500">
              Issued by {doc.issuedByName} on <DateTime value={doc.issuedAt} />{" "}
              · sale{" "}
              <Link
                href={`/dashboard/sales/${doc.saleId}`}
                className="font-semibold text-navy-700 hover:underline"
              >
                {s.saleNumber}
              </Link>
              {doc.printCount > 0 && (
                <>
                  {" "}
                  · printed/downloaded {doc.printCount}× (last{" "}
                  <DateTime value={doc.lastPrintedAt} />)
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PdfCopySelector documentId={doc.id} />
          </div>
        </div>
        <ClientOnly fallback={<div className="h-10" />}>
          <DocumentActions
            documentId={doc.id}
            docNumber={doc.docNumber}
            title={s.title}
            grandTotal={s.totals.grandTotal}
            shareToken={doc.status === "issued" ? doc.shareToken : null}
            customerMobile={s.buyer?.mobile}
            businessName={s.seller.name}
            canShare={can(actor, "documents.share")}
          />
        </ClientOnly>
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
            Credit note against <Badge tone="navy">{s.original.number}</Badge>
            {s.reason ? ` — ${s.reason}` : ""}
          </p>
        )}
      </div>
      <div className="overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-card print:border-0 print:shadow-none">
        <DocumentView
          snapshot={s}
          status={doc.status}
          cancelReason={doc.cancelReason}
          copyLabel={doc.printCount > 0 ? "Reprint" : null}
        />
      </div>
    </div>
  );
}

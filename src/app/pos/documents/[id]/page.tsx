import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { getDocument } from "@/server/services/documents";
import { toAppError } from "@/server/errors";
import { DocumentView } from "@/components/documents/document-view";
import { DocumentActions } from "@/components/documents/document-actions";
import { NewSaleButton } from "@/components/pos/new-sale-button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { EmptyState, PageSkeleton } from "@/components/ui/page";
import { LinkButton } from "@/components/ui/button";
import { DOC_TYPE_LABEL } from "@/lib/document-types";

export const metadata = { title: "Document" };

export default function PosDocumentPage({ params }: PageProps<"/pos/documents/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DocumentLoader params={params} />
    </Suspense>
  );
}

async function DocumentLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageActor("sales.create");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let doc: Awaited<ReturnType<typeof getDocument>>;
  try {
    doc = await getDocument(actor, id);
  } catch (err) {
    const e = toAppError(err);
    if (e.code === "NOT_FOUND") notFound();
    return <EmptyState icon={<ShieldAlert className="h-10 w-10" />} title="This document can't be opened" description={e.message} action={<LinkButton href="/pos">Back to POS</LinkButton>} />;
  }
  const s = doc.snapshot;
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-3">
        <Link href={`/pos/sale/${doc.saleId}`} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-navy-600 hover:bg-white">
          <ArrowLeft className="h-4 w-4" /> Sale {s.saleNumber}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-extrabold text-navy-900">
            {DOC_TYPE_LABEL[doc.docType]} <span className="font-mono">{doc.docNumber}</span>
          </h1>
          <StatusBadge status={doc.status} />
          {doc.isTraining && <Badge tone="red">Training — not a valid bill</Badge>}
        </div>
        <div className="ml-auto">
          <NewSaleButton variant="button" />
        </div>
      </div>
      <div className="no-print rounded-2xl border border-navy-100 bg-white p-3 shadow-card">
        <DocumentActions
          documentId={doc.id}
          docNumber={doc.docNumber}
          title={s.title}
          grandTotal={s.totals.grandTotal}
          shareToken={doc.shareToken}
          customerMobile={s.buyer?.mobile ?? null}
          businessName={s.seller.name}
          canShare={can(actor, "documents.share")}
        />
      </div>
      <div className="overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-card print:rounded-none print:border-0 print:shadow-none">
        <DocumentView
          snapshot={s}
          status={doc.status}
          cancelReason={doc.cancelReason}
          copyLabel={doc.docType === "quotation" ? null : doc.printCount > 0 ? "Reprint" : "Original for recipient"}
        />
      </div>
    </div>
  );
}

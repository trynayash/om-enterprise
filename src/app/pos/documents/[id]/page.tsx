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
    <div className="mx-auto w-full max-w-[210mm] space-y-4 print:max-w-none">
      <div className="no-print flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href={`/pos/sale/${doc.saleId}`} className="inline-flex h-9 items-center gap-1.5 rounded-md pr-1 text-sm font-medium text-navy-500 transition-colors hover:text-navy-950">
          <ArrowLeft className="h-4 w-4" /> Sale {s.saleNumber}
        </Link>
        <span aria-hidden className="hidden h-6 w-px bg-navy-200 sm:block" />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold text-navy-950">
            {DOC_TYPE_LABEL[doc.docType]} <span className="font-mono text-[17px]">{doc.docNumber}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={doc.status} />
            {doc.isTraining && <Badge tone="red">Training — not a valid bill</Badge>}
          </div>
        </div>
        <div className="ml-auto">
          <NewSaleButton variant="button" />
        </div>
      </div>
      <div className="no-print border-y border-navy-200 py-3">
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
      <div className="animate-rise overflow-hidden rounded-md border border-navy-200 bg-white shadow-[0_1px_0_rgb(13_27_48/0.04),0_18px_40px_-24px_rgb(13_27_48/0.35)] print:animate-none print:rounded-none print:border-0 print:shadow-none">
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

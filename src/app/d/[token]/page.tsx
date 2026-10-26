import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { getDocumentByShareToken } from "@/server/services/documents";
import { enforceRateLimit, hashIp } from "@/server/rate-limit";
import { clientInfoFromHeaders } from "@/server/auth/session";
import { DocumentView } from "@/components/documents/document-view";
import { LogoMark } from "@/components/ui/logo";
import { Skeleton } from "@/components/ui/page";
import { LinkButton, buttonClass } from "@/components/ui/button";
import { customerCopyLabel, documentTitle } from "@/lib/bill-layout";
import { PrintButton } from "./print-button";

export const metadata: Metadata = {
  title: "Your bill",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function SharedDocumentPage({ params }: PageProps<"/d/[token]">) {
  return (
    <div className="min-h-screen bg-navy-50/70 print:bg-white">
      <Suspense fallback={<SharedSkeleton />}>
        <SharedDocument params={params} />
      </Suspense>
    </div>
  );
}

function SharedSkeleton() {
  return (
    <>
      <div className="h-[61px] border-b border-navy-200 bg-white" />
      <div className="mx-auto max-w-[210mm] px-3 py-6 sm:px-4 sm:py-10">
        <Skeleton className="h-[70vh] rounded-md" />
      </div>
    </>
  );
}

async function loadShared(token: string) {
  await connection();
  try {
    await enforceRateLimit(`share-view:${hashIp(clientInfoFromHeaders(await headers()).ip)}`, 60, 600);
    return { doc: await getDocumentByShareToken(token), limited: false };
  } catch (err) {
    const limited = (err as { code?: string })?.code === "RATE_LIMITED";
    if (!limited) console.error("[share] document unavailable", err);
    return { doc: null, limited };
  }
}

async function SharedDocument({ params }: { params: PageProps<"/d/[token]">["params"] }) {
  const { token } = await params;
  const { doc, limited } = await loadShared(token);

  if (!doc) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
        <LogoMark className="h-12 w-12" />
        <div className="mt-8 w-full max-w-md rounded-xl border border-navy-200 bg-paper/60 px-6 py-10 text-center">
          <h1 className="headline text-[1.625rem] font-bold text-navy-950">{limited ? "Please try again shortly" : "This link isn't available"}</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-navy-600">
            {limited
              ? "Too many requests came from this device. Wait a few minutes and reload the page."
              : "The link may be mistyped, or the shop has withdrawn it. Please contact OM ENTERPRISE for a fresh copy of your bill."}
          </p>
          <LinkButton href="/" className="mt-6">
            Visit our website
          </LinkButton>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="no-print sticky top-0 z-10 border-b border-navy-200 bg-white">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <LogoMark className="h-9 w-9" />
            <div className="min-w-0 leading-tight">
              <div className="text-[13px] font-bold text-navy-950">{doc.snapshot.seller.name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-navy-500">
                <span>
                  {documentTitle(doc.snapshot)} <span className="tabular text-navy-700">{doc.docNumber}</span>
                </span>
                {doc.status === "cancelled" && (
                  <span className="rounded-[3px] bg-red-50 px-1.5 py-px text-xs font-medium text-red-800 ring-1 ring-inset ring-red-200">Cancelled</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PrintButton />
            <a href={`/d/${encodeURIComponent(token)}/pdf`} className={buttonClass("primary", "md")}>
              <Download className="h-4 w-4" /> PDF
            </a>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[210mm] px-2 py-5 sm:px-4 sm:py-10 print:p-0">
        <div className="animate-rise overflow-hidden rounded-md border border-navy-200 bg-white shadow-[0_1px_0_rgb(13_27_48/0.04),0_18px_40px_-24px_rgb(13_27_48/0.35)] print:animate-none print:rounded-none print:border-0 print:shadow-none">
          <DocumentView snapshot={doc.snapshot} status={doc.status} cancelReason={doc.cancelReason} copyLabel={customerCopyLabel(doc.docType)} />
        </div>
        <p className="no-print mt-4 text-center text-xs text-navy-500">This is a secure link to your document. Please don&apos;t share it with others.</p>
      </main>
    </>
  );
}

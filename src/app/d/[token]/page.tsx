import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { Download, FileX2 } from "lucide-react";
import { getDocumentByShareToken } from "@/server/services/documents";
import { enforceRateLimit, hashIp } from "@/server/rate-limit";
import { clientInfoFromHeaders } from "@/server/auth/session";
import { DocumentView } from "@/components/documents/document-view";
import { LogoMark } from "@/components/ui/logo";
import { Skeleton } from "@/components/ui/page";
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
      <div className="h-16 bg-navy-900" />
      <div className="mx-auto max-w-[210mm] px-4 py-8">
        <Skeleton className="h-[60vh] rounded-2xl" />
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
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <LogoMark className="h-14 w-14" />
        <FileX2 className="mt-8 h-12 w-12 text-navy-300" />
        <h1 className="mt-4 text-2xl font-extrabold text-navy-900">{limited ? "Please try again shortly" : "This link isn't available"}</h1>
        <p className="mt-2 max-w-md text-sm text-navy-500">
          {limited
            ? "Too many requests came from this device. Wait a few minutes and reload the page."
            : "The link may be mistyped, or the shop has withdrawn it. Please contact OM ENTERPRISE for a fresh copy of your bill."}
        </p>
        <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-xl bg-navy-900 px-5 text-sm font-semibold text-white hover:bg-navy-800">
          Visit our website
        </Link>
      </div>
    );
  }

  return (
    <>
      <header className="no-print sticky top-0 z-10 bg-navy-900 text-white shadow-card">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <LogoMark className="h-9 w-9" />
            <div className="leading-tight">
              <div className="text-sm font-extrabold tracking-[0.08em]">{doc.snapshot.seller.name}</div>
              <div className="text-xs text-navy-300">
                {doc.snapshot.title} {doc.docNumber}
                {doc.status === "cancelled" && <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Cancelled</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PrintButton />
            <a href={`/d/${encodeURIComponent(token)}/pdf`} className="inline-flex h-10 items-center gap-2 rounded-lg bg-gold-500 px-4 text-sm font-bold text-navy-950 hover:bg-gold-400">
              <Download className="h-4 w-4" /> PDF
            </a>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[210mm] px-2 py-6 sm:px-4 sm:py-8 print:p-0">
        <div className="overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-card print:rounded-none print:border-0 print:shadow-none">
          <DocumentView snapshot={doc.snapshot} status={doc.status} cancelReason={doc.cancelReason} copyLabel="Customer copy" />
        </div>
        <p className="no-print mt-4 text-center text-xs text-navy-500">This is a secure link to your document. Please don&apos;t share it with others.</p>
      </main>
    </>
  );
}

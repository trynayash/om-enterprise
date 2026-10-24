"use client";
import { useState, useSyncExternalStore } from "react";
import { Copy, Download, MessageCircle, Printer } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import { whatsappLink } from "@/lib/india";

/** Print / PDF / share controls for an issued document. */
export function DocumentActions({
  documentId,
  docNumber,
  title,
  grandTotal,
  shareToken,
  customerMobile,
  businessName = "OM ENTERPRISE",
  canShare = true,
  showPdf = true,
}: {
  documentId: string;
  docNumber: string;
  title: string;
  grandTotal: string;
  shareToken: string | null;
  customerMobile?: string | null;
  businessName?: string;
  canShare?: boolean;
  /** Off where the page has its own PDF control (the dashboard's copy selector). */
  showPdf?: boolean;
}) {
  const toast = useToast();
  const [printing, setPrinting] = useState(false);
  // Read the origin without a server/client mismatch (null during SSR, real value after hydration).
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => null,
  );
  const shareUrl = shareToken && origin ? `${origin}/d/${shareToken}` : null;

  const print = async () => {
    setPrinting(true);
    try {
      await apiFetch(`/api/documents/${documentId}/print`, { method: "POST", body: {} });
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setPrinting(false);
      window.print();
    }
  };

  const message = `${businessName}: your ${title.toLowerCase()} ${docNumber} for ${formatINR(grandTotal)}.${shareUrl ? ` View / download: ${shareUrl}` : ""} Thank you!`;

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <Button onClick={print} loading={printing} icon={<Printer className="h-4 w-4" />}>
        Print
      </Button>
      {showPdf && (
        <a className={buttonClass("outline")} href={`/api/documents/${documentId}/pdf?download=1`}>
          <Download className="h-4 w-4" /> PDF
        </a>
      )}
      {canShare && shareUrl && (
        <>
          <span aria-hidden className="mx-1 hidden h-6 w-px bg-navy-200 sm:block" />
          <a className={buttonClass("success")} href={whatsappLink(customerMobile || "", message)} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </a>
          <Button
            variant="ghost"
            icon={<Copy className="h-4 w-4" />}
            onClick={async () => {
              await navigator.clipboard.writeText(shareUrl);
              toast("Customer link copied");
            }}
          >
            Copy link
          </Button>
        </>
      )}
    </div>
  );
}

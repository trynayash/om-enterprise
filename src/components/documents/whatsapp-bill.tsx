"use client";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { MessageCircle } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatPhone, normalizeMobile, whatsappLink } from "@/lib/india";
import type { DocumentWhatsAppInfo } from "@/lib/document-types";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Phones that can hand a file to WhatsApp (the share sheet); read after hydration. */
function useCanShareFiles() {
  return useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([""], "bill.pdf", { type: "application/pdf" })] });
      } catch {
        return false;
      }
    },
    () => false,
  );
}

/**
 * "WhatsApp" for a bill. When the shop's number is connected to WhatsApp's business platform, one
 * click sends the PDF from that number to the customer's WhatsApp. Until then it opens WhatsApp on
 * this device, in the customer's chat, with the bill's link (and on phones the PDF itself can be
 * shared instead).
 *
 * Returned in three parts, like the email control, so the page keeps the button with the others and
 * the note under them. Nothing is shown (all null) for a document that can't be shared.
 */
export function useWhatsAppBill(documentId: string, docNumber: string, info: DocumentWhatsAppInfo | undefined, message: string): { button: ReactNode; note: ReactNode; dialog: ReactNode } {
  const toast = useToast();
  const canShareFiles = useCanShareFiles();
  const [sending, setSending] = useState(false);
  const [asking, setAsking] = useState(false);
  const [number, setNumber] = useState("");
  const [save, setSave] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState(info?.last ?? null);
  if (!info) return { button: null, note: null, dialog: null };
  const to = info.to;

  const send = async (typed: string | null) => {
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch<{ to: string; at: string }>(`/api/documents/${documentId}/whatsapp`, { method: "POST", body: { to: typed, saveToCustomer: !!typed && save } });
      setLast({ to: res.to, at: new Date(res.at).toISOString(), count: (last?.count ?? 0) + 1 });
      setAsking(false);
      toast(`Bill sent on WhatsApp to ${formatPhone(res.to)}`);
    } catch (e) {
      if (asking) setError(errorMessage(e));
      else toast(errorMessage(e), "error");
    } finally {
      setSending(false);
    }
  };

  // Without the shop's number connected: the PDF file through the phone's share sheet.
  const shareFile = async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}/pdf?copy=customer`, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Could not get the PDF. Try again.");
      const file = new File([await res.blob()], `${docNumber.replace(/\//g, "-")}.pdf`, { type: "application/pdf" });
      await navigator.share({ files: [file], text: message });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast(errorMessage(e), "error");
    }
  };

  const typed = number.trim();
  const typedOk = !!normalizeMobile(typed);
  const button = info.ready ? (
    <Button
      variant="success"
      icon={<MessageCircle className="h-4 w-4" />}
      loading={sending && !asking}
      disabled={!!info.blocked}
      title={info.blocked ?? (to ? `Send to ${formatPhone(to)} on WhatsApp` : "Enter the customer's WhatsApp number")}
      data-testid="whatsapp-bill"
      onClick={() => {
        if (to) void send(null);
        else {
          setError(null);
          setAsking(true);
        }
      }}
    >
      {last ? "WhatsApp again" : "WhatsApp"}
    </Button>
  ) : (
    <a
      className={buttonClass("success")}
      href={to ? whatsappLink(to, message) : `https://wa.me/?text=${encodeURIComponent(message)}`}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="whatsapp-bill"
    >
      <MessageCircle className="h-4 w-4" /> WhatsApp
    </a>
  );

  const other = (label: string) => (
    <button
      type="button"
      className="font-medium text-navy-600 underline underline-offset-[3px] hover:text-navy-950"
      onClick={() => {
        setNumber("");
        setError(null);
        setAsking(true);
      }}
    >
      {label}
    </button>
  );
  const note = (
    <p className="basis-full text-xs leading-relaxed text-navy-500" data-testid="whatsapp-note">
      {info.blocked ? (
        info.blocked
      ) : info.ready ? (
        <>
          {last ? (
            <>
              Sent on WhatsApp to <span className="tabular text-navy-700">{formatPhone(last.to)}</span> · {when(last.at)}
            </>
          ) : to ? (
            <>
              WhatsApp sends the PDF to <span className="tabular text-navy-700">{formatPhone(to)}</span> from the shop&apos;s number
            </>
          ) : (
            "No WhatsApp number on this bill"
          )}
          {" · "}
          {other(to ? "send to another number" : "enter a number")}
        </>
      ) : (
        <>
          WhatsApp opens on this device
          {to ? (
            <>
              {" "}
              in <span className="tabular text-navy-700">{formatPhone(to)}</span>&apos;s chat
            </>
          ) : null}{" "}
          with the bill&apos;s link
          {canShareFiles && (
            <>
              {" · "}
              <button type="button" className="font-medium text-navy-600 underline underline-offset-[3px] hover:text-navy-950" onClick={shareFile}>
                send the PDF file instead
              </button>
            </>
          )}
        </>
      )}
    </p>
  );
  const dialog = info.ready ? (
    <Dialog
      open={asking}
      onClose={() => setAsking(false)}
      size="sm"
      title="Send this bill on WhatsApp"
      description="The bill is sent as a PDF from the shop's WhatsApp number."
      footer={
        <>
          <Button variant="ghost" onClick={() => setAsking(false)}>
            Cancel
          </Button>
          <Button variant="success" loading={sending} disabled={!typedOk} icon={<MessageCircle className="h-4 w-4" />} onClick={() => send(typed)}>
            Send bill
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Customer's WhatsApp number" htmlFor="wa-to" error={typed && !typedOk ? "That is not a valid 10-digit Indian number." : null}>
          <Input id="wa-to" className="tabular" inputMode="tel" autoComplete="off" autoFocus value={number} onChange={(e) => setNumber(e.target.value)} maxLength={16} />
        </Field>
        <Checkbox label="Keep this as the customer's WhatsApp number" checked={save} onChange={(e) => setSave(e.target.checked)} />
      </div>
    </Dialog>
  ) : null;
  return { button, note, dialog };
}

"use client";
import { useState, type ReactNode } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { isValidEmail } from "@/lib/india";
import type { DocumentEmailInfo } from "@/lib/document-types";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * "Email" for a bill: one click sends it to the customer's address taken at the counter. Without an
 * address on the bill, a small box asks for one (and can keep it on the customer); "another address"
 * does the same when the customer wants it sent elsewhere.
 *
 * Returned in three parts so the page can keep the button among the others and put the note under all
 * of them. Nothing is shown (all three are null) for a document that can't be emailed at all.
 */
export function useEmailBill(documentId: string, info: DocumentEmailInfo | undefined): { button: ReactNode; note: ReactNode; dialog: ReactNode } {
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [asking, setAsking] = useState(false);
  const [address, setAddress] = useState("");
  const [save, setSave] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState(info?.last ?? null);
  if (!info) return { button: null, note: null, dialog: null };
  const unavailable = !info.ready ? "Emailing bills is not switched on yet. Ask the owner to set it up; until then use PDF or WhatsApp." : (info.blocked ?? null);

  const send = async (to: string | null) => {
    if (!info) return;
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch<{ to: string; at: string }>(`/api/documents/${documentId}/email`, { method: "POST", body: { to, saveToCustomer: !!to && !info.buyerEmail && save } });
      setLast({ to: res.to, at: new Date(res.at).toISOString(), count: (last?.count ?? 0) + 1 });
      setAsking(false);
      toast(`Bill emailed to ${res.to}`);
    } catch (e) {
      if (asking) setError(errorMessage(e));
      else toast(errorMessage(e), "error");
    } finally {
      setSending(false);
    }
  };

  const typed = address.trim();
  const typedOk = isValidEmail(typed);
  const button = (
    <Button
      variant="outline"
      icon={<Mail className="h-4 w-4" />}
      loading={sending && !asking}
      disabled={!!unavailable}
      title={unavailable ?? (info.buyerEmail ? `Send to ${info.buyerEmail}` : "Enter the customer's email")}
      data-testid="email-bill"
      onClick={() => {
        if (info.buyerEmail) void send(null);
        else {
          setError(null);
          setAsking(true);
        }
      }}
    >
      {last ? "Email again" : "Email"}
    </Button>
  );
  const note = (
    <>
      {(info.buyerEmail || last || unavailable) && (
        <p className="basis-full text-xs leading-relaxed text-navy-500" data-testid="email-note">
          {unavailable ? (
            unavailable
          ) : last ? (
            <>
              Emailed to <span className="font-mono text-navy-700">{last.to}</span> · {when(last.at)}
            </>
          ) : (
            <>
              Email goes to <span className="font-mono text-navy-700">{info.buyerEmail}</span>
            </>
          )}
          {!unavailable && (
            <>
              {" · "}
              <button
                type="button"
                className="font-medium text-navy-600 underline underline-offset-[3px] hover:text-navy-950"
                onClick={() => {
                  setAddress("");
                  setError(null);
                  setAsking(true);
                }}
              >
                {info.buyerEmail ? "send to another address" : "use a different address"}
              </button>
            </>
          )}
        </p>
      )}
    </>
  );
  const dialog = (
    <Dialog
      open={asking}
      onClose={() => setAsking(false)}
      size="sm"
      title="Email this bill"
      description="The bill is sent as a PDF attachment."
      footer={
        <>
          <Button variant="ghost" onClick={() => setAsking(false)}>
            Cancel
          </Button>
          <Button loading={sending} disabled={!typedOk} icon={<Mail className="h-4 w-4" />} onClick={() => send(typed)}>
            Send bill
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Customer's email" htmlFor="email-to" error={typed && !typedOk ? "That does not look like an email address." : null}>
          <Input id="email-to" type="email" inputMode="email" autoComplete="off" autoFocus value={address} onChange={(e) => setAddress(e.target.value)} maxLength={254} />
        </Field>
        {!info.buyerEmail && <Checkbox label="Keep this address on the customer for next time" checked={save} onChange={(e) => setSave(e.target.checked)} />}
      </div>
    </Dialog>
  );
  return { button, note, dialog };
}

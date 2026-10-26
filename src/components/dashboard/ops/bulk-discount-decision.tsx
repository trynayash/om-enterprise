"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { plural } from "@/components/staff/labels";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatINR } from "@/lib/money";

export interface DiscountRequestRow {
  id: string;
  saleNumber: string;
  percent: string;
  total: string;
  /** Why this approver can't approve it (it is skipped on "Approve all"), or null. */
  blocked: string | null;
}

interface BulkResult {
  decided: number;
  cancelled: number;
  skipped: { id: string; saleNumber: string | null; reason: string }[];
}

/** "Approve all" / "Reject all" above the discount requests. Each request is still checked on its own. */
export function BulkDiscountDecision({ requests }: { requests: DiscountRequestRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);
  // Kept while the dialog is open, so the skipped list survives the refresh that removes decided requests.
  if (requests.length < 2 && decision === null) return null;
  const blocked = requests.filter((r) => r.blocked);

  const openFor = (d: "approve" | "reject") => {
    setDecision(d);
    setNote("");
    setError(null);
    setResult(null);
  };
  const close = () => {
    if (busy) return;
    setDecision(null);
    setResult(null);
  };

  const submit = async () => {
    if (!decision) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<BulkResult>("/api/approvals/bulk", { method: "POST", body: { decision, note: note.trim() || null, ids: requests.map((x) => x.id) } });
      toast(`${decision === "approve" ? "Approved" : "Rejected"} ${plural(r.decided, "discount")}${r.skipped.length ? ` · ${r.skipped.length} skipped` : ""}`);
      router.refresh();
      // Skipped requests stay on screen with the reason; otherwise the dialog closes.
      if (r.skipped.length) setResult(r);
      else setDecision(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const noteOk = decision !== "reject" || note.trim().length >= 3;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="text-sm text-navy-700">
        <span className="font-semibold text-navy-950">{requests.length}</span> discount requests waiting
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="success" icon={<Check className="h-3.5 w-3.5" />} onClick={() => openFor("approve")}>
          Approve all
        </Button>
        <Button size="sm" variant="outline" className="text-red-700" icon={<X className="h-3.5 w-3.5" />} onClick={() => openFor("reject")}>
          Reject all
        </Button>
      </div>
      <Dialog
        open={decision !== null}
        onClose={close}
        title={result ? "Done, with some skipped" : decision === "approve" ? `Approve ${requests.length} discount requests` : `Reject ${requests.length} discount requests`}
        description={result ? undefined : "Each request is checked on its own, as if decided one by one."}
        footer={
          result ? (
            <Button onClick={close}>Close</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button variant={decision === "approve" ? "success" : "danger"} loading={busy} disabled={!noteOk} onClick={submit}>
                {decision === "approve" ? `Approve ${requests.length} requests` : `Reject ${requests.length} requests`}
              </Button>
            </>
          )
        }
      >
        {result ? (
          <div className="space-y-3 text-sm text-navy-800">
            <p>
              {decision === "approve" ? "Approved" : "Rejected"} {plural(result.decided, "request")}
              {result.cancelled ? ` (${result.cancelled} cleared because the sale is no longer open)` : ""}. These were skipped:
            </p>
            <ul className="divide-y divide-navy-100 rounded-lg border border-navy-100">
              {result.skipped.map((s) => (
                <li key={s.id} className="px-3 py-2">
                  <span className="tabular text-[13px] font-semibold">{s.saleNumber ?? "Unknown request"}</span>
                  <span className="text-navy-600"> — {s.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-4 text-sm text-navy-800">
            {error && <Alert tone="danger">{error}</Alert>}
            <ul className="divide-y divide-navy-100 rounded-lg border border-navy-100">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2">
                  <span>
                    <span className="tabular text-[13px] font-semibold">{r.saleNumber}</span> · <span className="tabular text-[13px]">{r.percent}%</span> off
                    {decision === "approve" && r.blocked && <span className="block text-xs text-amber-800">Will be skipped: {r.blocked}</span>}
                  </span>
                  <span className="tabular text-[13px] text-navy-600">{formatINR(r.total)}</span>
                </li>
              ))}
            </ul>
            {decision === "approve" && blocked.length > 0 && (
              <Alert tone="warning">
                {plural(blocked.length, "request")} can&apos;t be approved by you and will be skipped. You can still reject {blocked.length === 1 ? "it" : "them"}.
              </Alert>
            )}
            {decision === "reject" && <p className="text-navy-600">A request whose sale was already finished or cancelled is cleared from the list.</p>}
            <Field label={decision === "reject" ? "Reason for rejecting" : "Note (optional)"} htmlFor="bulk-discount-note" required={decision === "reject"} hint="Recorded in the audit log with each request.">
              <Textarea id="bulk-discount-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} />
            </Field>
          </div>
        )}
      </Dialog>
    </div>
  );
}

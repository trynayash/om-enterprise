"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { plural } from "@/components/staff/labels";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { priceSourceLabel, type PendingPriceFilter, type PriceSource } from "@/lib/price-filters";

export interface PendingSummary {
  newPrices: number;
  increases: number;
  decreases: number;
  sources: { source: PriceSource; count: number }[];
  brands: { brandId: string | null; name: string; count: number }[];
  notes: { reason: string; count: number }[];
  noteCount: number;
}

interface BulkResult {
  decided: number;
  skipped: number;
  warnings: { sku: string; reason: string }[];
}

/** Above this many prices, approving needs a tick to say they were checked. */
const CHECK_ABOVE = 100;
/** The server decides at most this many at once. */
const MAX_AT_ONCE = 5000;

/**
 * The line above the waiting prices: how many match and which are shown, and for approvers
 * "Approve all" / "Reject all" for everything that matches the filters (not only this page).
 */
export function BulkPriceDecision({
  total,
  from,
  to,
  canApprove,
  filter,
  filtered,
  asOf,
  summary,
}: {
  total: number;
  from: number;
  to: number;
  canApprove: boolean;
  filter: PendingPriceFilter;
  filtered: boolean;
  asOf: string;
  summary: PendingSummary;
}) {
  const router = useRouter();
  const toast = useToast();
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (total === 0) return null;
  const n = total.toLocaleString("en-IN");

  const openFor = (d: "approve" | "reject") => {
    setDecision(d);
    setNote("");
    setChecked(false);
    setError(null);
  };
  const close = () => {
    if (!busy) setDecision(null);
  };
  const tooMany = total > MAX_AT_ONCE;
  const noteOk = decision !== "reject" || note.trim().length >= 3;
  const checkOk = decision !== "approve" || total <= CHECK_ABOVE || checked;

  const submit = async () => {
    if (!decision) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<BulkResult>("/api/admin/prices/decisions", { method: "POST", body: { decision, note: note.trim() || null, filter, asOf } });
      const done = `${decision === "approve" ? "Approved" : "Rejected"} ${plural(r.decided, "price")}${r.skipped ? ` · ${r.skipped.toLocaleString("en-IN")} skipped` : ""}`;
      toast(done);
      if (r.warnings.length) {
        const shown = r.warnings.slice(0, 3).map((w) => `${w.sku}: ${w.reason}`).join("; ");
        toast(`${plural(r.warnings.length, "approved price")} not in force now — ${shown}${r.warnings.length > 3 ? "; …" : ""}`, "info");
      }
      setDecision(null);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="text-sm text-navy-700">
        Showing{" "}
        <span className="tabular text-[13px]">
          {from.toLocaleString("en-IN")}–{to.toLocaleString("en-IN")}
        </span>{" "}
        of <span className="font-semibold text-navy-950">{n}</span> waiting{filtered ? " that match the filters" : ""}
      </p>
      {canApprove && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="success" icon={<Check className="h-3.5 w-3.5" />} onClick={() => openFor("approve")}>
            Approve all {n}
          </Button>
          <Button size="sm" variant="outline" className="text-red-700" icon={<X className="h-3.5 w-3.5" />} onClick={() => openFor("reject")}>
            Reject all {n}
          </Button>
        </div>
      )}
      <Dialog
        open={decision !== null}
        onClose={close}
        size="lg"
        title={decision === "approve" ? `Approve ${plural(total, "price")}` : `Reject ${plural(total, "price")}`}
        description={filtered ? "Every waiting price that matches the filters, not only this page." : "Every price waiting for approval, not only this page."}
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant={decision === "approve" ? "success" : "danger"} loading={busy} disabled={tooMany || !noteOk || !checkOk} onClick={submit}>
              {decision === "approve" ? `Approve ${plural(total, "price")}` : `Reject ${plural(total, "price")}`}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-navy-800">
          {error && <Alert tone="danger">{error}</Alert>}
          {tooMany && <Alert tone="warning">At most {MAX_AT_ONCE.toLocaleString("en-IN")} prices can be decided at once. Narrow the list with the filters first.</Alert>}
          <p>
            {plural(total, "price")}: {summary.newPrices.toLocaleString("en-IN")} new, {plural(summary.increases, "increase")}, {plural(summary.decreases, "decrease")}.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <CountList title="By brand" rows={summary.brands.map((b) => ({ key: b.brandId ?? "none", label: b.name, count: b.count }))} />
            <CountList title="By source" rows={summary.sources.map((s) => ({ key: s.source, label: priceSourceLabel(s.source), count: s.count }))} />
          </div>
          {summary.notes.length > 0 && (
            <div>
              <div className="label-sm text-navy-500">{summary.noteCount === 1 ? "Reason given" : "Reasons given"}</div>
              <ul className="mt-1.5 space-y-1.5">
                {summary.notes.map((r) => (
                  <li key={r.reason} className="text-[13px] leading-relaxed text-navy-800">
                    “{r.reason}”{summary.noteCount > 1 && <span className="ml-1 tabular text-[12px] text-navy-500">({r.count.toLocaleString("en-IN")})</span>}
                  </li>
                ))}
              </ul>
              {summary.noteCount > summary.notes.length && <p className="mt-1 text-xs text-navy-500">and {plural(summary.noteCount - summary.notes.length, "other reason")}</p>}
            </div>
          )}
          <Alert tone={decision === "approve" ? "info" : "warning"}>
            {decision === "approve"
              ? "Approved prices are used at the counter and on the website straight away. A price with a later start date takes effect on that date."
              : "Rejected prices are never used and stay in the price history. The current prices do not change."}
          </Alert>
          <Field label={decision === "reject" ? "Reason for rejecting" : "Note (optional)"} htmlFor="bulk-price-note" required={decision === "reject"} hint="Recorded in the audit log with each price.">
            <Textarea id="bulk-price-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} />
          </Field>
          {decision === "approve" && total > CHECK_ABOVE && <Checkbox label="I have checked these prices" checked={checked} onChange={(e) => setChecked(e.target.checked)} />}
        </div>
      </Dialog>
    </div>
  );
}

function CountList({ title, rows }: { title: string; rows: { key: string; label: string; count: number }[] }) {
  const shown = rows.slice(0, 6);
  const rest = rows.slice(6).reduce((a, r) => a + r.count, 0);
  return (
    <div>
      <div className="label-sm text-navy-500">{title}</div>
      <ul className="mt-1.5 divide-y divide-navy-100 rounded-lg border border-navy-100">
        {shown.map((r) => (
          <li key={r.key} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="tabular text-[12.5px] text-navy-600">{r.count.toLocaleString("en-IN")}</span>
          </li>
        ))}
        {rest > 0 && (
          <li className="flex items-baseline justify-between gap-3 px-3 py-1.5 text-navy-500">
            <span>{plural(rows.length - shown.length, "other")}</span>
            <span className="tabular text-[12.5px]">{rest.toLocaleString("en-IN")}</span>
          </li>
        )}
      </ul>
    </div>
  );
}

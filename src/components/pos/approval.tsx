"use client";
import { useState } from "react";
import { BadgeCheck, Clock, ShieldAlert, UserCheck, XCircle } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { Button, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { ReasonDialog } from "./reason-dialog";
import type { PosConfig, SaleData } from "./types";

type Run = (fn: () => Promise<unknown>, success?: string) => Promise<boolean>;

export function ApprovalCard({ data, config, run }: { data: SaleData; config: PosConfig; run: Run }) {
  const { sale, evaluation, approvals } = data;
  const [requestOpen, setRequestOpen] = useState(false);
  const [inPersonOpen, setInPersonOpen] = useState(false);
  const latest = approvals[0];
  const needed = !!evaluation?.approvalNeeded;

  if (!needed) {
    if (sale.approvalStatus === "approved" && latest?.status === "approved") {
      return (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <div className="font-bold">Discount approved by {latest.decidedByName ?? "manager"}</div>
            <div className="text-emerald-800">
              {latest.decisionChannel === "in_person" ? "In person at the counter" : "Approved remotely"}
              {latest.decisionNote ? ` · “${latest.decisionNote}”` : ""}. Changing the cart will need a new approval.
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  const pending = sale.approvalStatus === "pending";
  const rejected = sale.approvalStatus === "rejected" || latest?.status === "rejected";

  return (
    <section aria-label="Approval required" className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-card">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-extrabold text-amber-950">Approval needed before finalising</h3>
          <ul className="mt-1 list-inside list-disc text-sm text-amber-900">
            {evaluation!.approvalReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      </div>

      {pending && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-sm font-semibold text-amber-900">
          <Spinner className="text-amber-600" />
          <Clock className="h-4 w-4" /> Waiting for approval{latest ? ` (requested by ${latest.requestedByName})` : ""}… this updates automatically.
        </div>
      )}
      {rejected && !pending && latest?.status === "rejected" && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-900">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Rejected by <b>{latest.decidedByName ?? "manager"}</b>
            {latest.decisionNote ? `: “${latest.decisionNote}”` : ""}. Reduce the discount or ask again with a reason.
          </span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {!pending && (
          <Button variant="primary" icon={<Clock className="h-4 w-4" />} onClick={() => setRequestOpen(true)}>
            Request approval
          </Button>
        )}
        {config.discounts.inPersonApprovalEnabled && (
          <Button variant="gold" icon={<UserCheck className="h-4 w-4" />} onClick={() => setInPersonOpen(true)}>
            Manager approves here
          </Button>
        )}
      </div>

      {requestOpen && (
        <ReasonDialog
          open
          onClose={() => setRequestOpen(false)}
          title="Request approval"
          description="The request goes to authorised managers. It is tied to this exact cart — any change needs a new request."
          label="Why is this discount needed?"
          confirmLabel="Send request"
          onConfirm={async (reason) => {
            await apiFetch(`/api/sales/${sale.id}/approval-request`, { method: "POST", body: { reason } });
            await run(async () => {}, "Approval requested");
          }}
        />
      )}
      {inPersonOpen && <InPersonDialog saleId={sale.id} onClose={() => setInPersonOpen(false)} run={run} />}
    </section>
  );
}

function InPersonDialog({ saleId, onClose, run }: { saleId: string; onClose: () => void; run: Run }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ approvedBy: string }>(`/api/sales/${saleId}/approve-in-person`, {
        method: "POST",
        body: { username, password, note: note.trim() || null },
      });
      setPassword("");
      await run(async () => {}, `Approved by ${res.approvedBy}`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setPassword("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Manager approval at the counter"
      description="The approving manager enters their own username and password. Their name is recorded on this sale."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gold" loading={busy} disabled={!username || !password} onClick={submit}>
            Approve
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          if (username && password) void submit();
        }}
      >
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Manager username" htmlFor="appr-user">
          <Input id="appr-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} autoFocus />
        </Field>
        <Field label="Manager password" htmlFor="appr-pass">
          <Input id="appr-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Note (optional)" htmlFor="appr-note">
          <Textarea id="appr-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="min-h-14" />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

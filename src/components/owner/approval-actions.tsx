"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";

/** Big Approve / Reject buttons for one discount request. */
export function ApprovalActions({ id, labels }: { id: string; labels: { approve: string; reject: string; rejectNote: string; approved: string; rejected: string } }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const decide = async (decision: "approve" | "reject") => {
    setBusy(decision);
    try {
      await apiFetch(`/api/approvals/${id}`, { method: "POST", body: { decision, note: note.trim() || null } });
      toast(decision === "approve" ? labels.approved : labels.rejected);
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
      setBusy(null);
    }
  };
  return (
    <div className="mt-4 space-y-3">
      {rejecting && <Input aria-label={labels.rejectNote} placeholder={labels.rejectNote} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="h-12" autoFocus />}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          size="lg"
          className="w-full text-red-700"
          icon={<X className="h-5 w-5" />}
          loading={busy === "reject"}
          disabled={!!busy}
          onClick={() => (rejecting ? decide("reject") : setRejecting(true))}
        >
          {labels.reject}
        </Button>
        <Button variant="success" size="lg" className="w-full" icon={<Check className="h-5 w-5" />} loading={busy === "approve"} disabled={!!busy} onClick={() => decide("approve")}>
          {labels.approve}
        </Button>
      </div>
    </div>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";

/** Approve / reject with an optional note. Server enforces who may decide and their limits. */
export function DecisionButtons({ path, subject }: { path: string; subject: string }) {
  const router = useRouter();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<null | "approve" | "reject">(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: "approve" | "reject") => {
    setBusy(decision);
    setError(null);
    try {
      await apiFetch(path, { method: "POST", body: { decision, note: note.trim() || null } });
      toast(decision === "approve" ? `Approved ${subject}` : `Rejected ${subject}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input aria-label={`Note for ${subject}`} placeholder="Note (optional, recorded in the audit log)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="sm:flex-1" />
        <div className="flex gap-2">
          <Button variant="success" loading={busy === "approve"} disabled={!!busy} icon={<Check className="h-4 w-4" />} onClick={() => decide("approve")}>
            Approve
          </Button>
          <Button variant="outline" className="text-red-700" loading={busy === "reject"} disabled={!!busy} icon={<X className="h-4 w-4" />} onClick={() => decide("reject")}>
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}

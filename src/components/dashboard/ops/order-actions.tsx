"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Save } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";

const STATUSES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "quoted", label: "Quoted" },
  { value: "closed", label: "Closed" },
  { value: "spam", label: "Spam" },
];

export function OrderUpdateForm({ orderId, status, staffNotes, canManage }: { orderId: string; status: string; staffNotes: string | null; canManage: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [s, setS] = useState(status === "converted" ? "converted" : status);
  const [notes, setNotes] = useState(staffNotes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/orders/${orderId}`, { method: "PATCH", body: { status: s === "converted" ? undefined : s, staffNotes: notes || null } });
      toast("Order updated");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Status" htmlFor="o-status">
        <Select id="o-status" value={s} onChange={(e) => setS(e.target.value)} disabled={!canManage || status === "converted"}>
          {status === "converted" && <option value="converted">Converted to sale</option>}
          {STATUSES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Staff notes" htmlFor="o-notes" hint="Internal only — never shown to the customer.">
        <Textarea id="o-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} disabled={!canManage} />
      </Field>
      {canManage && (
        <Button onClick={save} loading={busy} icon={<Save className="h-4 w-4" />}>
          Save
        </Button>
      )}
    </div>
  );
}

export function ConvertOrderButton({ orderId, convertedSaleId }: { orderId: string; convertedSaleId: string | null }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ saleId: string; saleNumber: string; skipped: string[] } | null>(null);
  if (convertedSaleId || result) {
    return (
      <div className="space-y-2">
        {result?.skipped.length ? <Alert tone="warning">Some items could not be added (no longer available or no price): {result.skipped.join(", ")}</Alert> : null}
        <LinkButton href={`/pos/sale/${result?.saleId ?? convertedSaleId}`} variant="gold" icon={<ArrowRightLeft className="h-4 w-4" />}>
          Open sale {result?.saleNumber ?? ""} in POS
        </LinkButton>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {error && <Alert tone="danger">{error}</Alert>}
      <Button
        variant="gold"
        loading={busy}
        icon={<ArrowRightLeft className="h-4 w-4" />}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const r = await apiFetch<{ saleId: string; saleNumber: string; skipped: string[] }>(`/api/admin/orders/${orderId}/convert`, { method: "POST", body: {} });
            setResult(r);
            toast(`Draft sale ${r.saleNumber} created at current prices`);
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        Convert to sale
      </Button>
      <p className="text-xs text-navy-500">Creates a POS draft with the requested items at today&apos;s prices. Website prices were indicative.</p>
    </div>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneCall, ShoppingCart, XCircle } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Staff actions on a website enquiry / order request. */
export function OrderActions({ id, status, canConvert }: { id: string; status: string; canConvert: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const setStatus = async (next: string, msg: string) => {
    setBusy(next);
    try {
      await apiFetch(`/api/admin/orders/${id}`, { method: "PATCH", body: { status: next } });
      toast(msg);
      router.refresh();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };
  const convert = async () => {
    setBusy("convert");
    try {
      const res = await apiFetch<{ saleId: string; skipped: string[] }>(`/api/admin/orders/${id}/convert`, { method: "POST", body: {} });
      if (res.skipped.length) toast(`Some items were skipped (no longer available or no price): ${res.skipped.join(", ")}`, "info");
      router.push(`/pos/sale/${res.saleId}`);
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(null);
    }
  };
  if (status === "converted" || status === "closed" || status === "spam") return null;
  return (
    <div className="flex flex-wrap gap-2">
      {canConvert && (
        <Button loading={busy === "convert"} disabled={!!busy} onClick={convert} icon={<ShoppingCart className="h-4 w-4" />}>
          Start sale from this order
        </Button>
      )}
      {status === "new" && (
        <Button variant="outline" loading={busy === "contacted"} disabled={!!busy} onClick={() => setStatus("contacted", "Marked as contacted")} icon={<PhoneCall className="h-4 w-4" />}>
          Mark contacted
        </Button>
      )}
      <Button variant="ghost" loading={busy === "closed"} disabled={!!busy} onClick={() => setStatus("closed", "Order closed")} icon={<XCircle className="h-4 w-4" />}>
        Close
      </Button>
      <Button variant="ghost" className="text-red-700 hover:bg-red-50" loading={busy === "spam"} disabled={!!busy} onClick={() => setStatus("spam", "Marked as spam")}>
        Spam
      </Button>
    </div>
  );
}

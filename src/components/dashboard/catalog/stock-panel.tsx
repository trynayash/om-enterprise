"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert, EmptyState } from "@/components/ui/page";
import { rowHover, tdMuted, tdNum, tdText, th, thNum } from "@/components/dashboard/table";
import { DateTime, Qty } from "@/components/ui/money";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { lineDescription } from "@/lib/line-description";

export interface StockItem {
  variantId: string;
  sku: string;
  name: string;
  reorderLevel: string | null;
  onHand: string;
  movements: number;
  low: boolean;
}
export interface MovementRow {
  id: number;
  variantId: string;
  quantityChange: string;
  movementType: string;
  note: string | null;
  createdAt: string;
}

const TYPES = [
  { value: "opening", label: "Opening stock (counted)" },
  { value: "purchase_receipt", label: "Goods received from supplier" },
  { value: "adjustment", label: "Adjustment after recount (+/−)" },
  { value: "damage", label: "Damaged / unusable (−)" },
  { value: "supplier_return", label: "Returned to supplier (−)" },
];

export function StockPanel({ items, recent, canManage }: { items: StockItem[]; recent: MovementRow[]; canManage: boolean }) {
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const visible = items.filter((i) => (!lowOnly || i.low) && (!q || `${i.sku} ${i.name}`.toLowerCase().includes(q.toLowerCase())));
  const names = new Map(items.map((i) => [i.variantId, `${i.name} (${i.sku})`]));

  return (
    <div className="space-y-6">
      {canManage && <MovementForm />}
      <Card>
        <CardHeader title="Stock on hand" description="Calculated from the stock ledger — every movement is recorded and never edited." />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-60 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
              <Input type="search" aria-label="Filter stock" placeholder="Filter by name or SKU" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-navy-700">
              <input type="checkbox" className="accent-navy-900" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only
            </label>
          </div>
          {visible.length === 0 ? (
            <EmptyState title="No matching items" />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-navy-100">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr>
                    <th className={th}>Item</th>
                    <th className={thNum}>On hand</th>
                    <th className={thNum}>Reorder at</th>
                    <th className={th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((i) => (
                    <tr key={i.variantId} className={rowHover}>
                      <td className={tdText}>
                        <div className="font-medium">{i.name}</div>
                        <div className="mt-0.5 tabular text-[11.5px] text-navy-500">{i.sku}</div>
                      </td>
                      <td className={`${tdNum} font-semibold`}>{i.movements ? <Qty value={i.onHand} /> : <span className="font-sans text-xs font-normal text-navy-400">not counted</span>}</td>
                      <td className={tdNum}>{i.reorderLevel ? <Qty value={i.reorderLevel} /> : <span className="text-navy-300">—</span>}</td>
                      <td className={tdText}>
                        {/* Only a low level is stamped; the rest read as quiet text. */}
                        {i.low ? (
                          <Badge tone="red">
                            <AlertTriangle className="h-3 w-3" /> Low
                          </Badge>
                        ) : i.movements ? (
                          <span className="text-[13px] text-navy-500">OK</span>
                        ) : (
                          <span className="text-[13px] text-navy-400">No count</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Recent movements" />
        {recent.length === 0 ? (
          <CardBody>
            <p className="text-sm text-navy-500">No stock movements recorded yet.</p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr>
                  <th className={th}>When</th>
                  <th className={th}>Item</th>
                  <th className={th}>Type</th>
                  <th className={thNum}>Change</th>
                  <th className={th}>Note</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((m) => (
                  <tr key={m.id} className={rowHover}>
                    <td className={`${tdMuted} whitespace-nowrap`}>
                      <DateTime value={m.createdAt} />
                    </td>
                    <td className={tdText}>{names.get(m.variantId) ?? m.variantId}</td>
                    <td className={`${tdMuted} first-letter:uppercase`}>{m.movementType.replace(/_/g, " ")}</td>
                    <td className={`${tdNum} font-semibold`}>
                      <span className={Number(m.quantityChange) < 0 ? "text-red-700" : "text-emerald-700"}>
                        {Number(m.quantityChange) > 0 ? "+" : ""}
                        {Number(m.quantityChange)}
                      </span>
                    </td>
                    <td className={tdMuted}>{m.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

interface Hit {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
}

function MovementForm() {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ q: string; hits: Hit[] }>({ q: "", hits: [] });
  const [picked, setPicked] = useState<Hit | null>(null);
  const [type, setType] = useState("opening");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const term = q.trim();
  useEffect(() => {
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      apiFetch<Hit[]>(`/api/admin/variants/search?q=${encodeURIComponent(term)}&limit=10`, { signal: ctrl.signal })
        .then((hits) => setResult({ q: term, hits }))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term]);
  const hits = !picked && term.length >= 2 && result.q === term ? result.hits : [];

  const negative = type === "damage" || type === "supplier_return";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!picked) return;
    setBusy(true);
    setError(null);
    const n = qty.trim().replace(/^[-+]/, "");
    const signed = negative ? `-${n}` : type === "adjustment" ? qty.trim().replace(/^\+/, "") : n;
    try {
      await apiFetch("/api/admin/stock-movements", {
        method: "POST",
        body: { variantId: picked.variantId, quantityChange: signed, movementType: type, note: note.trim(), unitCost: cost.trim() || null },
      });
      toast("Stock movement recorded");
      setPicked(null);
      setQ("");
      setQty("");
      setCost("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Record a stock movement" description="Counted opening stock, goods received, recount adjustments, damage or returns to supplier." />
      <CardBody>
        <form onSubmit={submit} className="grid gap-3 lg:grid-cols-[2fr_1.4fr_0.8fr_0.8fr]">
          {error && <Alert tone="danger" className="lg:col-span-4">{error}</Alert>}
          <Field label="Item" htmlFor="sm-item" required>
            {picked ? (
              <div className="flex h-10 items-center justify-between gap-2 rounded-lg border border-navy-200 bg-paper px-3 text-sm">
                <span className="truncate">
                  {lineDescription(null, picked.productName, picked.variantName)} <span className="tabular text-xs text-navy-500">{picked.sku}</span>
                </span>
                <button type="button" className="text-xs font-semibold text-gold-700" onClick={() => setPicked(null)}>
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input id="sm-item" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or SKU" autoComplete="off" />
                {hits.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-navy-200 bg-white shadow-lift">
                    {hits.map((h) => (
                      <li key={h.variantId}>
                        <button type="button" className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-paper" onClick={() => setPicked(h)}>
                          {lineDescription(null, h.productName, h.variantName)} <span className="tabular text-xs text-navy-500">{h.sku}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Field>
          <Field label="Type" htmlFor="sm-type">
            <Select id="sm-type" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={type === "adjustment" ? "Quantity (+/−)" : "Quantity"} htmlFor="sm-qty" required>
            <Input id="sm-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder={type === "adjustment" ? "-2 or 5" : "10"} required />
          </Field>
          <Field label="Unit cost" htmlFor="sm-cost" hint="Optional">
            <Input id="sm-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
          <Field label="Note" htmlFor="sm-note" required className="lg:col-span-3">
            <Input id="sm-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Counted on 1 Nov / Bill 4471 from supplier" required maxLength={300} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="w-full" loading={busy} disabled={!picked || !qty.trim() || note.trim().length < 3}>
              Record
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

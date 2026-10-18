"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, Search, UserRound, X } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { D, formatINR } from "@/lib/money";
import { STATES, stateName } from "@/lib/india";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { outstandingOf } from "./payment-panel";
import { hasPerm, type Me, type PosConfig, type SaleData } from "./types";

interface CustomerRow {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  businessName: string | null;
  gstin: string | null;
  billingAddress: string | null;
  city: string | null;
  stateCode: string | null;
  pincode: string | null;
}

interface Form {
  id: string | null;
  name: string;
  mobile: string;
  email: string;
  businessName: string;
  gstin: string;
  billingAddress: string;
  city: string;
  stateCode: string;
  pincode: string;
}

function formFrom(c: CustomerRow | null, defaultState: string): Form {
  return {
    id: c?.id ?? null,
    name: c?.name ?? "",
    mobile: c?.mobile ?? "",
    email: c?.email ?? "",
    businessName: c?.businessName ?? "",
    gstin: c?.gstin ?? "",
    billingAddress: c?.billingAddress ?? "",
    city: c?.city ?? "",
    stateCode: c?.stateCode ?? defaultState,
    pincode: c?.pincode ?? "",
  };
}

export function CustomerBillPanel({ data, config, me }: { data: SaleData; config: PosConfig; me: Me }) {
  const router = useRouter();
  const s = data.sale;
  const [form, setForm] = useState<Form>(() => formFrom(data.customer as CustomerRow | null, s.placeOfSupplyStateCode));
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CustomerRow[]>([]);
  const [busy, setBusy] = useState<null | "bill" | "skip" | "credit">(null);
  const [error, setError] = useState<string | null>(null);

  const outstanding = outstandingOf(data);
  const paid = outstanding.lessThanOrEqualTo(0);
  const canCredit = !paid && config.discounts.allowCreditSales && hasPerm(me, "sales.credit");
  const regular = config.registrationType === "regular";
  const overThreshold = D(s.taxableTotal).greaterThanOrEqualTo(D(config.b2cDetailsThreshold));
  const detailsRequired = regular && (overThreshold || !!form.gstin.trim());
  const canSkip = paid && !(regular && overThreshold);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        setResults(await apiFetch<CustomerRow[]>(`/api/customers?q=${encodeURIComponent(term)}&limit=8`, { signal: ctrl.signal }));
      } catch {
        // ignore search errors
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const issue = async (mode: "bill" | "skip" | "credit") => {
    setBusy(mode);
    setError(null);
    try {
      const customer =
        mode === "skip"
          ? null
          : {
              id: form.id,
              name: form.name.trim(),
              mobile: form.mobile.trim() || null,
              email: form.email.trim() || null,
              businessName: form.businessName.trim() || null,
              gstin: form.gstin.trim() || null,
              billingAddress: form.billingAddress.trim() || null,
              city: form.city.trim() || null,
              stateCode: form.stateCode || null,
              pincode: form.pincode.trim() || null,
            };
      const doc = await apiFetch<{ id: string }>(`/api/sales/${s.id}/bill`, {
        method: "POST",
        body: { customer, allowOutstanding: mode === "credit" },
      });
      router.push(`/pos/documents/${doc.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  };

  return (
    <section aria-label="Customer and bill" className="overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-card">
      <div className="border-b border-navy-100 px-5 py-4">
        <div className="text-xs font-bold uppercase tracking-[0.16em] text-gold-600">Step 3 · Customer & bill</div>
        <div className="mt-0.5 text-sm text-navy-600">
          {paid ? (
            <span className="font-semibold text-emerald-700">Payment verified: {formatINR(s.amountPaid)}</span>
          ) : (
            <span className="font-semibold text-amber-800">Balance due: {formatINR(outstanding)}</span>
          )}
        </div>
      </div>
      <div className="space-y-4 p-5">
        {error && <Alert tone="danger">{error}</Alert>}

        <div>
          <label htmlFor="cust-search" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-navy-700">
            Find existing customer
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
            <Input
              id="cust-search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                if (e.target.value.trim().length < 2) setResults([]);
              }}
              placeholder="Name, mobile or GSTIN"
              className="pl-9"
              autoComplete="off"
            />
          </div>
          {results.length > 0 && q.trim().length >= 2 && (
            <ul className="mt-1 max-h-48 divide-y divide-navy-50 overflow-y-auto rounded-xl border border-navy-100">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setForm(formFrom(c, s.placeOfSupplyStateCode));
                      setQ("");
                      setResults([]);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-navy-50"
                  >
                    <UserRound className="h-4 w-4 text-navy-400" />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{c.businessName ? `${c.businessName} (${c.name})` : c.name}</span>
                      <span className="block text-xs text-navy-500">{[c.mobile, c.city, c.gstin].filter(Boolean).join(" · ")}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {form.id && (
          <div className="flex items-center justify-between rounded-xl bg-navy-50 px-3 py-2 text-sm">
            <span>
              Using saved customer <b>{form.name}</b> — changes below update their record.
            </span>
            <button type="button" onClick={() => setForm(formFrom(null, s.placeOfSupplyStateCode))} className="rounded p-1 text-navy-500 hover:bg-white" aria-label="Clear customer">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer name" htmlFor="c-name" required={detailsRequired || canCredit} className="sm:col-span-2">
            <Input id="c-name" value={form.name} onChange={set("name")} maxLength={120} autoComplete="off" />
          </Field>
          <Field label="Mobile" htmlFor="c-mobile" hint="10-digit mobile — used to share the bill on WhatsApp">
            <Input id="c-mobile" inputMode="tel" value={form.mobile} onChange={set("mobile")} maxLength={16} autoComplete="off" />
          </Field>
          <Field label="Email" htmlFor="c-email">
            <Input id="c-email" type="email" value={form.email} onChange={set("email")} maxLength={120} autoComplete="off" />
          </Field>
          <Field label="Business name" htmlFor="c-biz">
            <Input id="c-biz" value={form.businessName} onChange={set("businessName")} maxLength={160} autoComplete="off" />
          </Field>
          <Field label="GSTIN (if registered)" htmlFor="c-gstin" hint={regular ? "Checked automatically (format & check digit)" : undefined}>
            <Input id="c-gstin" value={form.gstin} onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase().replace(/\s/g, "") }))} maxLength={15} className="font-mono uppercase" autoComplete="off" />
          </Field>
          <Field label="Billing / delivery address" htmlFor="c-addr" required={detailsRequired} className="sm:col-span-2">
            <Textarea id="c-addr" value={form.billingAddress} onChange={set("billingAddress")} maxLength={400} className="min-h-16" />
          </Field>
          <Field label="City / town" htmlFor="c-city">
            <Input id="c-city" value={form.city} onChange={set("city")} maxLength={80} autoComplete="off" />
          </Field>
          <Field label="PIN code" htmlFor="c-pin">
            <Input id="c-pin" inputMode="numeric" value={form.pincode} onChange={set("pincode")} maxLength={6} autoComplete="off" />
          </Field>
          <Field
            label="State"
            htmlFor="c-state"
            required={detailsRequired}
            className="sm:col-span-2"
            hint={
              regular && !form.gstin && form.stateCode !== s.placeOfSupplyStateCode
                ? `For an unregistered buyer the address must be in ${stateName(s.placeOfSupplyStateCode)} (the place of supply this sale was priced for).`
                : `Place of supply for this sale: ${stateName(s.placeOfSupplyStateCode)}`
            }
          >
            <Select id="c-state" value={form.stateCode} onChange={set("stateCode")}>
              {STATES.map((st) => (
                <option key={st.code} value={st.code}>
                  {st.name} ({st.code})
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {regular && (
          <p className="text-xs text-navy-500">
            {overThreshold
              ? `Bills with a taxable value of ${formatINR(config.b2cDetailsThreshold)} or more must show the customer's name, address and state.`
              : "For GST-registered buyers, name, address, state and GSTIN are required. For other small bills, details are optional."}
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {paid && (
            <Button variant="gold" size="lg" loading={busy === "bill"} disabled={!!busy || !form.name.trim()} onClick={() => issue("bill")} icon={<FileCheck2 className="h-5 w-5" />}>
              Generate bill
            </Button>
          )}
          {canSkip && (
            <Button variant="outline" size="lg" loading={busy === "skip"} disabled={!!busy} onClick={() => issue("skip")}>
              Cash sale — skip details
            </Button>
          )}
          {canCredit && (
            <Button variant="primary" size="lg" loading={busy === "credit"} disabled={!!busy || !form.name.trim() || !form.mobile.trim()} onClick={() => issue("credit")}>
              Issue bill with {formatINR(outstanding)} due (credit)
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

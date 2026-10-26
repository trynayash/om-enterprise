"use client";
/**
 * The fields for who is buying, shared by the customer step (asked before the QR is shown) and the
 * bill step (where they can still be changed). Name and mobile come first; address, GSTIN and
 * business name sit under "more details" and open by themselves when the bill needs them.
 */
import { useEffect, useState } from "react";
import { ChevronDown, Search, UserCheck, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { D, formatINR } from "@/lib/money";
import { STATES, isValidEmail, normalizeMobile, stateName } from "@/lib/india";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Label, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/components/ui/cn";
import type { PosConfig } from "./types";

export interface CustomerRow {
  id: string;
  name: string;
  mobile: string | null;
  whatsapp: string | null;
  email: string | null;
  businessName: string | null;
  gstin: string | null;
  billingAddress: string | null;
  city: string | null;
  stateCode: string | null;
  pincode: string | null;
}

export interface BuyerForm {
  id: string | null;
  name: string;
  mobile: string;
  /** The mobile number is also the customer's WhatsApp (the usual case). */
  whatsappSame: boolean;
  /** Their WhatsApp number when it is a different one. */
  whatsapp: string;
  email: string;
  businessName: string;
  gstin: string;
  billingAddress: string;
  city: string;
  stateCode: string;
  pincode: string;
}

export function formFrom(c: CustomerRow | null, defaultState: string): BuyerForm {
  return {
    id: c?.id ?? null,
    name: c?.name ?? "",
    mobile: c?.mobile ?? "",
    whatsappSame: !c?.whatsapp,
    whatsapp: c?.whatsapp ?? "",
    email: c?.email ?? "",
    businessName: c?.businessName ?? "",
    gstin: c?.gstin ?? "",
    billingAddress: c?.billingAddress ?? "",
    city: c?.city ?? "",
    stateCode: c?.stateCode ?? defaultState,
    pincode: c?.pincode ?? "",
  };
}

/**
 * What the server takes for a customer. The state is pre-filled with the sale's place of supply, so it
 * is only sent when it means something: an address or GSTIN was given, or it was changed — otherwise a
 * customer who gave just a name and mobile would be printed with a made-up address line.
 */
export function customerBody(form: BuyerForm, defaultState: string) {
  const stateMeans = !!(form.billingAddress.trim() || form.gstin.trim() || form.city.trim() || form.pincode.trim()) || form.stateCode !== defaultState;
  return {
    id: form.id,
    name: form.name.trim(),
    mobile: form.mobile.trim() || null,
    whatsapp: form.whatsappSame ? null : form.whatsapp.trim() || null,
    email: form.email.trim() || null,
    businessName: form.businessName.trim() || null,
    gstin: form.gstin.trim() || null,
    billingAddress: form.billingAddress.trim() || null,
    city: form.city.trim() || null,
    stateCode: stateMeans ? form.stateCode || null : null,
    pincode: form.pincode.trim() || null,
  };
}

/** What the bill will demand of this buyer, from the shop's registration and the sale's taxable value. */
export function buyerRules(form: BuyerForm, config: PosConfig, taxableTotal: string) {
  const regular = config.registrationType === "regular";
  const overThreshold = D(taxableTotal).greaterThanOrEqualTo(D(config.b2cDetailsThreshold));
  return {
    regular,
    overThreshold,
    /** Name, address and state must all be given (Rule 46): a registered buyer, or a bill at or above the threshold. */
    detailsRequired: regular && (overThreshold || !!form.gstin.trim()),
    /** A bill with no customer details at all is allowed. */
    canSkip: !(regular && overThreshold),
  };
}

/** Whether name and mobile are filled in well enough to send: a 10-digit Indian mobile and, if given, a plausible email. */
export function contactProblem(form: BuyerForm): string | null {
  if (!form.name.trim()) return "Enter the customer's name.";
  if (!normalizeMobile(form.mobile)) return form.mobile.trim() ? "That mobile number is not a valid 10-digit Indian number." : "Enter the customer's mobile number.";
  if (!form.whatsappSame && !normalizeMobile(form.whatsapp))
    return form.whatsapp.trim() ? "That WhatsApp number is not a valid 10-digit Indian number." : "Enter the customer's WhatsApp number, or tick that the mobile is on WhatsApp.";
  if (form.email.trim() && !isValidEmail(form.email.trim())) return "That email address does not look right.";
  return null;
}

/** What is still missing for the bill's tax rules (the server checks the same when the customer is saved). */
export function rulesProblem(form: BuyerForm, config: PosConfig, taxableTotal: string): string | null {
  const rules = buyerRules(form, config, taxableTotal);
  if (rules.detailsRequired && !form.billingAddress.trim()) return "This bill needs the customer's address.";
  return null;
}

export function BuyerFields({
  form,
  setForm,
  config,
  placeOfSupplyStateCode,
  taxableTotal,
  mobileRequired,
}: {
  form: BuyerForm;
  setForm: (update: (f: BuyerForm) => BuyerForm) => void;
  config: PosConfig;
  placeOfSupplyStateCode: string;
  taxableTotal: string;
  mobileRequired: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CustomerRow[]>([]);
  const [sameMobile, setSameMobile] = useState<CustomerRow | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const rules = buyerRules(form, config, taxableTotal);
  const hasMore = !!(form.gstin || form.billingAddress || form.businessName || form.city || form.pincode);
  const showMore = moreOpen || rules.detailsRequired || hasMore;

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

  // A mobile number already in the customer list: offer that customer instead of making a second one.
  const mobile = normalizeMobile(form.mobile);
  useEffect(() => {
    if (!mobile || form.id) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const found = await apiFetch<CustomerRow[]>(`/api/customers?q=${mobile}&limit=3`, { signal: ctrl.signal });
        setSameMobile(found.find((c) => c.mobile === mobile) ?? null);
      } catch {
        setSameMobile(null);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [mobile, form.id]);

  const set = (k: keyof BuyerForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const pick = (c: CustomerRow) => {
    setForm(() => formFrom(c, placeOfSupplyStateCode));
    setQ("");
    setResults([]);
    setSameMobile(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="cust-search">Find a saved customer</Label>
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
            className="h-11 pl-9"
            autoComplete="off"
          />
        </div>
        {results.length > 0 && q.trim().length >= 2 && (
          <ul className="mt-1 max-h-48 animate-fade-in divide-y divide-navy-100 overflow-y-auto rounded-lg border border-navy-200 bg-white shadow-card">
            {results.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => pick(c)} className="block w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-paper/70">
                  <span className="font-semibold text-navy-950">{c.businessName ? `${c.businessName} (${c.name})` : c.name}</span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-xs text-navy-500">
                    {[c.mobile, c.city, c.gstin].filter(Boolean).map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {form.id && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-navy-200 bg-paper/70 px-3 py-2 text-sm text-navy-800">
          <span>
            Using saved customer <b className="font-semibold text-navy-950">{form.name}</b> — changes below update their record.
          </span>
          <button
            type="button"
            onClick={() => setForm(() => formFrom(null, placeOfSupplyStateCode))}
            className="rounded p-1 text-navy-500 transition-colors hover:bg-white hover:text-navy-900"
            aria-label="Clear customer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {sameMobile && !form.id && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gold-300 bg-gold-50 px-3 py-2 text-sm text-navy-900">
          <span className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 shrink-0 text-gold-700" aria-hidden />
            <span>
              This mobile is already saved for <b className="font-semibold">{sameMobile.businessName ? `${sameMobile.businessName} (${sameMobile.name})` : sameMobile.name}</b>
              {sameMobile.city ? `, ${sameMobile.city}` : ""}.
            </span>
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => pick(sameMobile)}>
            Use this customer
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer name" htmlFor="c-name" required className="sm:col-span-2">
          <Input id="c-name" value={form.name} onChange={set("name")} maxLength={120} autoComplete="off" autoFocus />
        </Field>
        <Field label="Mobile" htmlFor="c-mobile" required={mobileRequired} hint="10-digit number">
          <Input id="c-mobile" className="font-mono" inputMode="tel" value={form.mobile} onChange={set("mobile")} maxLength={16} autoComplete="off" />
        </Field>
        <Field label="Email" htmlFor="c-email" hint="Optional — the bill can be emailed here">
          <Input id="c-email" type="email" value={form.email} onChange={set("email")} maxLength={120} autoComplete="off" />
        </Field>
        <div className="sm:col-span-2">
          <Checkbox
            id="c-wa-same"
            label="This mobile number is also on WhatsApp — the bill is sent there"
            checked={form.whatsappSame}
            onChange={(e) => setForm((f) => ({ ...f, whatsappSame: e.target.checked }))}
          />
        </div>
        {!form.whatsappSame && (
          <Field label="WhatsApp number" htmlFor="c-whatsapp" required hint="The number the bill is sent to on WhatsApp">
            <Input id="c-whatsapp" className="font-mono" inputMode="tel" value={form.whatsapp} onChange={set("whatsapp")} maxLength={16} autoComplete="off" autoFocus />
          </Field>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-navy-200">
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={showMore}
          disabled={rules.detailsRequired || hasMore}
          className={cn(
            "flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-navy-900 transition-colors enabled:hover:bg-paper/60",
            showMore && "bg-paper/60",
          )}
        >
          <span>
            Address, GSTIN and business name
            <span className="ml-2 font-normal text-navy-500">{rules.detailsRequired ? "required for this bill" : "if the customer is a business or wants delivery"}</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-navy-400 transition-transform duration-200", showMore && "rotate-180")} />
        </button>
        {showMore && (
          <div className="animate-fade-in grid gap-3 border-t border-navy-200 p-4 sm:grid-cols-2">
            <Field label="Business name" htmlFor="c-biz">
              <Input id="c-biz" value={form.businessName} onChange={set("businessName")} maxLength={160} autoComplete="off" />
            </Field>
            <Field label="GSTIN (if registered)" htmlFor="c-gstin" hint={rules.regular ? "Checked automatically (format & check digit)" : undefined}>
              <Input
                id="c-gstin"
                value={form.gstin}
                onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase().replace(/\s/g, "") }))}
                maxLength={15}
                className="font-mono uppercase tracking-wider"
                autoComplete="off"
              />
            </Field>
            <Field label="Billing / delivery address" htmlFor="c-addr" required={rules.detailsRequired} className="sm:col-span-2">
              <Textarea id="c-addr" value={form.billingAddress} onChange={set("billingAddress")} maxLength={400} className="min-h-16" />
            </Field>
            <Field label="City / town" htmlFor="c-city">
              <Input id="c-city" value={form.city} onChange={set("city")} maxLength={80} autoComplete="off" />
            </Field>
            <Field label="PIN code" htmlFor="c-pin">
              <Input id="c-pin" className="font-mono" inputMode="numeric" value={form.pincode} onChange={set("pincode")} maxLength={6} autoComplete="off" />
            </Field>
            <Field
              label="State"
              htmlFor="c-state"
              required={rules.detailsRequired}
              className="sm:col-span-2"
              hint={
                rules.regular && !form.gstin && form.stateCode !== placeOfSupplyStateCode
                  ? `For an unregistered buyer the address must be in ${stateName(placeOfSupplyStateCode)} (the place of supply this sale was priced for).`
                  : `Place of supply for this sale: ${stateName(placeOfSupplyStateCode)}`
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
        )}
      </div>

      {rules.regular && (
        <p className="text-xs leading-relaxed text-navy-500">
          {rules.overThreshold
            ? `Bills with a taxable value of ${formatINR(config.b2cDetailsThreshold)} or more must show the customer's name, address and state.`
            : "For GST-registered buyers, name, address, state and GSTIN are required. For other small bills, the address is optional."}
        </p>
      )}
    </div>
  );
}

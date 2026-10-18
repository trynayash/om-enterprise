"use client";
import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { cn } from "@/components/ui/cn";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import { normalizeMobile, whatsappLink } from "@/lib/india";

interface SubmitResult {
  orderNumber: string;
  indicativeTotal: string | null;
}

export interface EnquiryDone extends SubmitResult {
  name: string;
  mobile: string;
  preferredContact: "call" | "whatsapp" | "email";
  kind: "enquiry" | "order_request";
}

export function EnquirySuccess({ done, whatsapp }: { done: EnquiryDone; whatsapp: string | null }) {
  const label = done.kind === "order_request" ? "order request" : "enquiry";
  const follow = whatsapp ? whatsappLink(whatsapp, `Hello OM ENTERPRISE, I just sent ${label} ${done.orderNumber} on your website. My name is ${done.name}.`) : null;
  return (
    <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 text-center shadow-card sm:p-10" role="status">
      <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
      <h2 className="mt-4 text-2xl font-extrabold text-navy-900">Thank you, {done.name.split(" ")[0]}!</h2>
      <p className="mt-2 text-base text-navy-600">
        Your {label} <span className="font-extrabold text-navy-900">{done.orderNumber}</span> has been received.
      </p>
      <p className="mt-1 text-sm text-navy-500">
        We&apos;ll contact you on <span className="font-semibold">{done.mobile}</span>
        {done.preferredContact === "whatsapp" ? " via WhatsApp" : done.preferredContact === "email" ? " by email" : " by phone"} to confirm availability and the final amount.
      </p>
      {done.indicativeTotal && (
        <p className="mt-3 text-sm text-navy-600">
          Indicative total at today&apos;s prices: <span className="font-bold tabular">{formatINR(done.indicativeTotal)}</span>
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {follow && (
          <a href={follow} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-700">
            <MessageCircle className="h-4 w-4" /> Follow up on WhatsApp
          </a>
        )}
        <Link href="/products" className="inline-flex h-11 items-center rounded-xl border border-navy-200 bg-white px-5 text-sm font-semibold text-navy-900 hover:bg-navy-50">
          Continue browsing
        </Link>
      </div>
    </div>
  );
}

export function EnquiryForm({
  items,
  whatsapp,
  allowOrderRequest,
  onSubmitted,
}: {
  items: { variantId: string; quantity: string }[];
  whatsapp: string | null;
  allowOrderRequest: boolean;
  /** When provided, the parent shows the success state; otherwise the form shows it in place. */
  onSubmitted?: (done: EnquiryDone) => void;
}) {
  const [kind, setKind] = useState<"enquiry" | "order_request">(allowOrderRequest ? "order_request" : "enquiry");
  const [form, setForm] = useState({ customerName: "", mobile: "", email: "", city: "", address: "", message: "", preferredContact: "whatsapp" as "call" | "whatsapp" | "email" });
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<EnquiryDone | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const effectiveKind = items.length && allowOrderRequest ? kind : "enquiry";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (form.customerName.trim().length < 2) errs.customerName = "Please enter your name";
    if (!normalizeMobile(form.mobile)) errs.mobile = "Enter a valid 10-digit mobile number";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) errs.email = "Enter a valid email address";
    if (form.preferredContact === "email" && !form.email.trim()) errs.email = "Add your email so we can reply by email";
    if (!items.length && !form.message.trim()) errs.message = "Tell us what you need";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setServerError(null);
    try {
      const res = await apiFetch<SubmitResult>("/api/public/orders", {
        method: "POST",
        body: {
          kind: effectiveKind,
          customerName: form.customerName.trim(),
          mobile: form.mobile.trim(),
          email: form.email.trim() || null,
          city: form.city.trim() || null,
          address: form.address.trim() || null,
          message: form.message.trim() || null,
          preferredContact: form.preferredContact,
          items,
          website: honeypot,
        },
      });
      const result: EnquiryDone = {
        ...res,
        name: form.customerName.trim(),
        mobile: normalizeMobile(form.mobile) ?? form.mobile.trim(),
        preferredContact: form.preferredContact,
        kind: effectiveKind,
      };
      if (onSubmitted) onSubmitted(result);
      else setDone(result);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) return <EnquirySuccess done={done} whatsapp={whatsapp} />;

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {serverError && <Alert tone="danger">{serverError}</Alert>}
      {items.length > 0 && allowOrderRequest && (
        <fieldset>
          <legend className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-navy-700">What would you like?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["order_request", "Request an order", "We confirm stock and the final bill, then prepare your order."],
                ["enquiry", "Ask for a quote / advice", "Questions about price, sizes or availability — no commitment."],
              ] as const
            ).map(([value, title, hint]) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-xl border p-3 text-sm transition-colors",
                  kind === value ? "border-navy-900 bg-navy-50 ring-1 ring-navy-900" : "border-navy-200 hover:border-navy-300",
                )}
              >
                <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="mt-1 accent-navy-900" />
                <span>
                  <span className="block font-bold text-navy-900">{title}</span>
                  <span className="block text-xs text-navy-500">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="eq-name" required error={errors.customerName}>
          <Input id="eq-name" autoComplete="name" value={form.customerName} onChange={set("customerName")} aria-invalid={!!errors.customerName} maxLength={120} />
        </Field>
        <Field label="Mobile number" htmlFor="eq-mobile" required error={errors.mobile} hint="10-digit Indian mobile">
          <Input id="eq-mobile" type="tel" inputMode="tel" autoComplete="tel" value={form.mobile} onChange={set("mobile")} aria-invalid={!!errors.mobile} maxLength={16} placeholder="98XXXXXXXX" />
        </Field>
        <Field label="Email (optional)" htmlFor="eq-email" error={errors.email}>
          <Input id="eq-email" type="email" autoComplete="email" value={form.email} onChange={set("email")} aria-invalid={!!errors.email} maxLength={120} />
        </Field>
        <Field label="City / village (optional)" htmlFor="eq-city">
          <Input id="eq-city" autoComplete="address-level2" value={form.city} onChange={set("city")} maxLength={80} />
        </Field>
      </div>
      <Field label="Delivery address (optional)" htmlFor="eq-address">
        <Textarea id="eq-address" autoComplete="street-address" value={form.address} onChange={set("address")} maxLength={400} className="min-h-16" />
      </Field>
      <Field label={items.length ? "Anything else? (optional)" : "What do you need?"} htmlFor="eq-message" required={!items.length} error={errors.message}>
        <Textarea
          id="eq-message"
          value={form.message}
          onChange={set("message")}
          aria-invalid={!!errors.message}
          maxLength={1000}
          placeholder={items.length ? "Delivery timing, colours, sizes you're unsure about…" : "e.g. 20 L white interior emulsion, 1000 L water tank, CPVC ¾\" pipes and fittings for a bathroom…"}
        />
      </Field>
      <fieldset>
        <legend className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-navy-700">Preferred contact</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["whatsapp", "WhatsApp"],
              ["call", "Phone call"],
              ["email", "Email"],
            ] as const
          ).map(([v, label]) => (
            <label
              key={v}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                form.preferredContact === v ? "border-navy-900 bg-navy-900 text-white" : "border-navy-200 text-navy-800 hover:border-navy-300",
              )}
            >
              <input type="radio" name="preferredContact" value={v} checked={form.preferredContact === v} onChange={() => setForm((f) => ({ ...f, preferredContact: v }))} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      {/* Honeypot for bots — hidden from people and assistive technology */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="eq-website">Website</label>
        <input id="eq-website" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" size="lg" loading={busy} icon={<Send className="h-4 w-4" />} className="sm:min-w-56">
          {effectiveKind === "order_request" ? "Send order request" : "Send enquiry"}
        </Button>
        <p className="text-xs text-navy-500">We use your details only to reply to this request. No payment is taken online.</p>
      </div>
    </form>
  );
}

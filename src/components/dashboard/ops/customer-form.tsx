"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { STATES } from "@/lib/india";

export interface CustomerFormValue {
  id?: string;
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
  customerType: "retail" | "contractor" | "business";
  notes: string | null;
}

const EMPTY: CustomerFormValue = {
  name: "",
  mobile: "",
  whatsapp: "",
  email: "",
  businessName: "",
  gstin: "",
  billingAddress: "",
  city: "",
  stateCode: "24",
  pincode: "",
  customerType: "retail",
  notes: "",
};

export function CustomerFormButton({ customer }: { customer?: CustomerFormValue }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<CustomerFormValue>(customer ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof CustomerFormValue>(k: K, val: CustomerFormValue[K]) => setV((x) => ({ ...x, [k]: val }));

  const save = async () => {
    setBusy(true);
    setError(null);
    const body = {
      name: v.name,
      mobile: v.mobile || null,
      whatsapp: v.whatsapp || null,
      email: v.email || null,
      businessName: v.businessName || null,
      gstin: v.gstin || null,
      billingAddress: v.billingAddress || null,
      city: v.city || null,
      stateCode: v.stateCode || null,
      pincode: v.pincode || null,
      customerType: v.customerType,
      notes: v.notes || null,
    };
    try {
      const saved = await apiFetch<{ id: string }>(customer?.id ? `/api/customers/${customer.id}` : "/api/customers", {
        method: customer?.id ? "PATCH" : "POST",
        body,
      });
      toast(customer?.id ? "Customer updated" : "Customer added");
      setOpen(false);
      if (!customer?.id) router.push(`/dashboard/customers/${saved.id}`);
      else router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {customer ? (
        <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setOpen(true)}>
          Edit
        </Button>
      ) : (
        <Button variant="gold" icon={<UserPlus className="h-4 w-4" />} onClick={() => setOpen(true)}>
          Add customer
        </Button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={customer ? `Edit ${customer.name}` : "Add customer"}
        description="Only the name is required. Collect other details only when the customer agrees or the bill needs them (GSTIN, address and state for registered buyers)."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy} disabled={!v.name.trim()} onClick={save}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="c-name" required>
              <Input id="c-name" value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={120} autoFocus />
            </Field>
            <Field label="Mobile" htmlFor="c-mobile" hint="10-digit Indian mobile">
              <Input id="c-mobile" inputMode="tel" value={v.mobile ?? ""} onChange={(e) => set("mobile", e.target.value)} maxLength={16} />
            </Field>
            <Field label="WhatsApp" htmlFor="c-whatsapp" hint="Only if it is not the mobile number">
              <Input id="c-whatsapp" inputMode="tel" value={v.whatsapp ?? ""} onChange={(e) => set("whatsapp", e.target.value)} maxLength={16} />
            </Field>
            <Field label="Business name" htmlFor="c-biz">
              <Input id="c-biz" value={v.businessName ?? ""} onChange={(e) => set("businessName", e.target.value)} maxLength={160} />
            </Field>
            <Field label="GSTIN" htmlFor="c-gstin" hint="Checked for format and check digit">
              <Input id="c-gstin" value={v.gstin ?? ""} onChange={(e) => set("gstin", e.target.value.toUpperCase())} maxLength={15} className="uppercase tabular" />
            </Field>
            <Field label="Customer type" htmlFor="c-type">
              <Select id="c-type" value={v.customerType} onChange={(e) => set("customerType", e.target.value as CustomerFormValue["customerType"])}>
                <option value="retail">Retail</option>
                <option value="contractor">Contractor</option>
                <option value="business">Business</option>
              </Select>
            </Field>
            <Field label="Email" htmlFor="c-email">
              <Input id="c-email" type="email" value={v.email ?? ""} onChange={(e) => set("email", e.target.value)} maxLength={120} />
            </Field>
          </div>
          <Field label="Billing address" htmlFor="c-addr">
            <Textarea id="c-addr" value={v.billingAddress ?? ""} onChange={(e) => set("billingAddress", e.target.value)} maxLength={400} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="City / town" htmlFor="c-city">
              <Input id="c-city" value={v.city ?? ""} onChange={(e) => set("city", e.target.value)} maxLength={80} />
            </Field>
            <Field label="State" htmlFor="c-state">
              <Select id="c-state" value={v.stateCode ?? ""} onChange={(e) => set("stateCode", e.target.value)}>
                <option value="">—</option>
                {STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="PIN code" htmlFor="c-pin">
              <Input id="c-pin" inputMode="numeric" value={v.pincode ?? ""} onChange={(e) => set("pincode", e.target.value)} maxLength={6} />
            </Field>
          </div>
          <Field label="Notes" htmlFor="c-notes">
            <Textarea id="c-notes" value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} maxLength={500} />
          </Field>
        </div>
      </Dialog>
    </>
  );
}

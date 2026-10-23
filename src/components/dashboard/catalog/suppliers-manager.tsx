"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { Alert, EmptyState } from "@/components/ui/page";
import { rowHover, tdCode, tdText, th, thNum, withPy } from "@/components/dashboard/table";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";

export interface SupplierRow {
  id: string;
  name: string;
  gstin: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
}

export function SuppliersManager({ suppliers, canManage }: { suppliers: SupplierRow[]; canManage: boolean }) {
  const [dialog, setDialog] = useState<{ open: boolean; supplier: SupplierRow | null }>({ open: false, supplier: null });
  return (
    <Card>
      <CardHeader
        title="Suppliers"
        description="Who you buy from. Used when recording purchase costs and, later, goods received."
        actions={
          canManage && (
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setDialog({ open: true, supplier: null })}>
              New supplier
            </Button>
          )
        }
      />
      {suppliers.length === 0 ? (
        <div className="p-5">
          <EmptyState title="No suppliers yet" description={canManage ? "Add the distributors and dealers you purchase from." : undefined} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr>
                <th className={th}>Supplier</th>
                <th className={th}>GSTIN</th>
                <th className={th}>Contact</th>
                <th className={thNum}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className={rowHover}>
                  <td className={tdText}>
                    <div className="flex flex-wrap items-center gap-2 font-semibold">
                      {s.name} {!s.isActive && <Badge tone="red">Inactive</Badge>}
                    </div>
                    {s.address && <div className="mt-0.5 text-xs text-navy-500">{s.address}</div>}
                  </td>
                  <td className={tdCode}>{s.gstin ?? <span className="text-navy-300">—</span>}</td>
                  <td className={tdText}>
                    {s.mobile ? <span className="font-mono text-[13px]">{s.mobile}</span> : <span className="text-navy-300">—</span>}
                    {s.email && <div className="text-xs text-navy-500">{s.email}</div>}
                  </td>
                  <td className={`${withPy(tdText, "py-1.5")} w-px text-right`}>
                    {canManage && (
                      <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setDialog({ open: true, supplier: s })}>
                        Edit
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={dialog.open} onClose={() => setDialog({ open: false, supplier: null })} title={dialog.supplier ? `Edit ${dialog.supplier.name}` : "New supplier"}>
        {dialog.open && <SupplierForm key={dialog.supplier?.id ?? "new"} supplier={dialog.supplier} onDone={() => setDialog({ open: false, supplier: null })} />}
      </Dialog>
    </Card>
  );
}

function SupplierForm({ supplier, onDone }: { supplier: SupplierRow | null; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({
    name: supplier?.name ?? "",
    gstin: supplier?.gstin ?? "",
    mobile: supplier?.mobile ?? "",
    email: supplier?.email ?? "",
    address: supplier?.address ?? "",
    notes: supplier?.notes ?? "",
    isActive: supplier?.isActive ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/admin/suppliers", { method: "POST", body: { ...(supplier ? { id: supplier.id } : {}), ...f, name: f.name.trim() } });
      toast(supplier ? "Supplier saved" : "Supplier added");
      router.refresh();
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Name" htmlFor="s-name" required>
        <Input id="s-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} maxLength={120} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="GSTIN" htmlFor="s-gstin" hint="Checked for format and check digit.">
          <Input id="s-gstin" value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} maxLength={15} />
        </Field>
        <Field label="Mobile" htmlFor="s-mobile">
          <Input id="s-mobile" inputMode="tel" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} maxLength={16} />
        </Field>
        <Field label="Email" htmlFor="s-email" className="sm:col-span-2">
          <Input id="s-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={120} />
        </Field>
      </div>
      <Field label="Address" htmlFor="s-address">
        <Textarea id="s-address" rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} maxLength={400} />
      </Field>
      <Field label="Notes" htmlFor="s-notes">
        <Textarea id="s-notes" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={500} />
      </Field>
      <Checkbox checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} label="Active" />
      <div className="flex justify-end gap-2 border-t border-navy-100 pt-4">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={busy} disabled={f.name.trim().length < 2}>
          {supplier ? "Save" : "Add supplier"}
        </Button>
      </div>
    </form>
  );
}

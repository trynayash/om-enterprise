"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { Alert, EmptyState } from "@/components/ui/page";
import { nameLink, rowHover, tdNum, tdText, th, thNum, withPy } from "@/components/dashboard/table";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";

export interface BrandRow {
  id: string;
  name: string;
  manufacturer: string | null;
  description: string | null;
  website: string | null;
  isActive: boolean;
  productCount: number;
}

export function BrandsManager({ brands, canCreate, canEdit }: { brands: BrandRow[]; canCreate: boolean; canEdit: boolean }) {
  const [dialog, setDialog] = useState<{ open: boolean; brand: BrandRow | null }>({ open: false, brand: null });
  return (
    <Card>
      <CardHeader
        title="Brands"
        description="Brands you stock, e.g. Berger, Umiya Gold."
        actions={
          canCreate && (
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setDialog({ open: true, brand: null })}>
              New brand
            </Button>
          )
        }
      />
      {brands.length === 0 ? (
        <div className="p-5">
          <EmptyState title="No brands yet" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px]">
            <thead>
              <tr>
                <th className={th}>Brand</th>
                <th className={thNum}>Products</th>
                <th className={thNum}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.id} className={rowHover}>
                  <td className={tdText}>
                    <span className="flex flex-wrap items-center gap-2">
                      <Link href={`/dashboard/products?brandId=${b.id}`} className={nameLink}>
                        {b.name}
                      </Link>
                      {!b.isActive && <Badge tone="red">Inactive</Badge>}
                    </span>
                    {b.manufacturer && <div className="mt-0.5 text-xs text-navy-500">{b.manufacturer}</div>}
                  </td>
                  <td className={tdNum}>{b.productCount}</td>
                  <td className={`${withPy(tdText, "py-1.5")} w-px text-right`}>
                    {canEdit && (
                      <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setDialog({ open: true, brand: b })}>
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
      <Dialog open={dialog.open} onClose={() => setDialog({ open: false, brand: null })} title={dialog.brand ? `Edit ${dialog.brand.name}` : "New brand"}>
        {dialog.open && <BrandForm key={dialog.brand?.id ?? "new"} brand={dialog.brand} onDone={() => setDialog({ open: false, brand: null })} />}
      </Dialog>
    </Card>
  );
}

function BrandForm({ brand, onDone }: { brand: BrandRow | null; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({
    name: brand?.name ?? "",
    manufacturer: brand?.manufacturer ?? "",
    description: brand?.description ?? "",
    website: brand?.website ?? "",
    isActive: brand?.isActive ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { ...f, name: f.name.trim() };
      if (brand) await apiFetch(`/api/admin/brands/${brand.id}`, { method: "PATCH", body });
      else await apiFetch("/api/admin/brands", { method: "POST", body });
      toast(brand ? "Brand saved" : "Brand created");
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
      <Field label="Brand name" htmlFor="b-name" required>
        <Input id="b-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={80} />
      </Field>
      <Field label="Manufacturer (company)" htmlFor="b-mfr">
        <Input id="b-mfr" value={f.manufacturer} onChange={(e) => setF({ ...f, manufacturer: e.target.value })} maxLength={120} />
      </Field>
      <Field label="Official website" htmlFor="b-web">
        <Input id="b-web" type="url" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} maxLength={200} placeholder="https://" />
      </Field>
      <Field label="Notes" htmlFor="b-desc">
        <Textarea id="b-desc" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={500} />
      </Field>
      <Checkbox checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} label="Active" />
      <div className="flex justify-end gap-2 border-t border-navy-100 pt-4">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={busy} disabled={!f.name.trim()}>
          {brand ? "Save" : "Create"}
        </Button>
      </div>
    </form>
  );
}

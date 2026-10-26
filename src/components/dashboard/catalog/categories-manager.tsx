"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EyeOff, FolderPlus, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert, EmptyState } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { CATEGORY_ICONS, CategoryIcon } from "./category-icon";
import { categoryTree } from "./types";

export interface CategoryRow {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  isPublished: boolean;
  targetMarginPercent: string | null;
  minMarginPercent: string | null;
  productCount: number;
}

export function CategoriesManager({ categories, canCreate, canEdit, canConfigureMargins }: { categories: CategoryRow[]; canCreate: boolean; canEdit: boolean; canConfigureMargins: boolean }) {
  const tree = categoryTree(categories);
  const [dialog, setDialog] = useState<{ open: boolean; category: CategoryRow | null; parentId: string | null }>({ open: false, category: null, parentId: null });

  return (
    <Card>
      <CardHeader
        title="Categories"
        description="Shown on the website and used to group products. Margin rules set here apply to every product in the category unless a variant overrides them."
        actions={
          canCreate && (
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setDialog({ open: true, category: null, parentId: null })}>
              New category
            </Button>
          )
        }
      />
      {tree.length === 0 ? (
        <div className="p-5">
          <EmptyState title="No categories" description="Create your first category." />
        </div>
      ) : (
        <ul className="divide-y divide-navy-100">
          {tree.map((c) => (
            <li
              key={c.id}
              className={cn("group flex flex-wrap items-center gap-x-3 gap-y-2 py-3 pr-4 transition-colors duration-150 hover:bg-paper/60", c.depth ? "bg-paper/30" : "")}
              style={{ paddingLeft: `${1.25 + c.depth * 1.75}rem` }}
            >
              {c.depth > 0 && <span aria-hidden className="-ml-3 h-px w-2.5 bg-navy-300" />}
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md border", c.depth ? "border-navy-100 bg-white text-navy-400" : "border-navy-200 bg-white text-navy-700")}>
                <CategoryIcon name={c.icon} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/dashboard/products?categoryId=${c.id}`} className="font-semibold text-navy-900 underline-offset-[3px] hover:underline">
                    {c.name}
                  </Link>
                  <span className="font-mono text-[11.5px] tabular text-navy-500">
                    {c.productCount} product{c.productCount === 1 ? "" : "s"}
                  </span>
                  {!c.isActive && <Badge tone="red">Inactive</Badge>}
                  {!c.isPublished && (
                    <Badge>
                      <EyeOff className="h-3 w-3" /> Hidden on website
                    </Badge>
                  )}
                  {(c.minMarginPercent || c.targetMarginPercent) && (
                    <Badge>
                      {c.targetMarginPercent ? `target ${Number(c.targetMarginPercent)}%` : ""}
                      {c.targetMarginPercent && c.minMarginPercent ? " · " : ""}
                      {c.minMarginPercent ? `min ${Number(c.minMarginPercent)}%` : ""}
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 text-xs leading-relaxed text-navy-500">
                  <span className="font-mono text-[11.5px] text-navy-400">/{c.slug}</span>
                  {c.description ? <> · {c.description}</> : null}
                </div>
              </div>
              <div className="flex gap-0.5">
                {canCreate && c.depth < 2 && (
                  <Button size="sm" variant="ghost" icon={<FolderPlus className="h-3.5 w-3.5" />} onClick={() => setDialog({ open: true, category: null, parentId: c.id })} aria-label={`Add a sub-category to ${c.name}`}>
                    <span className="hidden sm:inline">Sub-category</span>
                  </Button>
                )}
                {canEdit && (
                  <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setDialog({ open: true, category: c, parentId: c.parentId })} aria-label={`Edit ${c.name}`}>
                    <span className="hidden sm:inline">Edit</span>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={dialog.open}
        onClose={() => setDialog({ open: false, category: null, parentId: null })}
        title={dialog.category ? `Edit ${dialog.category.name}` : dialog.parentId ? "New sub-category" : "New category"}
      >
        {dialog.open && (
          <CategoryForm
            key={dialog.category?.id ?? `new-${dialog.parentId}`}
            category={dialog.category}
            parentId={dialog.parentId}
            categories={categories}
            canConfigureMargins={canConfigureMargins}
            onDone={() => setDialog({ open: false, category: null, parentId: null })}
          />
        )}
      </Dialog>
    </Card>
  );
}

function descendantsOf(id: string, all: CategoryRow[]): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of all) {
      if (c.parentId && out.has(c.parentId) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
    }
  }
  return out;
}

function CategoryForm({
  category,
  parentId,
  categories,
  canConfigureMargins,
  onDone,
}: {
  category: CategoryRow | null;
  parentId: string | null;
  categories: CategoryRow[];
  canConfigureMargins: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({
    name: category?.name ?? "",
    slug: category?.slug ?? "",
    parentId: category?.parentId ?? parentId ?? "",
    description: category?.description ?? "",
    icon: category?.icon ?? categories.find((c) => c.id === parentId)?.icon ?? "",
    sortOrder: String(category?.sortOrder ?? categories.length + 1),
    isActive: category?.isActive ?? true,
    isPublished: category?.isPublished ?? true,
    targetMarginPercent: category?.targetMarginPercent ? String(Number(category.targetMarginPercent)) : "",
    minMarginPercent: category?.minMarginPercent ? String(Number(category.minMarginPercent)) : "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const excluded = category ? descendantsOf(category.id, categories) : new Set<string>();
  const parentOptions = categoryTree(categories).filter((c) => !excluded.has(c.id));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {
      name: f.name.trim(),
      parentId: f.parentId || null,
      description: f.description,
      icon: f.icon || null,
      sortOrder: Number(f.sortOrder) || 0,
      isActive: f.isActive,
      isPublished: f.isPublished,
    };
    if (f.slug.trim() && f.slug.trim() !== category?.slug) body.slug = f.slug.trim();
    if (canConfigureMargins) {
      body.targetMarginPercent = f.targetMarginPercent.trim() || null;
      body.minMarginPercent = f.minMarginPercent.trim() || null;
    }
    try {
      if (category) await apiFetch(`/api/admin/categories/${category.id}`, { method: "PATCH", body });
      else await apiFetch("/api/admin/categories", { method: "POST", body });
      toast(category ? "Category saved" : "Category created");
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="cat-name" required className="sm:col-span-2">
          <Input id="cat-name" value={f.name} onChange={(e) => set("name", e.target.value)} required minLength={2} maxLength={80} />
        </Field>
        <Field label="Parent category" htmlFor="cat-parent">
          <Select id="cat-parent" value={f.parentId} onChange={(e) => set("parentId", e.target.value)}>
            <option value="">— Top level —</option>
            {parentOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {"  ".repeat(c.depth)}
                {c.depth ? "↳ " : ""}
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Web address (slug)" htmlFor="cat-slug" hint={category ? "Changing it changes the category's website link." : "Leave blank to generate from the name."}>
          <Input id="cat-slug" value={f.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} maxLength={80} />
        </Field>
        <Field label="Icon" htmlFor="cat-icon">
          <Select id="cat-icon" value={f.icon} onChange={(e) => set("icon", e.target.value)}>
            <option value="">Folder</option>
            {CATEGORY_ICONS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Display order" htmlFor="cat-sort">
          <Input id="cat-sort" type="number" min={0} max={10000} value={f.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="cat-desc" className="sm:col-span-2">
          <Textarea id="cat-desc" rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={500} />
        </Field>
        {canConfigureMargins && (
          <>
            <Field label="Target gross margin %" htmlFor="cat-target" hint="For price suggestions. Blank = global default.">
              <Input id="cat-target" inputMode="decimal" value={f.targetMarginPercent} onChange={(e) => set("targetMarginPercent", e.target.value)} />
            </Field>
            <Field label="Minimum gross margin %" htmlFor="cat-min" hint="Below this, sales need approval.">
              <Input id="cat-min" inputMode="decimal" value={f.minMarginPercent} onChange={(e) => set("minMarginPercent", e.target.value)} />
            </Field>
          </>
        )}
        <Checkbox checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} label="Active" />
        <Checkbox checked={f.isPublished} onChange={(e) => set("isPublished", e.target.checked)} label="Show on the website" />
      </div>
      <div className="flex justify-end gap-2 border-t border-navy-100 pt-4">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={busy} disabled={f.name.trim().length < 2}>
          {category ? "Save" : "Create"}
        </Button>
      </div>
    </form>
  );
}

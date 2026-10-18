import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { listBrands, listCategories, listTaxClasses, listUnits } from "@/server/services/catalog";
import { PageHeader, PageSkeleton } from "@/components/ui/page";
import { ProductForm } from "@/components/dashboard/catalog/product-form";

export const metadata = { title: "New product" };

export default function NewProductPage(props: PageProps<"/dashboard/products/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewProductContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function NewProductContent({ searchParams }: { searchParams: PageProps<"/dashboard/products/new">["searchParams"] }) {
  const actor = await requirePageActor("catalog.create");
  const sp = await searchParams;
  const [categories, brands, units, taxClasses] = [await listCategories(), await listBrands(), await listUnits(), await listTaxClasses()];
  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard/products" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-navy-600 hover:text-navy-900">
        <ArrowLeft className="h-4 w-4" /> Products
      </Link>
      <PageHeader eyebrow="Catalogue" title="New product" description="New products start hidden from the website as drafts until their information has been reviewed." />
      <ProductForm
        mode="create"
        canEdit
        canMarkSample={actor.isSuperAdmin}
        defaultCategoryId={typeof sp.categoryId === "string" ? sp.categoryId : undefined}
        categories={categories.map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, sortOrder: c.sortOrder, isActive: c.isActive }))}
        brands={brands.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name }))}
        units={units.filter((u) => u.isActive).map((u) => ({ code: u.code, name: u.name, decimals: u.decimals, uqc: u.uqc }))}
        taxClasses={taxClasses.map((t) => ({ id: t.id, name: t.name, gstRate: t.gstRate, cessRate: t.cessRate, isExempt: t.isExempt, isActive: t.isActive }))}
      />
    </div>
  );
}

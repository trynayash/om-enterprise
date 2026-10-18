import { Suspense } from "react";
import Link from "next/link";
import { Package, Plus, Star, Upload } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { listBrands, listCategories, listProductsAdmin, type AdminProductFilter } from "@/server/services/catalog";
import { EmptyState, PageHeader, PageSkeleton, TableWrap, td, th } from "@/components/ui/page";
import { LinkButton } from "@/components/ui/button";
import { Badge, SampleBadge, StatusBadge } from "@/components/ui/badge";
import { DateTime } from "@/components/ui/money";
import { ProductFilters } from "@/components/dashboard/catalog/product-filters";

export const metadata = { title: "Products" };

const STATUS_VALUES = ["all", "published", "unpublished", "inactive", "sample", "needs_review"] as const;

export default function ProductsPage(props: PageProps<"/dashboard/products">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProductsContent searchParams={props.searchParams} />
    </Suspense>
  );
}

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

async function ProductsContent({ searchParams }: { searchParams: PageProps<"/dashboard/products">["searchParams"] }) {
  const actor = await requirePageActor(["catalog.view", "catalog.edit"]);
  const sp = await searchParams;
  const statusParam = one(sp.status);
  const status = (STATUS_VALUES as readonly string[]).includes(statusParam ?? "") ? (statusParam as AdminProductFilter["status"]) : "all";
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const filter: AdminProductFilter = {
    q: one(sp.q) || undefined,
    categoryId: one(sp.categoryId) || undefined,
    brandId: one(sp.brandId) || undefined,
    status,
    page,
    pageSize: 40,
  };
  const [result, categories, brands] = [await listProductsAdmin(actor, filter), await listCategories(), await listBrands()];
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const pageHref = (p: number) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const val = one(v);
      if (val && k !== "page") next.set(k, val);
    }
    if (p > 1) next.set("page", String(p));
    return `/dashboard/products${next.size ? `?${next}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        eyebrow="Catalogue"
        title="Products"
        description="Every product and variant sold at the counter and shown on the website. Prices and costs are managed per variant inside each product."
        actions={
          <>
            {can(actor, "catalog.import") && (
              <LinkButton href="/dashboard/import" variant="outline" icon={<Upload className="h-4 w-4" />}>
                Bulk import
              </LinkButton>
            )}
            {can(actor, "catalog.create") && (
              <LinkButton href="/dashboard/products/new" icon={<Plus className="h-4 w-4" />}>
                New product
              </LinkButton>
            )}
          </>
        }
      />
      <ProductFilters
        categories={categories.map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, sortOrder: c.sortOrder, isActive: c.isActive }))}
        brands={brands.map((b) => ({ id: b.id, name: b.name }))}
      />

      {result.items.length === 0 ? (
        <EmptyState
          icon={<Package className="h-10 w-10" />}
          title={filter.q || filter.categoryId || filter.brandId || status !== "all" ? "No products match these filters" : "No products yet"}
          description="Add products one by one, or import a spreadsheet of products and variants."
          action={can(actor, "catalog.create") ? <LinkButton href="/dashboard/products/new">Add a product</LinkButton> : undefined}
        />
      ) : (
        <>
          {/* Phones: stacked cards */}
          <ul className="space-y-2 md:hidden">
            {result.items.map((p) => (
              <li key={p.id}>
                <Link href={`/dashboard/products/${p.id}`} className="block rounded-2xl border border-navy-100 bg-white p-4 shadow-card active:bg-navy-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-navy-900">{p.name}</div>
                      <div className="text-xs text-navy-500">
                        {[p.brandName, p.categoryName].filter(Boolean).join(" · ")} · {p.variantCount} variant{p.variantCount === 1 ? "" : "s"}
                      </div>
                    </div>
                    {p.isPublished ? <Badge tone="green">Published</Badge> : <Badge>Hidden</Badge>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {p.isSample && <SampleBadge />}
                    <StatusBadge status={p.reviewStatus} />
                    {p.isFeatured && (
                      <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-gold-700">
                        <Star className="h-3 w-3 fill-gold-500 text-gold-500" /> Featured
                      </span>
                    )}
                    {!p.isActive && <Badge tone="red">Inactive</Badge>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <TableWrap className="hidden md:block">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr>
                  <th className={th}>Product</th>
                  <th className={th}>Brand</th>
                  <th className={th}>Category</th>
                  <th className={`${th} text-right`}>Variants</th>
                  <th className={th}>Information</th>
                  <th className={th}>Website</th>
                  <th className={th}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((p) => (
                  <tr key={p.id} className="hover:bg-navy-50/50">
                    <td className={td}>
                      <Link href={`/dashboard/products/${p.id}`} className="font-semibold text-navy-900 hover:text-gold-700 hover:underline">
                        {p.name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {p.isSample && <SampleBadge />}
                        {p.isFeatured && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-gold-700">
                            <Star className="h-3 w-3 fill-gold-500 text-gold-500" /> Featured
                          </span>
                        )}
                        {!p.isActive && <Badge tone="red">Inactive</Badge>}
                        {p.model && <span className="text-xs text-navy-500">Model {p.model}</span>}
                      </div>
                    </td>
                    <td className={td}>{p.brandName ?? <span className="text-navy-400">—</span>}</td>
                    <td className={td}>{p.categoryName}</td>
                    <td className={`${td} text-right tabular`}>{p.variantCount}</td>
                    <td className={td}>
                      <StatusBadge status={p.reviewStatus === "approved" ? "approved" : p.reviewStatus} />
                    </td>
                    <td className={td}>{p.isPublished ? <Badge tone="green">Published</Badge> : <Badge>Hidden</Badge>}</td>
                    <td className={`${td} text-navy-600`}>
                      <DateTime value={p.updatedAt} dateOnly />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-navy-600">
            <span>
              {result.total} product{result.total === 1 ? "" : "s"} · page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <LinkButton href={pageHref(page - 1)} variant="outline" size="sm">
                  Previous
                </LinkButton>
              )}
              {page < totalPages && (
                <LinkButton href={pageHref(page + 1)} variant="outline" size="sm">
                  Next
                </LinkButton>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

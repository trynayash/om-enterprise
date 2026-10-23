import { Suspense } from "react";
import Link from "next/link";
import { Package, Plus, Star, Upload } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { listBrands, listCategories, listProductsAdmin, type AdminProductFilter } from "@/server/services/catalog";
import { EmptyState, PageHeader, PageSkeleton, TableWrap } from "@/components/ui/page";
import { LinkButton } from "@/components/ui/button";
import { Badge, SampleBadge, StatusBadge } from "@/components/ui/badge";
import { DateTime } from "@/components/ui/money";
import { cn } from "@/components/ui/cn";
import { ProductFilters } from "@/components/dashboard/catalog/product-filters";
import { Pagination } from "@/components/dashboard/ops/pagination";
import { nameLink, rowHover, tdMuted, tdNum, tdText, th, thNum } from "@/components/dashboard/table";

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
          <ul className="divide-y divide-navy-100 overflow-hidden rounded-xl border border-navy-100 bg-white shadow-card md:hidden">
            {result.items.map((p) => (
              <li key={p.id}>
                <Link href={`/dashboard/products/${p.id}`} className="block px-4 py-3.5 transition-colors active:bg-paper">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold leading-snug text-navy-900">{p.name}</div>
                      <div className="mt-0.5 text-xs text-navy-500">
                        {[p.brandName, p.categoryName].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <span className="shrink-0 whitespace-nowrap font-mono text-xs tabular text-navy-500">
                      {p.variantCount} variant{p.variantCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <ProductState published={p.isPublished} review={p.reviewStatus} />
                    <ProductFlags sample={p.isSample} featured={p.isFeatured} inactive={!p.isActive} />
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
                  <th className={thNum}>Variants</th>
                  <th className={th}>Status</th>
                  <th className={thNum}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((p) => (
                  <tr key={p.id} className={rowHover}>
                    <td className={tdText}>
                      <Link href={`/dashboard/products/${p.id}`} className={nameLink}>
                        {p.name}
                      </Link>
                      {(p.model || p.isSample || p.isFeatured || !p.isActive) && (
                        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <ProductFlags sample={p.isSample} featured={p.isFeatured} inactive={!p.isActive} />
                          {p.model && <span className="font-mono text-[11.5px] text-navy-500">Model {p.model}</span>}
                        </div>
                      )}
                    </td>
                    <td className={tdMuted}>{p.brandName ?? <span className="text-navy-300">—</span>}</td>
                    <td className={tdMuted}>{p.categoryName}</td>
                    <td className={tdNum}>{p.variantCount}</td>
                    <td className={tdText}>
                      <ProductState published={p.isPublished} review={p.reviewStatus} />
                    </td>
                    <td className={tdNum}>
                      <span className="text-navy-500">
                        <DateTime value={p.updatedAt} dateOnly />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <Pagination total={result.total} page={page} pageSize={result.pageSize} sp={sp} basePath="/dashboard/products" />
        </>
      )}
    </div>
  );
}

/**
 * Website state as a quiet dot; the review state is shown only when it isn't "approved",
 * so a list of finished products doesn't repeat the same two badges on every row.
 */
function ProductState({ published, review }: { published: boolean; review: "draft" | "pending_review" | "approved" }) {
  return (
    <span className="flex flex-col items-start gap-1">
      <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[13px]", published ? "text-navy-700" : "text-navy-400")}>
        <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", published ? "bg-emerald-600" : "border border-navy-300")} />
        {published ? "Published" : "Hidden"}
      </span>
      {review !== "approved" && <StatusBadge status={review} />}
    </span>
  );
}

function ProductFlags({ sample, featured, inactive }: { sample: boolean; featured: boolean; inactive: boolean }) {
  return (
    <>
      {sample && <SampleBadge />}
      {featured && (
        <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-gold-700">
          <Star className="h-3 w-3 fill-gold-500 text-gold-500" aria-hidden /> Featured
        </span>
      )}
      {inactive && <Badge tone="red">Inactive</Badge>}
    </>
  );
}

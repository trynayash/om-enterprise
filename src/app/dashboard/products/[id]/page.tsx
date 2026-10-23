import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { AppError } from "@/server/errors";
import { getProductAdmin, listBrands, listCategories, listTaxClasses, listUnits } from "@/server/services/catalog";
import { listSuppliers } from "@/server/services/inventory";
import { getSettings } from "@/server/settings";
import { PageHeader, PageSkeleton } from "@/components/ui/page";
import { Badge, SampleBadge, StatusBadge } from "@/components/ui/badge";
import { ProductForm } from "@/components/dashboard/catalog/product-form";
import { ReviewPublish } from "@/components/dashboard/catalog/review-publish";
import { ImagesManager } from "@/components/dashboard/catalog/images-manager";
import { VariantsManager } from "@/components/dashboard/catalog/variants-manager";
import type { CostDTO, PriceVersionDTO, PricingContextDTO, VariantRow } from "@/components/dashboard/catalog/types";
import type { CostVersion, PriceVersion } from "@/server/services/pricing";
import { BackLink } from "@/components/dashboard/back-link";
import { TitleStamps } from "@/components/dashboard/title-stamps";

export const metadata = { title: "Edit product" };

export default function ProductPage(props: PageProps<"/dashboard/products/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProductContent params={props.params} />
    </Suspense>
  );
}

function priceDTO(v: PriceVersion, showCost: boolean): PriceVersionDTO {
  const dto: PriceVersionDTO = {
    id: v.id,
    variantId: v.variantId,
    priceListId: v.priceListId,
    price: v.price,
    priceIncludesTax: v.priceIncludesTax,
    mrp: v.mrp,
    tiers: v.tiers ?? [],
    effectiveFrom: v.effectiveFrom.toISOString(),
    status: v.status,
    reason: v.reason,
    previousPrice: v.previousPrice,
    createdAt: v.createdAt.toISOString(),
    landedCostSnapshot: v.landedCostSnapshot,
    marginPercentSnapshot: v.marginPercentSnapshot,
  };
  // Never send cost/margin snapshots to users without cost access.
  return showCost ? dto : { ...dto, landedCostSnapshot: null, marginPercentSnapshot: null };
}

function costDTO(c: CostVersion): CostDTO {
  return {
    id: c.id,
    purchaseCost: c.purchaseCost,
    purchaseTaxRate: c.purchaseTaxRate,
    freight: c.freight,
    handling: c.handling,
    otherCosts: c.otherCosts,
    itcPolicy: c.itcPolicy,
    landedCost: c.landedCost,
    effectiveFrom: c.effectiveFrom.toISOString(),
    sourceRef: c.sourceRef,
  };
}

async function ProductContent({ params }: { params: PageProps<"/dashboard/products/[id]">["params"] }) {
  const actor = await requirePageActor(["catalog.view", "catalog.edit"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let data: Awaited<ReturnType<typeof getProductAdmin>>;
  try {
    data = await getProductAdmin(actor, id);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const [categories, brands, units, taxClasses, tax] = [await listCategories(), await listBrands(), await listUnits(), await listTaxClasses(), await getSettings("tax")];
  const suppliers = can(actor, "costs.edit") || can(actor, "inventory.view") || can(actor, "inventory.manage") ? await listSuppliers(actor) : [];
  const p = data.product;

  const perms = {
    canEdit: can(actor, "catalog.edit"),
    canCreate: can(actor, "catalog.create"),
    canPublish: can(actor, "catalog.publish"),
    canEditPrices: can(actor, "prices.edit"),
    canApprovePrices: can(actor, "prices.approve"),
    canSeeCosts: can(actor, "costs.view"),
    canEditCosts: can(actor, "costs.edit"),
    canConfigureMargins: can(actor, "discounts.configure"),
  };

  const variants: VariantRow[] = data.variants.map((v) => ({
    id: v.id,
    sku: v.sku,
    barcode: v.barcode,
    name: v.name,
    attributes: v.attributes ?? {},
    unitCode: v.unitCode,
    taxClassId: v.taxClassId,
    discountEligible: v.discountEligible,
    targetMarginPercent: v.targetMarginPercent,
    minMarginPercent: v.minMarginPercent,
    isActive: v.isActive,
    sortOrder: v.sortOrder,
    reorderLevel: v.reorderLevel,
  }));
  const pricesByList: Record<string, Record<string, PriceVersionDTO>> = {};
  for (const [listId, byVariant] of Object.entries(data.pricesByList)) {
    pricesByList[listId] = Object.fromEntries(Object.entries(byVariant).map(([vid, v]) => [vid, priceDTO(v as PriceVersion, perms.canSeeCosts)]));
  }
  const context: Record<string, PricingContextDTO> = Object.fromEntries(
    Object.entries(data.context).map(([vid, c]) => [
      vid,
      { gstRate: c.gstRate, cessRate: c.cessRate, isExempt: c.isExempt, minMarginPercent: c.minMarginPercent, targetMarginPercent: c.targetMarginPercent, discountEligible: c.discountEligible },
    ]),
  );
  const costs = data.costs ? Object.fromEntries(Object.entries(data.costs).map(([vid, c]) => [vid, costDTO(c as CostVersion)])) : null;
  const brand = brands.find((b) => b.id === p.brandId);

  return (
    <div>
      <BackLink href="/dashboard/products">Products</BackLink>
      <PageHeader
        eyebrow={brand ? `${brand.name} · Catalogue` : "Catalogue"}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.name}
            {p.isSample && (
              <TitleStamps>
                <SampleBadge />
              </TitleStamps>
            )}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={p.reviewStatus} />
            {p.isPublished ? <Badge tone="green">On website</Badge> : <Badge>Not on website</Badge>}
            {!p.isActive && <Badge tone="red">Inactive — can&apos;t be sold</Badge>}
            <span className="font-mono text-xs tabular text-navy-500">
              {variants.length} variant{variants.length === 1 ? "" : "s"}
            </span>
          </span>
        }
      />

      {p.isSample && (
        <div className="mb-6 rounded-lg border border-l-[3px] border-red-200 border-l-red-600 bg-red-50/80 px-4 py-3 text-sm leading-relaxed text-red-950">
          <b>Sample / demonstration product.</b> Its details and prices are placeholders, not real catalogue data. Sales that include it are training sales with separate numbering and are excluded from reports.
        </div>
      )}

      <div className="space-y-6">
        <VariantsManager
          productId={p.id}
          productName={p.name}
          defaultUnit={p.unitCode}
          variantAttributes={p.variantAttributes ?? []}
          variants={variants}
          units={units.map((u) => ({ code: u.code, name: u.name, decimals: u.decimals, uqc: u.uqc }))}
          taxClasses={taxClasses.map((t) => ({ id: t.id, name: t.name, gstRate: t.gstRate, cessRate: t.cessRate, isExempt: t.isExempt, isActive: t.isActive }))}
          priceLists={data.priceLists.map((l) => ({ id: l.id, code: l.code, name: l.name, isDefault: l.isDefault, isActive: l.isActive }))}
          pricesByList={pricesByList}
          pending={data.pending.map((v) => priceDTO(v as PriceVersion, perms.canSeeCosts))}
          scheduled={data.scheduled.map((v) => priceDTO(v as PriceVersion, perms.canSeeCosts))}
          costs={costs}
          context={context}
          conversions={data.conversions.map((c) => ({ id: c.id, variantId: c.variantId, unitCode: c.unitCode, factor: c.factor }))}
          compat={data.compat}
          compatVariants={data.compatVariants}
          suppliers={suppliers.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name }))}
          // Unconfirmed registration is previewed exactly like regular GST (same as the POS and cost rules).
          regType={tax.registrationType ?? "regular"}
          defaultIncludesTax={tax.pricesIncludeTaxByDefault}
          perms={perms}
          aside={
            <ReviewPublish
              productId={p.id}
              slug={p.slug}
              reviewStatus={p.reviewStatus}
              isPublished={p.isPublished}
              isActive={p.isActive}
              activeVariantCount={variants.filter((v) => v.isActive).length}
              canEdit={perms.canEdit}
              canPublish={perms.canPublish}
            />
          }
        />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <ProductForm
            mode="edit"
            canEdit={perms.canEdit}
            canMarkSample={actor.isSuperAdmin}
            product={{
              id: p.id,
              slug: p.slug,
              name: p.name,
              brandId: p.brandId,
              categoryId: p.categoryId,
              manufacturer: p.manufacturer,
              model: p.model,
              description: p.description,
              specifications: p.specifications ?? [],
              variantAttributes: p.variantAttributes ?? [],
              warrantyInfo: p.warrantyInfo,
              hsnCode: p.hsnCode,
              taxClassId: p.taxClassId,
              unitCode: p.unitCode,
              discountEligible: p.discountEligible,
              isActive: p.isActive,
              isPublished: p.isPublished,
              isFeatured: p.isFeatured,
              isSample: p.isSample,
              reviewStatus: p.reviewStatus,
              sourceInfo: p.sourceInfo,
              updatedAt: p.updatedAt.toISOString(),
            }}
            categories={categories.map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, sortOrder: c.sortOrder, isActive: c.isActive }))}
            brands={brands.filter((b) => b.isActive || b.id === p.brandId).map((b) => ({ id: b.id, name: b.name }))}
            units={units.filter((u) => u.isActive || u.code === p.unitCode).map((u) => ({ code: u.code, name: u.name, decimals: u.decimals, uqc: u.uqc }))}
            taxClasses={taxClasses.map((t) => ({ id: t.id, name: t.name, gstRate: t.gstRate, cessRate: t.cessRate, isExempt: t.isExempt, isActive: t.isActive }))}
          />
          <aside className="space-y-6">
            <ImagesManager
              productId={p.id}
              productName={p.name}
              canEdit={perms.canEdit}
              images={data.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt, variantId: i.variantId, sortOrder: i.sortOrder }))}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}

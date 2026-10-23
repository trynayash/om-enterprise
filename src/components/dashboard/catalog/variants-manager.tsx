"use client";
import { useState } from "react";
import { Clock, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/page";
import { tdCode, tdMuted, tdNum, tdText, th, thNum, withPy } from "@/components/dashboard/table";
import { cn } from "@/components/ui/cn";
import { formatINR } from "@/lib/money";
import { VariantDialog } from "./variant-dialog";
import { PricePanel } from "./price-panel";
import { CostPanel } from "./cost-panel";
import { UnitsCompatPanel } from "./units-compat-panel";
import { HistoryPanel } from "./history-panel";
import {
  marginInfo,
  type CatalogPermissions,
  type CompatDTO,
  type CompatVariantDTO,
  type ConversionDTO,
  type CostDTO,
  type PriceListOption,
  type PriceVersionDTO,
  type PricingContextDTO,
  type RegType,
  type SupplierOption,
  type TaxOption,
  type UnitOption,
  type VariantRow,
} from "./types";

export interface VariantsManagerProps {
  productId: string;
  productName: string;
  defaultUnit: string;
  variantAttributes: string[];
  variants: VariantRow[];
  units: UnitOption[];
  taxClasses: TaxOption[];
  priceLists: PriceListOption[];
  pricesByList: Record<string, Record<string, PriceVersionDTO>>;
  pending: PriceVersionDTO[];
  scheduled: PriceVersionDTO[];
  costs: Record<string, CostDTO> | null;
  context: Record<string, PricingContextDTO>;
  conversions: ConversionDTO[];
  compat: CompatDTO[];
  compatVariants: CompatVariantDTO[];
  suppliers: SupplierOption[];
  regType: RegType;
  defaultIncludesTax: boolean;
  perms: CatalogPermissions;
  /** Rendered beside the variants table on wide screens (e.g. review & publish). */
  aside?: React.ReactNode;
}

type Tab = "price" | "cost" | "units" | "history";

export function VariantsManager(props: VariantsManagerProps) {
  const { variants, perms, priceLists, pricesByList, units } = props;
  const defaultList = priceLists.find((l) => l.isDefault) ?? priceLists[0];
  const [selectedId, setSelectedId] = useState<string | null>(variants[0]?.id ?? null);
  const [tab, setTab] = useState<Tab>("price");
  const [dialog, setDialog] = useState<{ open: boolean; variant: VariantRow | null }>({ open: false, variant: null });
  const selected = variants.find((v) => v.id === selectedId) ?? variants[0] ?? null;
  const unitName = (code: string) => units.find((u) => u.code === code)?.name ?? code;

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "price", label: "Price", show: true },
    { key: "cost", label: "Cost", show: perms.canSeeCosts },
    { key: "units", label: "Units & compatibility", show: true },
    { key: "history", label: "History", show: true },
  ];

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
        <Card className="min-w-0">
          <CardHeader
            title="Variants"
            description="Each size, colour, capacity or class you sell — with its own SKU and price."
            actions={
              perms.canCreate && (
                <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setDialog({ open: true, variant: null })}>
                  Add variant
                </Button>
              )
            }
          />
          {variants.length === 0 ? (
            <CardBody>
              <EmptyState title="No variants yet" description="Add at least one variant (e.g. “White · 10 L”) with a SKU, then set its price." action={perms.canCreate && <Button onClick={() => setDialog({ open: true, variant: null })}>Add first variant</Button>} />
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr>
                    <th className={th}>Variant</th>
                    <th className={th}>SKU</th>
                    <th className={th}>Unit</th>
                    <th className={thNum}>{defaultList?.name ?? "Retail"} price</th>
                    {perms.canSeeCosts && <th className={thNum}>Cost · margin</th>}
                    <th className={thNum}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v) => {
                    const price = defaultList ? pricesByList[defaultList.id]?.[v.id] : undefined;
                    const cost = props.costs?.[v.id];
                    const ctx = props.context[v.id];
                    const info = price && ctx ? marginInfo(price.price, price.priceIncludesTax, ctx, cost?.landedCost ?? null, props.regType) : null;
                    const hasPending = props.pending.some((p) => p.variantId === v.id);
                    const isSel = selected?.id === v.id;
                    // Attributes usually repeat the variant name ("Size: 20 mm" for "20 mm"); show them only when they add something.
                    const extraAttrs = Object.entries(v.attributes).filter(([, val]) => val && !v.name.toLowerCase().includes(String(val).toLowerCase()));
                    return (
                      <tr
                        key={v.id}
                        onClick={() => setSelectedId(v.id)}
                        className={cn("cursor-pointer transition-colors duration-150", isSel ? "bg-gold-50/70" : "hover:bg-paper/60")}
                        aria-selected={isSel}
                      >
                        <td className={cn(tdText, isSel && "shadow-[inset_3px_0_0_var(--color-gold-500)]")}>
                          <div className="font-semibold leading-snug">{v.name}</div>
                          {extraAttrs.length > 0 && (
                            <div className="mt-0.5 text-xs text-navy-500">
                              {extraAttrs.map(([k, val]) => `${k}: ${val}`).join(" · ")}
                            </div>
                          )}
                          {(!v.isActive || hasPending) && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {!v.isActive && <Badge tone="red">Inactive</Badge>}
                              {hasPending && (
                                <Badge tone="amber">
                                  <Clock className="h-3 w-3" /> Price pending
                                </Badge>
                              )}
                            </div>
                          )}
                        </td>
                        <td className={tdCode}>
                          {v.sku}
                          {v.barcode && <div className="text-navy-400">{v.barcode}</div>}
                        </td>
                        <td className={tdMuted}>{unitName(v.unitCode)}</td>
                        <td className={tdNum}>
                          {price ? (
                            <>
                              <div className="font-semibold">{formatINR(price.price)}</div>
                              <div className="mt-0.5 font-sans text-[11px] text-navy-500">
                                {price.priceIncludesTax ? "incl." : "excl."} GST{price.tiers.length ? ` · ${price.tiers.length} break${price.tiers.length > 1 ? "s" : ""}` : ""}
                              </div>
                            </>
                          ) : (
                            <span className="font-sans text-xs font-medium text-red-700">No price</span>
                          )}
                        </td>
                        {perms.canSeeCosts && (
                          <td className={tdNum}>
                            {cost ? (
                              <>
                                <div>{formatINR(cost.landedCost)}</div>
                                <div className={cn("mt-0.5 text-[11px] font-medium", info?.belowCost ? "text-red-700" : info?.belowFloor ? "text-amber-700" : "text-emerald-700")}>
                                  {info?.margin ? `${info.margin.toFixed(1)}% margin` : "—"}
                                </div>
                              </>
                            ) : (
                              <span className="font-sans text-xs text-navy-400">Cost unknown</span>
                            )}
                          </td>
                        )}
                        <td className={`${withPy(tdText, "py-1.5")} text-right`}>
                          {perms.canEdit && (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Pencil className="h-3.5 w-3.5" />}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDialog({ open: true, variant: v });
                              }}
                            >
                              Edit
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        {props.aside && <div className="space-y-6">{props.aside}</div>}
      </div>

      {selected && (
        <Card className="mt-6">
          <CardHeader
            title={
              <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                {selected.name}
                <span className="font-mono text-[12.5px] font-normal text-navy-500">{selected.sku}</span>
              </span>
            }
            description="Pricing, cost and history for the selected variant. Click another row above to switch."
          />
          <div className="border-b border-navy-100 px-3 sm:px-5">
            <div className="-mb-px flex gap-5 overflow-x-auto" role="tablist">
              {tabs
                .filter((t) => t.show)
                .map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.key}
                    onClick={() => setTab(t.key)}
                    className={cn(
                      "whitespace-nowrap border-b-2 px-0.5 py-3 text-sm font-semibold transition-colors duration-150",
                      tab === t.key ? "border-gold-500 text-navy-950" : "border-transparent text-navy-500 hover:border-navy-200 hover:text-navy-900",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
            </div>
          </div>
          <CardBody className="py-5">
            {tab === "price" && (
              <PricePanel
                key={selected.id}
                variant={selected}
                ctx={props.context[selected.id]}
                priceLists={priceLists}
                current={Object.fromEntries(priceLists.map((l) => [l.id, pricesByList[l.id]?.[selected.id]]))}
                pending={props.pending.filter((p) => p.variantId === selected.id)}
                scheduled={props.scheduled.filter((p) => p.variantId === selected.id)}
                landedCost={props.costs?.[selected.id]?.landedCost ?? null}
                regType={props.regType}
                defaultIncludesTax={props.defaultIncludesTax}
                perms={perms}
                unitName={unitName(selected.unitCode).toLowerCase()}
              />
            )}
            {tab === "cost" && perms.canSeeCosts && (
              <CostPanel
                key={selected.id}
                variant={selected}
                cost={props.costs?.[selected.id] ?? null}
                retail={defaultList ? pricesByList[defaultList.id]?.[selected.id] : undefined}
                ctx={props.context[selected.id]}
                suppliers={props.suppliers}
                regType={props.regType}
                perms={perms}
                unitName={unitName(selected.unitCode).toLowerCase()}
              />
            )}
            {tab === "units" && (
              <UnitsCompatPanel
                key={selected.id}
                variant={selected}
                productId={props.productId}
                productName={props.productName}
                siblings={variants}
                conversions={props.conversions}
                compat={props.compat}
                compatVariants={props.compatVariants}
                units={units}
                canEdit={perms.canEdit}
              />
            )}
            {tab === "history" && (
              <HistoryPanel
                variantId={selected.id}
                refreshKey={[
                  ...priceLists.map((l) => pricesByList[l.id]?.[selected.id]?.id ?? ""),
                  props.pending.length,
                  props.scheduled.length,
                  props.costs?.[selected.id]?.id ?? "",
                ].join("|")}
              />
            )}
          </CardBody>
        </Card>
      )}

      <VariantDialog
        open={dialog.open}
        onClose={() => setDialog({ open: false, variant: null })}
        productId={props.productId}
        variant={dialog.variant}
        variantAttributes={props.variantAttributes}
        defaultUnit={props.defaultUnit}
        units={units}
        taxClasses={props.taxClasses}
        canConfigureMargins={perms.canConfigureMargins}
        nextSortOrder={variants.length}
        onSaved={(id) => setSelectedId(id)}
      />
    </>
  );
}

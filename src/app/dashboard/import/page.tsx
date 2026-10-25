import { Suspense } from "react";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { PageHeader, PageSkeleton, Alert } from "@/components/ui/page";
import { ImportWizard } from "@/components/dashboard/catalog/import-wizard";
import { listCategories, listTaxClasses, listUnits } from "@/server/services/catalog";

export const metadata = { title: "Bulk import" };

export default function ImportPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ImportContent />
    </Suspense>
  );
}

async function ImportContent() {
  const actor = await requirePageActor("catalog.import");
  const canPrice = can(actor, "prices.edit");
  const autoApprove = can(actor, "prices.approve");
  const canCost = can(actor, "costs.edit");
  const canPublish = can(actor, "catalog.publish");
  const [cats, unitRows, taxRows] = await Promise.all([listCategories(), listUnits(), listTaxClasses()]);
  const categories = cats.filter((c) => c.isActive).map((c) => ({ slug: c.slug, name: c.name }));
  const units = unitRows.filter((u) => u.isActive).map((u) => ({ code: u.code, name: u.name }));
  const gstRates = [...new Set(taxRows.filter((t) => t.isActive).map((t) => String(Number(t.gstRate))))].sort((a, b) => Number(a) - Number(b));
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Catalogue"
        title="Bulk import products"
        description="Add many products, sizes and prices at once from a company's price list or catalogue — PDF, Excel, Word, CSV and more. All-or-nothing: if any row has an error, nothing is imported."
      />
      <Alert tone="info" className="mb-6">
        With your access: selling prices {canPrice ? (autoApprove ? "go live immediately" : "are saved as pending — the Super Admin must approve them") : "are ignored"}; purchase costs{" "}
        {canCost ? "are recorded" : "are ignored"}. Never import guessed specifications or prices — use the manufacturer&apos;s catalogue or supplier price list.
      </Alert>
      <ImportWizard canPublish={canPublish} categories={categories} units={units} gstRates={gstRates} />
    </div>
  );
}

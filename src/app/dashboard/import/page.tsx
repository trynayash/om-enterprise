import { Suspense } from "react";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { PageHeader, PageSkeleton, Alert } from "@/components/ui/page";
import { ImportWizard } from "@/components/dashboard/catalog/import-wizard";

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
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Catalogue" title="Bulk import products" description="Add many products, sizes and prices at once from an Excel or CSV sheet. All-or-nothing: if any row has an error, nothing is imported." />
      <Alert tone="info" className="mb-6">
        With your access: selling prices {canPrice ? (autoApprove ? "go live immediately" : "are saved as pending — the Super Admin must approve them") : "are ignored"}; purchase costs{" "}
        {canCost ? "are recorded" : "are ignored"}. Never import guessed specifications or prices — use the manufacturer&apos;s catalogue or supplier price list.
      </Alert>
      <ImportWizard canPublish={canPublish} />
    </div>
  );
}

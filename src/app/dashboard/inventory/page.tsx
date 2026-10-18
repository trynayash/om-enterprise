import { Suspense } from "react";
import { Boxes, CheckCircle2, Lock } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { listSuppliers, recentMovements, stockLevels } from "@/server/services/inventory";
import { getSettings } from "@/server/settings";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader, PageSkeleton } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { SuppliersManager } from "@/components/dashboard/catalog/suppliers-manager";
import { StockPanel } from "@/components/dashboard/catalog/stock-panel";

export const metadata = { title: "Inventory" };

export default function InventoryPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <InventoryContent />
    </Suspense>
  );
}

async function InventoryContent() {
  const actor = await requirePageActor(["inventory.view", "inventory.manage"]);
  const inv = await getSettings("inventory");
  const suppliers = await listSuppliers(actor);
  const canManage = can(actor, "inventory.manage");
  const levels = inv.enabled ? await stockLevels(actor) : null;
  const recent = inv.enabled ? await recentMovements(actor) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalogue"
        title="Inventory"
        description="Stock by variant, suppliers and the stock ledger."
        actions={inv.enabled ? <Badge tone="green">Inventory tracking on</Badge> : <Badge>Inventory tracking off</Badge>}
      />

      {!inv.enabled && (
        <Card className="overflow-hidden">
          <div className="grid gap-0 md:grid-cols-[auto_1fr]">
            <div className="flex items-center justify-center bg-navy-900 px-8 py-8 text-gold-400">
              <Boxes className="h-14 w-14" />
            </div>
            <CardBody className="space-y-3 py-6">
              <h2 className="text-lg font-bold text-navy-900">Stock tracking is ready but not switched on</h2>
              <p className="max-w-3xl text-sm text-navy-600">
                The system already records everything needed for inventory — stock by variant and location, purchases and goods received, customer and supplier returns,
                damage, adjustments and reorder levels. Until it is switched on:
              </p>
              <ul className="space-y-1.5 text-sm text-navy-700">
                <li className="flex gap-2">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-navy-400" /> Sales never deduct stock, so nothing can go wrong with half-counted shelves.
                </li>
                <li className="flex gap-2">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-navy-400" /> The website never shows stock availability.
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Supplier records and purchase costs can already be maintained.
                </li>
              </ul>
              <p className="text-sm text-navy-600">
                To start: count the opening stock, then the <b>Super Admin</b> switches on inventory in <b>Settings → Inventory</b> and enters the counted quantities here.
              </p>
            </CardBody>
          </div>
        </Card>
      )}

      {inv.enabled && levels?.enabled && (
        <StockPanel
          canManage={canManage}
          items={levels.items.map((i) => ({ variantId: i.variantId, sku: i.sku, name: i.name, reorderLevel: i.reorderLevel, onHand: i.onHand, movements: i.movements, low: i.low }))}
          recent={recent.map((m) => ({ id: m.id, variantId: m.variantId, quantityChange: m.quantityChange, movementType: m.movementType, note: m.note, createdAt: m.createdAt.toISOString() }))}
        />
      )}

      <SuppliersManager
        canManage={canManage}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, gstin: s.gstin, mobile: s.mobile, email: s.email, address: s.address, notes: s.notes, isActive: s.isActive }))}
      />
    </div>
  );
}

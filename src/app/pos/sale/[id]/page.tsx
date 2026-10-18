import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { publicActor } from "@/server/auth/actor";
import { getSale, refreshDraft } from "@/server/services/sales";
import { toAppError } from "@/server/errors";
import { loadPosConfig, loadPosUnits, toJson } from "@/components/pos/config";
import { SaleScreen } from "@/components/pos/sale-screen";
import type { SaleData } from "@/components/pos/types";
import { EmptyState, PageSkeleton } from "@/components/ui/page";
import { LinkButton } from "@/components/ui/button";

export const metadata = { title: "Sale" };

export default function SalePage({ params }: PageProps<"/pos/sale/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SaleLoader params={params} />
    </Suspense>
  );
}

async function SaleLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageActor("sales.create");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let data: SaleData;
  try {
    const evaluation = await refreshDraft(actor, id);
    data = toJson({ ...(await getSale(actor, id)), evaluation });
  } catch (err) {
    const e = toAppError(err);
    if (e.code === "NOT_FOUND") notFound();
    return (
      <EmptyState
        icon={<ShieldAlert className="h-10 w-10" />}
        title={e.code === "FORBIDDEN" ? "This sale belongs to another staff member" : "This sale could not be opened"}
        description={e.message}
        action={<LinkButton href="/pos">Back to POS</LinkButton>}
      />
    );
  }
  const [config, units] = [await loadPosConfig(), await loadPosUnits()];
  return <SaleScreen key={id} initial={data} config={config} me={toJson(publicActor(actor))} units={units} />;
}

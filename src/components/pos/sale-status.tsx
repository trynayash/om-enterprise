import { Badge, StatusBadge } from "@/components/ui/badge";

/** Counter-friendly status: a finalised sale that's paid is waiting for its bill, not for payment. */
export function SaleStatusBadge({ status, paymentStatus }: { status: string; paymentStatus: string }) {
  if (status === "finalized") {
    if (paymentStatus === "paid") return <Badge tone="gold">Paid · bill pending</Badge>;
    if (paymentStatus === "partially_paid") return <Badge tone="amber">Part paid</Badge>;
    return <Badge tone="amber">Awaiting payment</Badge>;
  }
  return <StatusBadge status={status} />;
}

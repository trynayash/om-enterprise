import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, MessageCircle, Phone } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { getWebsiteOrder } from "@/server/services/website-orders";
import { getSettings } from "@/server/settings";
import { whatsappLink } from "@/lib/india";
import { D, formatINR, formatQty, m } from "@/lib/money";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, PageHeader, PageSkeleton, td, th } from "@/components/ui/page";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { DateTime, Money } from "@/components/ui/money";
import { ConvertOrderButton, OrderUpdateForm } from "@/components/dashboard/ops/order-actions";
import { loadOr404 } from "@/components/dashboard/ops/guard";

export const metadata = { title: "Website order" };

export default function OrderPage({ params }: PageProps<"/dashboard/orders/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OrderDetail params={params} />
    </Suspense>
  );
}

async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor("orders.view");
  const { id } = await params;
  const { order: o, lines } = await loadOr404(getWebsiteOrder(actor, id));
  const business = await getSettings("business");
  const canManage = can(actor, "orders.manage");
  const itemsText = lines.map((l) => `• ${l.productName}${l.variantName ? ` (${l.variantName})` : ""} × ${formatQty(l.quantity)}`).join("\n");
  const reply = `Namaste ${o.customerName}, thank you for your ${o.kind === "order_request" ? "order request" : "enquiry"} ${o.orderNumber} at ${business.name}.${
    itemsText ? `\n${itemsText}\n` : " "
  }We will confirm availability and the final price shortly.`;

  return (
    <div className="space-y-6">
      <Link href="/dashboard/orders" className="inline-flex items-center gap-1 text-sm font-semibold text-navy-600 hover:text-navy-900">
        <ArrowLeft className="h-4 w-4" /> All website orders
      </Link>
      <PageHeader
        eyebrow={o.kind === "order_request" ? "Order request" : "Enquiry"}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {o.orderNumber} <StatusBadge status={o.status} />
          </span>
        }
        description={
          <>
            Received <DateTime value={o.createdAt} /> from the website
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title={o.customerName} description={[o.city, o.preferredContact ? `prefers ${o.preferredContact}` : null].filter(Boolean).join(" · ")} />
            <CardBody className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <a href={`tel:+91${o.mobile}`} className={buttonClass("outline")}>
                  <Phone className="h-4 w-4" /> Call {o.mobile}
                </a>
                <a href={whatsappLink(o.mobile, reply)} target="_blank" rel="noopener noreferrer" className={buttonClass("success")}>
                  <MessageCircle className="h-4 w-4" /> Reply on WhatsApp
                </a>
                {o.email && (
                  <a href={`mailto:${o.email}?subject=${encodeURIComponent(`${business.name} — ${o.orderNumber}`)}`} className={buttonClass("outline")}>
                    <Mail className="h-4 w-4" /> Email
                  </a>
                )}
              </div>
              {o.address && (
                <div className="text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-navy-500">Address</div>
                  <div className="whitespace-pre-line">{o.address}</div>
                </div>
              )}
              {o.message && (
                <div className="rounded-xl bg-navy-50 px-4 py-3 text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-navy-500">Message</div>
                  <div className="mt-1 whitespace-pre-line">{o.message}</div>
                </div>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Requested items" description="Prices shown on the website at the time of the request (indicative)." />
            {lines.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr>
                      <th className={th}>Item</th>
                      <th className={`${th} text-right`}>Qty</th>
                      <th className={`${th} text-right`}>Unit price</th>
                      <th className={`${th} text-right`}>Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id}>
                        <td className={td}>
                          <div className="font-medium">{l.productName}</div>
                          <div className="text-xs text-navy-500">
                            {l.variantName} · {l.sku}
                          </div>
                        </td>
                        <td className={`${td} text-right tabular`}>{formatQty(l.quantity)}</td>
                        <td className={`${td} text-right`}>{l.indicativeUnitPrice ? <Money value={l.indicativeUnitPrice} /> : <span className="text-navy-400">Price on request</span>}</td>
                        <td className={`${td} text-right font-semibold`}>{l.indicativeUnitPrice ? formatINR(m(D(l.indicativeUnitPrice).times(D(l.quantity)))) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <CardBody>
                <p className="text-sm text-navy-500">No specific items — see the message.</p>
              </CardBody>
            )}
            {o.indicativeTotal && (
              <CardBody className="flex justify-end border-t border-navy-100 text-sm">
                Indicative total <Money value={o.indicativeTotal} className="ml-3 font-extrabold" />
              </CardBody>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Handling" />
            <CardBody className="space-y-4">
              {o.status === "converted" && <Alert tone="success">Converted to a POS sale.</Alert>}
              <OrderUpdateForm orderId={o.id} status={o.status} staffNotes={o.staffNotes} canManage={canManage} />
            </CardBody>
          </Card>
          {canManage && can(actor, "sales.create") && lines.length > 0 && (
            <Card>
              <CardHeader title="Bill this order" />
              <CardBody>
                <ConvertOrderButton orderId={o.id} convertedSaleId={o.convertedSaleId} />
              </CardBody>
            </Card>
          )}
          <p className="px-1 text-xs text-navy-500">
            <Badge tone="neutral">Privacy</Badge> Contact details are used only to respond to this request.
          </p>
        </div>
      </div>
    </div>
  );
}

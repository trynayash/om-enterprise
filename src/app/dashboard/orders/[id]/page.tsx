import { Suspense } from "react";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { getWebsiteOrder } from "@/server/services/website-orders";
import { getSettings } from "@/server/settings";
import { whatsappLink } from "@/lib/india";
import { D, formatINR, formatQty, m } from "@/lib/money";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, PageHeader, PageSkeleton } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { DateTime, Money } from "@/components/ui/money";
import { ConvertOrderButton, OrderUpdateForm } from "@/components/dashboard/ops/order-actions";
import { loadOr404 } from "@/components/dashboard/ops/guard";
import { BackLink } from "@/components/dashboard/back-link";
import { TitleStamps } from "@/components/dashboard/title-stamps";
import { tdNum, tdText, th, thNum } from "@/components/dashboard/table";
import { preferredContactLabel } from "@/components/staff/labels";
import { optionLabel } from "@/lib/line-description";

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
  const itemsText = lines.map((l) => `• ${l.productName}${optionLabel(l.variantName) ? ` (${l.variantName})` : ""} × ${formatQty(l.quantity)}`).join("\n");
  const reply = `Namaste ${o.customerName}, thank you for your ${o.kind === "order_request" ? "order request" : "enquiry"} ${o.orderNumber} at ${business.name}.${
    itemsText ? `\n${itemsText}\n` : " "
  }We will confirm availability and the final price shortly.`;

  return (
    <div className="space-y-6">
      <BackLink href="/dashboard/orders">All website orders</BackLink>
      <PageHeader
        eyebrow={o.kind === "order_request" ? "Order request" : "Enquiry"}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular text-[0.72em] font-semibold tracking-tight">{o.orderNumber}</span>
            <TitleStamps>
              <StatusBadge status={o.status} />
            </TitleStamps>
          </span>
        }
        description={
          <>
            Received <DateTime value={o.createdAt} /> from the website
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title={o.customerName} description={[o.city, preferredContactLabel(o.preferredContact)].filter(Boolean).join(" · ")} />
            <CardBody className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <a href={`tel:+91${o.mobile}`} className={buttonClass("outline")}>
                  <Phone className="h-4 w-4" /> Call <span className="tabular">{o.mobile}</span>
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
                  <div className="label-sm mb-1 text-navy-500">Address</div>
                  <div className="whitespace-pre-line">{o.address}</div>
                </div>
              )}
              {o.message && (
                <div className="rounded-lg border border-rule bg-paper/70 px-4 py-3 text-sm">
                  <div className="label-sm text-navy-500">Message</div>
                  <div className="mt-1.5 whitespace-pre-line leading-relaxed">{o.message}</div>
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
                      <th className={thNum}>Qty</th>
                      <th className={thNum}>Unit price</th>
                      <th className={thNum}>Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id}>
                        <td className={tdText}>
                          <div className="font-medium">{l.productName}</div>
                          <div className="mt-0.5 text-xs text-navy-500">
                            {optionLabel(l.variantName) && <>{l.variantName} · </>}
                            <span className="tabular">{l.sku}</span>
                          </div>
                        </td>
                        <td className={tdNum}>{formatQty(l.quantity)}</td>
                        <td className={tdNum}>{l.indicativeUnitPrice ? <Money value={l.indicativeUnitPrice} /> : <span className="font-sans text-xs text-navy-400">Price on request</span>}</td>
                        <td className={`${tdNum} font-semibold`}>{l.indicativeUnitPrice ? formatINR(m(D(l.indicativeUnitPrice).times(D(l.quantity)))) : "—"}</td>
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
              <CardBody className="flex items-baseline justify-end gap-3 bg-paper/50 text-sm">
                <span className="label-sm text-navy-500">Indicative total</span>
                <Money value={o.indicativeTotal} className="tabular text-base font-semibold" />
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
          <p className="px-1 text-xs leading-relaxed text-navy-500">
            <span className="label-sm mr-1.5 text-navy-600">Privacy</span>
            Contact details are used only to respond to this request.
          </p>
        </div>
      </div>
    </div>
  );
}

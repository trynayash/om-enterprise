import { Suspense } from "react";
import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { getCustomer } from "@/server/services/customers";
import { stateName, whatsappLink } from "@/lib/india";
import { D, formatINR, m } from "@/lib/money";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui/page";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { DateTime, Money } from "@/components/ui/money";
import { buttonClass } from "@/components/ui/button";
import { CustomerFormButton } from "@/components/dashboard/ops/customer-form";
import { loadOr404 } from "@/components/dashboard/ops/guard";
import { BackLink } from "@/components/dashboard/back-link";
import { TitleStamps } from "@/components/dashboard/title-stamps";
import { codeLink, rowHover, tdCode, tdMuted, tdNum, tdText, th, thNum } from "@/components/dashboard/table";

export const metadata = { title: "Customer" };

export default function CustomerPage({ params }: PageProps<"/dashboard/customers/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CustomerDetail params={params} />
    </Suspense>
  );
}

async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor("customers.view");
  const { id } = await params;
  const { customer: c, history } = await loadOr404(getCustomer(actor, id));
  const completed = history.filter((h) => h.status === "completed");
  const lifetime = completed.reduce((a, h) => a.plus(D(h.grandTotal)), D(0));
  const due = history
    .filter((h) => h.status === "completed" || h.status === "finalized")
    .reduce((a, h) => a.plus(D(h.grandTotal).minus(D(h.amountPaid))), D(0));

  return (
    <div className="space-y-6">
      <BackLink href="/dashboard/customers">All customers</BackLink>
      <PageHeader
        eyebrow="Customer"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {c.name}
            <TitleStamps>
              <Badge tone={c.customerType === "contractor" ? "gold" : c.customerType === "business" ? "navy" : "neutral"} className="capitalize">
                {c.customerType}
              </Badge>
            </TitleStamps>
          </span>
        }
        description={c.businessName ?? undefined}
        actions={
          <>
            {c.mobile && (
              <>
                <a href={`tel:+91${c.mobile}`} className={buttonClass("outline")}>
                  <Phone className="h-4 w-4" /> Call
                </a>
                <a href={whatsappLink(c.mobile, `Namaste ${c.name}, this is OM ENTERPRISE, Naswadi.`)} target="_blank" rel="noopener noreferrer" className={buttonClass("success")}>
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              </>
            )}
            {can(actor, "customers.edit") && (
              <CustomerFormButton
                customer={{
                  id: c.id,
                  name: c.name,
                  mobile: c.mobile,
                  email: c.email,
                  businessName: c.businessName,
                  gstin: c.gstin,
                  billingAddress: c.billingAddress,
                  city: c.city,
                  stateCode: c.stateCode,
                  pincode: c.pincode,
                  customerType: c.customerType,
                  notes: c.notes,
                }}
              />
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Completed bills" value={completed.length.toLocaleString("en-IN")} hint={can(actor, "sales.view_all") ? "All staff" : "Your sales only"} />
        <Stat label="Billed value" value={formatINR(m(lifetime))} hint="Incl. GST, before returns" />
        <Stat label="Outstanding" value={formatINR(m(due.greaterThan(0) ? due : 0))} tone={due.greaterThan(0) ? "gold" : "navy"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Details" />
          <CardBody className="space-y-3 text-sm">
            <Detail icon={<Phone className="h-4 w-4" />} label="Mobile" value={c.mobile} mono />
            <Detail icon={<Mail className="h-4 w-4" />} label="Email" value={c.email} />
            <Detail label="GSTIN" value={c.gstin} mono />
            <Detail icon={<MapPin className="h-4 w-4" />} label="Address" value={[c.billingAddress, c.city, c.pincode, stateName(c.stateCode)].filter(Boolean).join(", ") || null} />
            {c.notes && <Detail label="Notes" value={c.notes} />}
            <div className="pt-1 text-xs text-navy-500">
              Added <DateTime value={c.createdAt} dateOnly />
            </div>
          </CardBody>
        </Card>
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader title="Purchase history" description="Real sales only (training sales are excluded)." />
          {history.length === 0 ? (
            <CardBody>
              <EmptyState title="No sales yet" />
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr>
                    <th className={th}>Sale</th>
                    <th className={th}>Date</th>
                    <th className={th}>Bill</th>
                    <th className={th}>Status</th>
                    <th className={thNum}>Total</th>
                    <th className={thNum}>Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className={rowHover}>
                      <td className={tdText}>
                        <Link href={`/dashboard/sales/${h.id}`} className={codeLink}>
                          {h.saleNumber}
                        </Link>
                      </td>
                      <td className={`${tdMuted} whitespace-nowrap`}>
                        <DateTime value={h.createdAt} dateOnly />
                      </td>
                      <td className={tdCode}>{h.docNumber ?? <span className="text-navy-300">—</span>}</td>
                      <td className={tdText}>
                        <StatusBadge status={h.status === "completed" ? h.paymentStatus : h.status} />
                      </td>
                      <td className={`${tdNum} font-semibold`}>
                        <Money value={h.grandTotal} />
                      </td>
                      <td className={tdNum}>
                        <Money value={h.amountPaid} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Detail({ icon, label, value, mono }: { icon?: React.ReactNode; label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex gap-3 border-b border-navy-100 pb-3 last:border-0 last:pb-0">
      <span className="mt-0.5 w-4 shrink-0 text-navy-400">{icon}</span>
      <div className="min-w-0">
        <div className="label-mono text-navy-500">{label}</div>
        <div className={mono ? "mt-0.5 break-all font-mono text-[13px]" : "mt-0.5"}>{value ?? <span className="text-navy-400">Not recorded</span>}</div>
      </div>
    </div>
  );
}

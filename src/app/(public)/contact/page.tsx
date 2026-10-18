import type { Metadata } from "next";
import { Suspense } from "react";
import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { Skeleton } from "@/components/ui/page";
import { whatsappLink } from "@/lib/india";
import { EnquiryForm } from "@/components/public/enquiry-form";
import { Breadcrumbs, Container } from "@/components/public/section";
import { addressLines, getSiteData, telHref } from "@/components/public/site-data";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Call, WhatsApp, email or visit OM ENTERPRISE, Opp. Shardha Dhaba 2, Bodeli Road, Naswadi, Gujarat 391150.",
};

export default function ContactPage() {
  return (
    <>
      <section className="border-b border-navy-100 bg-gradient-to-b from-navy-50 to-white">
        <Container className="py-10 sm:py-12">
          <Breadcrumbs items={[{ href: "/", label: "Home" }, { label: "Contact" }]} />
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">Contact us</h1>
          <p className="mt-2 max-w-2xl text-base text-navy-500">Visit the shop, call, or send us a message — we&apos;ll get back to you quickly.</p>
        </Container>
      </section>
      <Container className="py-8 sm:py-12">
        <Suspense
          fallback={
            <div className="grid gap-8 lg:grid-cols-[1fr_1.3fr]">
              <Skeleton className="h-96 rounded-3xl" />
              <Skeleton className="h-[30rem] rounded-3xl" />
            </div>
          }
        >
          <ContactContent />
        </Suspense>
      </Container>
    </>
  );
}

async function ContactContent() {
  const { business, website } = await getSiteData();
  const wa = business.whatsapp ? whatsappLink(business.whatsapp, "Hello OM ENTERPRISE, I have an enquiry.") : null;
  const cards = [
    business.whatsapp && wa
      ? { icon: MessageCircle, title: "WhatsApp", value: business.whatsapp, href: wa, external: true, tone: "bg-emerald-600 text-white" }
      : null,
    business.phone ? { icon: Phone, title: "Call", value: business.phone, href: telHref(business.phone), external: false, tone: "bg-navy-900 text-gold-400" } : null,
    business.email ? { icon: Mail, title: "Email", value: business.email, href: `mailto:${business.email}`, external: false, tone: "bg-gold-500 text-navy-950" } : null,
  ].filter((c): c is NonNullable<typeof c> => !!c);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.3fr]">
      <div className="space-y-4">
        {cards.map((c) => (
          <a
            key={c.title}
            href={c.href}
            target={c.external ? "_blank" : undefined}
            rel={c.external ? "noopener noreferrer" : undefined}
            className="group flex items-center gap-4 rounded-2xl border border-navy-100 bg-white p-4 shadow-card transition-colors hover:border-gold-400"
          >
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${c.tone}`}>
              <c.icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-bold uppercase tracking-[0.14em] text-navy-500">{c.title}</span>
              <span className="block truncate text-base font-bold text-navy-900 group-hover:underline">{c.value}</span>
            </span>
          </a>
        ))}
        <div className="rounded-2xl border border-navy-100 bg-gradient-to-br from-navy-50 to-white p-5">
          <div className="flex gap-3">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-navy-500">Shop address</div>
              <address className="mt-1 text-sm not-italic leading-relaxed text-navy-800">
                <span className="block font-bold text-navy-900">{business.name}</span>
                {addressLines(business).map((l) => (
                  <span key={l} className="block">{l}</span>
                ))}
              </address>
              {business.mapUrl && (
                <a href={business.mapUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-semibold text-navy-900 underline decoration-gold-500 underline-offset-4">
                  Get directions
                </a>
              )}
            </div>
          </div>
          {business.openingHours && (
            <div className="mt-4 flex gap-3 border-t border-navy-100 pt-4">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-navy-500">Opening hours</div>
                <div className="mt-1 text-sm text-navy-800">{business.openingHours}</div>
              </div>
            </div>
          )}
        </div>
      </div>
      <section aria-labelledby="contact-form" className="rounded-3xl border border-navy-100 bg-white p-5 shadow-card sm:p-7">
        <h2 id="contact-form" className="text-lg font-extrabold text-navy-900">Send a message</h2>
        <p className="mt-1 text-sm text-navy-500">Tell us what you need — sizes, quantities, brands — and how to reach you.</p>
        <div className="mt-5">
          {website.enquiriesEnabled ? (
            <EnquiryForm items={[]} whatsapp={business.whatsapp || null} allowOrderRequest={false} />
          ) : (
            <p className="rounded-xl bg-navy-50 p-4 text-sm text-navy-700">Online messages are paused right now. Please call or WhatsApp us.</p>
          )}
        </div>
      </section>
    </div>
  );
}

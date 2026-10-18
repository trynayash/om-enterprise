import Link from "next/link";
import { Suspense } from "react";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { whatsappLink } from "@/lib/india";
import { HeaderClient } from "./header-client";
import { addressLines, addressShort, getSiteData, telHref } from "./site-data";

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

async function HeaderWithData() {
  const { business, categories } = await getSiteData();
  return (
    <HeaderClient
      categories={categories.map((c) => ({ name: c.name, slug: c.slug, icon: c.icon, productCount: c.productCount, parentId: c.parentId }))}
      whatsapp={business.whatsapp || null}
      phone={business.phone || null}
      addressShort={addressShort(business)}
    />
  );
}

export function SiteHeader() {
  return (
    <Suspense fallback={<HeaderClient categories={[]} whatsapp={null} phone={null} addressShort={null} />}>
      <HeaderWithData />
    </Suspense>
  );
}

/* ------------------------------------------------------------------ */
/* Footer                                                              */
/* ------------------------------------------------------------------ */

async function FooterWithData() {
  const { business, categories } = await getSiteData();
  const wa = business.whatsapp ? whatsappLink(business.whatsapp, "Hello OM ENTERPRISE, I have an enquiry.") : null;
  const year = new Date().getFullYear();
  return (
    <footer className="relative mt-auto overflow-hidden bg-navy-950 text-navy-200">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-500/60 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-navy-700/30 blur-3xl" />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr] lg:px-8">
        <div>
          <Logo inverted />
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-navy-300">{business.about}</p>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-gold-500 px-5 text-sm font-bold text-navy-950 hover:bg-gold-400">
              <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
            </a>
          )}
        </div>
        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-gold-400">Categories</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {categories
              .filter((c) => !c.parentId)
              .slice(0, 10)
              .map((c) => (
                <li key={c.slug}>
                  <Link href={`/category/${c.slug}`} className="hover:text-white">
                    {c.name}
                  </Link>
                </li>
              ))}
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-gold-400">Quick links</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <Link href="/products" className="hover:text-white">All products</Link>
            </li>
            <li>
              <Link href="/enquiry" className="hover:text-white">Enquiry list</Link>
            </li>
            <li>
              <Link href="/about" className="hover:text-white">About us</Link>
            </li>
            <li>
              <Link href="/contact" className="hover:text-white">Contact</Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-gold-400">Visit or call</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
              <address className="not-italic leading-relaxed">
                {addressLines(business).map((l) => (
                  <span key={l} className="block">{l}</span>
                ))}
              </address>
            </li>
            {business.whatsapp && (
              <li className="flex gap-3">
                <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
                <a href={wa ?? "#"} target="_blank" rel="noopener noreferrer" className="hover:text-white">WhatsApp {business.whatsapp}</a>
              </li>
            )}
            {business.phone && (
              <li className="flex gap-3">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
                <a href={telHref(business.phone)} className="hover:text-white">{business.phone}</a>
              </li>
            )}
            {business.email && (
              <li className="flex gap-3">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
                <a href={`mailto:${business.email}`} className="break-all hover:text-white">{business.email}</a>
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-navy-400 sm:flex-row sm:px-6 lg:px-8">
          <span>© {year} {business.name}. All rights reserved.</span>
          <Link href="/login" className="hover:text-navy-200">Staff login</Link>
        </div>
      </div>
    </footer>
  );
}

export function SiteFooter() {
  return (
    <Suspense fallback={<footer className="mt-auto h-64 bg-navy-950" aria-hidden />}>
      <FooterWithData />
    </Suspense>
  );
}

/* ------------------------------------------------------------------ */
/* Floating WhatsApp button                                            */
/* ------------------------------------------------------------------ */

async function WhatsAppFloatWithData() {
  const { business } = await getSiteData();
  if (!business.whatsapp) return null;
  return (
    <a
      href={whatsappLink(business.whatsapp, "Hello OM ENTERPRISE, I have an enquiry.")}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with OM ENTERPRISE on WhatsApp"
      className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lift ring-4 ring-white transition-transform hover:scale-105 hover:bg-emerald-700 sm:bottom-6 sm:right-6"
    >
      <MessageCircle className="h-6 w-6" />
    </a>
  );
}

export function WhatsAppFloat() {
  return (
    <Suspense fallback={null}>
      <WhatsAppFloatWithData />
    </Suspense>
  );
}

import Link from "next/link";
import { Suspense } from "react";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { whatsappLink } from "@/lib/india";
import { HeaderClient } from "./header-client";
import { addressLines, addressShort, getSiteData, mapsHref, telHref } from "./site-data";

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

const footLink = "link-draw text-navy-200 transition-colors hover:text-white";

async function FooterWithData() {
  const { business, categories } = await getSiteData();
  const wa = business.whatsapp ? whatsappLink(business.whatsapp, "Hello OM ENTERPRISE, I have an enquiry.") : null;
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto bg-navy-950 text-navy-300">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 border-b border-white/10 py-14 md:grid-cols-2 lg:grid-cols-[1.35fr_1fr_0.8fr_1.15fr]">
          <div>
            <Logo inverted />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-navy-300">{business.about}</p>
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-gold-500 px-5 text-sm font-semibold text-navy-950 transition-colors hover:bg-gold-400"
              >
                <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
              </a>
            )}
          </div>
          <div>
            <h2 className="label-mono text-gold-400">Catalogue</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {categories
                .filter((c) => !c.parentId)
                .slice(0, 10)
                .map((c) => (
                  <li key={c.slug} className="flex items-baseline gap-2">
                    <Link href={`/category/${c.slug}`} className={footLink}>
                      {c.name}
                    </Link>
                    <span className="font-mono text-[11px] text-navy-500 tabular">{c.productCount}</span>
                  </li>
                ))}
            </ul>
          </div>
          <div>
            <h2 className="label-mono text-gold-400">Pages</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href="/products" className={footLink}>All products</Link>
              </li>
              <li>
                <Link href="/enquiry" className={footLink}>Enquiry list</Link>
              </li>
              <li>
                <Link href="/about" className={footLink}>About us</Link>
              </li>
              <li>
                <Link href="/contact" className={footLink}>Contact</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="label-mono text-gold-400">Visit or call</h2>
            <address className="mt-4 text-sm not-italic leading-relaxed text-navy-200">
              {addressLines(business).map((l) => (
                <span key={l} className="block">
                  {l}
                </span>
              ))}
            </address>
            <a href={mapsHref(business)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-white">
              <span className="link-draw">Open in Maps</span> <ArrowUpRight className="h-3.5 w-3.5 text-gold-400" />
            </a>
            <dl className="mt-5 space-y-1.5 font-mono text-[12.5px]">
              {business.phone && (
                <div className="flex gap-3">
                  <dt className="w-16 shrink-0 text-navy-500">Phone</dt>
                  <dd>
                    <a href={telHref(business.phone)} className={footLink}>{business.phone}</a>
                  </dd>
                </div>
              )}
              {business.whatsapp && (
                <div className="flex gap-3">
                  <dt className="w-16 shrink-0 text-navy-500">WhatsApp</dt>
                  <dd>
                    <a href={wa ?? "#"} target="_blank" rel="noopener noreferrer" className={footLink}>{business.whatsapp}</a>
                  </dd>
                </div>
              )}
              {business.email && (
                <div className="flex gap-3">
                  <dt className="w-16 shrink-0 text-navy-500">Email</dt>
                  <dd className="min-w-0">
                    <a href={`mailto:${business.email}`} className={`${footLink} break-all`}>{business.email}</a>
                  </dd>
                </div>
              )}
              {business.openingHours && (
                <div className="flex gap-3">
                  <dt className="w-16 shrink-0 text-navy-500">Hours</dt>
                  <dd className="text-navy-200">{business.openingHours}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
        <div className="flex flex-col items-start justify-between gap-2 py-5 font-mono text-[11.5px] text-navy-500 sm:flex-row sm:items-center">
          <span>
            © {year} {business.name}
            {business.gstin ? ` · GSTIN ${business.gstin}` : ""}
          </span>
          <Link href="/login" className="transition-colors hover:text-navy-200">
            Staff login
          </Link>
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
      className="fixed bottom-5 right-5 z-30 flex h-13 w-13 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lift transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-emerald-700 sm:bottom-6 sm:right-6"
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

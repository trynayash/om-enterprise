import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, BadgeIndianRupee, Clock, Handshake, MapPin, MessageCircle, Phone, Search, ShieldCheck, Store } from "lucide-react";
import { getPublicBrands, searchPublicProducts } from "@/server/services/public-catalog";
import { whatsappLink } from "@/lib/india";
import { LinkButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/page";
import { HeroArt } from "@/components/public/hero-art";
import { CategoryIcon } from "@/components/public/category-icon";
import { ProductGrid, ProductGridSkeleton } from "@/components/public/product-card";
import { Container, SectionHeading } from "@/components/public/section";
import { addressLines, getSiteData, telHref } from "@/components/public/site-data";

export default function HomePage() {
  return (
    <>
      <Hero />
      <CategoriesSection />
      <FeaturedSection />
      <WhyUs />
      <BrandsSection />
      <AboutContact />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-navy-950">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(212,165,55,0.22),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(58,103,166,0.45),transparent_55%)]" />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-40"
        style={{
          backgroundImage: "linear-gradient(to right, rgb(157 179 212 / 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgb(157 179 212 / 0.08) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <Container className="grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-gold-300">
            <Store className="h-3.5 w-3.5" /> Naswadi · Gujarat
          </div>
          <Suspense fallback={<HeroCopySkeleton />}>
            <HeroCopy />
          </Suspense>
          <form action="/products" method="get" role="search" className="mt-8 flex max-w-xl gap-2 rounded-2xl bg-white p-2 shadow-lift">
            <label htmlFor="hero-search" className="sr-only">
              Search products
            </label>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-navy-400" />
              <input
                id="hero-search"
                name="q"
                type="search"
                placeholder="Search paints, tanks, CPVC pipes, taps…"
                className="h-12 w-full rounded-xl bg-transparent pl-10 pr-3 text-base text-navy-900 placeholder:text-navy-400 focus:outline-none"
              />
            </div>
            <button type="submit" className="h-12 shrink-0 rounded-xl bg-navy-900 px-5 text-sm font-bold text-white hover:bg-navy-800">
              Search
            </button>
          </form>
          <Suspense fallback={<div className="mt-6 h-12" />}>
            <HeroActions />
          </Suspense>
        </div>
        <div className="relative mx-auto hidden w-full max-w-lg lg:block">
          <div aria-hidden className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-gold-500/20 via-transparent to-navy-500/20 blur-2xl" />
          <div className="relative rounded-[2rem] border border-white/10 bg-navy-900/60 p-4 shadow-lift backdrop-blur">
            <HeroArt className="h-auto w-full" />
          </div>
        </div>
      </Container>
    </section>
  );
}

function HeroCopySkeleton() {
  return (
    <div className="mt-6 space-y-3">
      <div className="h-12 w-4/5 animate-pulse rounded-xl bg-white/10" />
      <div className="h-12 w-3/5 animate-pulse rounded-xl bg-white/10" />
      <div className="h-5 w-full max-w-lg animate-pulse rounded bg-white/10" />
    </div>
  );
}

async function HeroCopy() {
  const { website } = await getSiteData();
  return (
    <>
      <h1 className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
        {website.heroTitle.split(" ").map((w, i, arr) =>
          i >= arr.length - 2 ? (
            <span key={i} className="text-gold-400">
              {w}{" "}
            </span>
          ) : (
            <span key={i}>{w} </span>
          ),
        )}
      </h1>
      <p className="mt-5 max-w-xl text-base leading-relaxed text-navy-200 sm:text-lg">{website.heroSubtitle}</p>
    </>
  );
}

async function HeroActions() {
  const { business, categories } = await getSiteData();
  const top = categories.filter((c) => !c.parentId).slice(0, 5);
  return (
    <>
      <div className="mt-6 flex flex-wrap gap-3">
        <LinkButton href="/products" variant="gold" size="lg" icon={<ArrowRight className="h-5 w-5" />}>
          Browse products
        </LinkButton>
        {business.whatsapp && (
          <a
            href={whatsappLink(business.whatsapp, "Hello OM ENTERPRISE, I need help choosing building materials.")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/25 px-5 text-base font-semibold text-white transition-colors hover:bg-white/10"
          >
            <MessageCircle className="h-5 w-5" /> WhatsApp us
          </a>
        )}
      </div>
      {top.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2">
          {top.map((c) => (
            <Link
              key={c.slug}
              href={`/category/${c.slug}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-navy-100 transition-colors hover:border-gold-400/60 hover:text-white"
            >
              <CategoryIcon name={c.icon} className="h-3.5 w-3.5 text-gold-400" />
              {c.name}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

function CategoriesSection() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow="Shop by category"
          title="Everything for your build, under one roof"
          description="From the first pipe to the final coat of paint — choose a category to see what we stock."
          action={
            <Link href="/products" className="inline-flex items-center gap-1 text-sm font-bold text-navy-900 hover:text-gold-600">
              All products <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
        <Suspense
          fallback={
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-2xl" />
              ))}
            </div>
          }
        >
          <CategoryGrid />
        </Suspense>
      </Container>
    </section>
  );
}

async function CategoryGrid() {
  const { categories } = await getSiteData();
  const top = categories.filter((c) => !c.parentId);
  if (!top.length) return <p className="text-sm text-navy-500">Categories will appear here soon.</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {top.map((c, i) => (
        <Link
          key={c.slug}
          href={`/category/${c.slug}`}
          className="group relative flex flex-col overflow-hidden rounded-2xl border border-navy-100 bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-gold-300 hover:shadow-lift"
        >
          <span aria-hidden className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-navy-50 transition-colors group-hover:bg-gold-100" />
          <span className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-navy-900 text-gold-400 transition-colors group-hover:bg-gold-500 group-hover:text-navy-950">
            <CategoryIcon name={c.icon} className="h-6 w-6" />
          </span>
          <span className="relative mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-navy-400">{String(i + 1).padStart(2, "0")}</span>
          <h3 className="relative mt-1 text-base font-bold leading-snug text-navy-900">{c.name}</h3>
          {c.description && <p className="relative mt-1 line-clamp-2 text-sm text-navy-500">{c.description}</p>}
          <span className="relative mt-auto flex items-center justify-between pt-4 text-sm font-semibold text-navy-700">
            <span>
              {c.productCount} {c.productCount === 1 ? "product" : "products"}
            </span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Featured products                                                   */
/* ------------------------------------------------------------------ */

function FeaturedSection() {
  return (
    <section className="bg-navy-50/60 py-16 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow="Featured"
          title="Popular at the counter"
          description="Current selling prices, straight from our price list."
          action={
            <Link href="/products" className="inline-flex items-center gap-1 text-sm font-bold text-navy-900 hover:text-gold-600">
              View catalogue <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
        <Suspense fallback={<ProductGridSkeleton count={4} />}>
          <FeaturedGrid />
        </Suspense>
      </Container>
    </section>
  );
}

async function FeaturedGrid() {
  await getSiteData(); // request-time marker (connection) + graceful DB failure
  let items: Awaited<ReturnType<typeof searchPublicProducts>>["items"] = [];
  try {
    items = (await searchPublicProducts({ featured: true, pageSize: 8 })).items;
    if (!items.length) items = (await searchPublicProducts({ pageSize: 8 })).items;
  } catch (err) {
    console.error("[public] featured products unavailable", err);
  }
  if (!items.length) return <p className="text-sm text-navy-500">Our catalogue is being updated. Please call or WhatsApp us for prices.</p>;
  return <ProductGrid items={items} />;
}

/* ------------------------------------------------------------------ */
/* Why us                                                              */
/* ------------------------------------------------------------------ */

const REASONS = [
  { icon: ShieldCheck, title: "Trusted brands", text: "Genuine products from established manufacturers — paints, tanks, pipes, fittings and bathware." },
  { icon: BadgeIndianRupee, title: "Clear, fair prices", text: "Every product is billed at our published price list, with proper bills for every purchase." },
  { icon: Handshake, title: "Advice you can use", text: "Not sure which pipe class, fitting size or paint finish you need? Ask us — we'll help you choose." },
  { icon: Store, title: "One-stop shop", text: "Plumbing, sanitary, water storage and painting needs together, so your project keeps moving." },
];

function WhyUs() {
  return (
    <section className="relative overflow-hidden bg-navy-900 py-16 sm:py-20">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(212,165,55,0.16),transparent_55%)]" />
      <Container className="relative">
        <SectionHeading inverted eyebrow="Why OM ENTERPRISE" title="Built on fair prices and honest advice" align="center" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {REASONS.map((r) => (
            <div key={r.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 transition-colors hover:border-gold-500/40 hover:bg-white/[0.07]">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-500 text-navy-950">
                <r.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-base font-bold text-white">{r.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-navy-200">{r.text}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Brands                                                              */
/* ------------------------------------------------------------------ */

function BrandsSection() {
  return (
    <Suspense fallback={null}>
      <BrandsStrip />
    </Suspense>
  );
}

async function BrandsStrip() {
  await getSiteData();
  let brands: { name: string; slug: string }[] = [];
  try {
    brands = await getPublicBrands();
  } catch {
    brands = [];
  }
  if (!brands.length) return null;
  return (
    <section className="border-b border-navy-100 bg-white py-12">
      <Container>
        <div className="text-center text-xs font-bold uppercase tracking-[0.2em] text-navy-400">Brands we stock</div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {brands.map((b) => (
            <Link
              key={b.slug}
              href={`/products?brand=${encodeURIComponent(b.slug)}`}
              className="rounded-xl border border-navy-100 bg-navy-50/50 px-6 py-3 text-base font-extrabold tracking-wide text-navy-700 transition-colors hover:border-gold-400 hover:bg-gold-50 hover:text-navy-900"
            >
              {b.name}
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* About + contact                                                     */
/* ------------------------------------------------------------------ */

function AboutContact() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <Container>
        <Suspense fallback={<Skeleton className="h-72 rounded-3xl" />}>
          <AboutContactContent />
        </Suspense>
      </Container>
    </section>
  );
}

async function AboutContactContent() {
  const { business } = await getSiteData();
  const wa = business.whatsapp ? whatsappLink(business.whatsapp, "Hello OM ENTERPRISE, I have an enquiry.") : null;
  return (
    <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <SectionHeading eyebrow="About us" title={`Welcome to ${business.name}`} />
        <p className="max-w-2xl text-base leading-relaxed text-navy-600">{business.about}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <LinkButton href="/about" variant="outline">
            More about us
          </LinkButton>
          <LinkButton href="/enquiry" variant="primary">
            Send an enquiry
          </LinkButton>
        </div>
      </div>
      <div className="rounded-3xl border border-navy-100 bg-gradient-to-br from-navy-50 to-white p-6 shadow-card sm:p-8">
        <h3 className="text-lg font-extrabold text-navy-900">Visit the shop</h3>
        <ul className="mt-4 space-y-4 text-sm text-navy-700">
          <li className="flex gap-3">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
            <address className="not-italic leading-relaxed">
              {addressLines(business).map((l) => (
                <span key={l} className="block">{l}</span>
              ))}
              {business.mapUrl && (
                <a href={business.mapUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-semibold text-navy-900 underline decoration-gold-500 underline-offset-4">
                  Open in Maps
                </a>
              )}
            </address>
          </li>
          {business.openingHours && (
            <li className="flex gap-3">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
              <span>{business.openingHours}</span>
            </li>
          )}
          {business.phone && (
            <li className="flex gap-3">
              <Phone className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
              <a href={telHref(business.phone)} className="font-semibold text-navy-900 hover:underline">{business.phone}</a>
            </li>
          )}
        </ul>
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="mt-6 flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-base font-bold text-white hover:bg-emerald-700">
            <MessageCircle className="h-5 w-5" /> WhatsApp {business.whatsapp}
          </a>
        )}
      </div>
    </div>
  );
}

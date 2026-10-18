import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AlertTriangle, ArrowUpRight, Info, Link2, Phone, ShieldCheck } from "lucide-react";
import { getPublicProduct } from "@/server/services/public-catalog";
import { Skeleton } from "@/components/ui/page";
import { SampleBadge } from "@/components/ui/badge";
import { Breadcrumbs, Container } from "@/components/public/section";
import { ProductGallery } from "@/components/public/product-gallery";
import { ProductPurchase } from "@/components/public/product-purchase";
import { getSiteData, telHref } from "@/components/public/site-data";

async function loadProduct(slug: string) {
  await connection();
  if (!/^[a-z0-9-]{1,100}$/.test(slug)) return null;
  try {
    return await getPublicProduct(slug);
  } catch (err) {
    console.error("[public] product unavailable", err);
    return null;
  }
}

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const p = await loadProduct(slug);
  if (!p) return { title: "Product not found" };
  const description = (p.description ?? `${p.name} — ${p.category} at OM ENTERPRISE, Naswadi.`).slice(0, 160);
  return {
    title: p.name,
    description,
    openGraph: { title: p.name, description, images: p.images[0]?.url ? [p.images[0].url] : undefined },
    robots: p.isSample ? { index: false } : undefined,
  };
}

export default function ProductPage({ params }: PageProps<"/products/[slug]">) {
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <ProductContent params={params} />
    </Suspense>
  );
}

function ProductSkeleton() {
  return (
    <Container className="py-10">
      <Skeleton className="h-4 w-64" />
      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <Skeleton className="aspect-square rounded-3xl" />
        <div className="space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-56 w-full rounded-2xl" />
        </div>
      </div>
    </Container>
  );
}

async function ProductContent({ params }: { params: PageProps<"/products/[slug]">["params"] }) {
  const { slug } = await params;
  const p = await loadProduct(slug);
  if (!p) notFound();
  const { business, website } = await getSiteData();
  const specs = [
    ...(p.manufacturer ? [{ label: "Manufacturer", value: p.manufacturer }] : []),
    ...(p.model ? [{ label: "Model", value: p.model }] : []),
    ...p.specifications,
  ];

  return (
    <>
      <Container className="pt-6 sm:pt-8">
        <Breadcrumbs
          items={[
            { href: "/", label: "Home" },
            { href: "/products", label: "Products" },
            { href: `/category/${p.categorySlug}`, label: p.category },
            { label: p.name },
          ]}
        />
      </Container>
      {p.isSample && (
        <Container className="mt-4">
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="note">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <span className="font-bold">Demonstration product — not real product information.</span> Prices, specifications and availability shown
              here are sample data for preview and staff training only.
            </div>
          </div>
        </Container>
      )}
      <Container className="grid gap-10 py-8 lg:grid-cols-2 lg:gap-14 lg:py-10">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <div className="relative">
            <ProductGallery images={p.images.map((i) => ({ url: i.url, alt: i.alt }))} name={p.name} icon={p.categoryIcon} />
            {p.isSample && <SampleBadge className="absolute left-4 top-4" />}
          </div>
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.16em]">
            {p.brand && (
              <Link href={`/products?brand=${encodeURIComponent(p.brandSlug ?? "")}`} className="text-gold-600 hover:text-gold-700">
                {p.brand}
              </Link>
            )}
            {p.brand && <span className="text-navy-300">·</span>}
            <Link href={`/category/${p.categorySlug}`} className="text-navy-500 hover:text-navy-800">
              {p.category}
            </Link>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight text-navy-900 sm:text-4xl">{p.name}</h1>
          {p.description && <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-navy-600">{p.description}</p>}

          <div className="mt-8">
            <ProductPurchase
              productName={p.name}
              slug={p.slug}
              variantAttributes={p.variantAttributes}
              variants={p.variants}
              whatsapp={business.whatsapp || null}
              enquiriesEnabled={website.enquiriesEnabled}
            />
          </div>

          {website.priceNote && (
            <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-navy-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {website.priceNote}
            </p>
          )}

          {specs.length > 0 && (
            <section className="mt-10">
              <h2 className="text-lg font-extrabold text-navy-900">Specifications</h2>
              <dl className="mt-3 overflow-hidden rounded-2xl border border-navy-100">
                {specs.map((s, i) => (
                  <div key={`${s.label}-${i}`} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 px-4 py-3 text-sm odd:bg-navy-50/60">
                    <dt className="font-semibold text-navy-600">{s.label}</dt>
                    <dd className="text-navy-900">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {p.warrantyInfo && (
            <section className="mt-6 flex items-start gap-3 rounded-2xl border border-navy-100 bg-white p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
              <div>
                <h2 className="text-sm font-bold text-navy-900">Warranty</h2>
                <p className="mt-0.5 text-sm text-navy-600">{p.warrantyInfo}</p>
              </div>
            </section>
          )}

          {p.compatible.length > 0 && (
            <section className="mt-10">
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-navy-900">
                <Link2 className="h-5 w-5 text-gold-600" /> Compatible items
              </h2>
              <p className="mt-1 text-sm text-navy-500">Items confirmed by us to work with this product. Ask us if you need a different size or type.</p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {p.compatible.map((c) => (
                  <li key={c.variantId}>
                    <Link href={`/products/${c.slug}`} className="group flex items-center justify-between gap-3 rounded-xl border border-navy-100 bg-white px-4 py-3 text-sm hover:border-gold-400">
                      <span>
                        <span className="block font-semibold text-navy-900">{c.productName}</span>
                        <span className="block text-xs text-navy-500">
                          {c.variantName}
                          {c.note ? ` · ${c.note}` : ""}
                        </span>
                      </span>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-navy-400 group-hover:text-gold-600" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {business.phone && (
            <div className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-navy-900 p-5 text-white">
              <div>
                <div className="text-sm font-bold">Need help choosing the right size or type?</div>
                <div className="text-sm text-navy-200">Call us and we&apos;ll guide you.</div>
              </div>
              <a href={telHref(business.phone)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-gold-500 px-4 text-sm font-bold text-navy-950 hover:bg-gold-400">
                <Phone className="h-4 w-4" /> {business.phone}
              </a>
            </div>
          )}
        </div>
      </Container>
    </>
  );
}

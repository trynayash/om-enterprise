import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, BadgeIndianRupee, Handshake, ReceiptText, ShieldCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/page";
import { LinkButton } from "@/components/ui/button";
import { CategoryIcon } from "@/components/public/category-icon";
import { Breadcrumbs, Container, SectionHeading } from "@/components/public/section";
import { addressLines, getSiteData } from "@/components/public/site-data";

export const metadata: Metadata = {
  title: "About us",
  description: "OM ENTERPRISE — building materials for homes, shops and construction projects in and around Naswadi, Gujarat.",
};

const PROMISES = [
  { icon: ShieldCheck, title: "Genuine products", text: "We stock products from established brands and manufacturers." },
  { icon: BadgeIndianRupee, title: "Published prices", text: "Our counter uses the same price list you see on this website." },
  { icon: ReceiptText, title: "Proper billing", text: "Every purchase is billed, with a printed or digital copy for your records." },
  { icon: Handshake, title: "Practical advice", text: "We help you pick the right size, class and quantity for the job." },
];

export default function AboutPage() {
  return (
    <>
      <section className="relative isolate overflow-hidden bg-navy-950">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(212,165,55,0.2),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(58,103,166,0.4),transparent_60%)]" />
        <Container className="py-12 sm:py-16">
          <div className="[&_a]:text-navy-300 [&_a:hover]:text-white [&_span[aria-current]]:text-white">
            <Breadcrumbs items={[{ href: "/", label: "Home" }, { label: "About us" }]} />
          </div>
          <h1 className="mt-4 max-w-3xl text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            Your complete <span className="text-gold-400">building solution</span>
          </h1>
          <Suspense fallback={<div className="mt-4 h-20 max-w-2xl animate-pulse rounded-xl bg-white/10" />}>
            <AboutIntro />
          </Suspense>
        </Container>
      </section>

      <section className="py-14 sm:py-20">
        <Container>
          <SectionHeading eyebrow="Our promise" title="How we work" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PROMISES.map((p) => (
              <div key={p.title} className="rounded-2xl border border-navy-100 bg-white p-6 shadow-card">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-900 text-gold-400">
                  <p.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-bold text-navy-900">{p.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-navy-500">{p.text}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="bg-navy-50/60 py-14 sm:py-20">
        <Container>
          <SectionHeading eyebrow="What we stock" title="Product range" />
          <Suspense fallback={<Skeleton className="h-40 rounded-2xl" />}>
            <RangeList />
          </Suspense>
        </Container>
      </section>
    </>
  );
}

async function AboutIntro() {
  const { business } = await getSiteData();
  return (
    <>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-navy-200 sm:text-lg">{business.about}</p>
      <p className="mt-4 text-sm text-navy-300">{addressLines(business).join(", ")}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <LinkButton href="/products" variant="gold" size="lg" icon={<ArrowRight className="h-5 w-5" />}>
          Browse products
        </LinkButton>
        <LinkButton href="/contact" variant="white" size="lg">
          Contact us
        </LinkButton>
      </div>
    </>
  );
}

async function RangeList() {
  const { categories } = await getSiteData();
  const top = categories.filter((c) => !c.parentId);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {top.map((c) => (
        <Link key={c.slug} href={`/category/${c.slug}`} className="flex items-center gap-3 rounded-xl border border-navy-100 bg-white px-4 py-3 hover:border-gold-400">
          <CategoryIcon name={c.icon} className="h-5 w-5 shrink-0 text-gold-600" />
          <span className="text-sm font-semibold text-navy-900">{c.name}</span>
        </Link>
      ))}
    </div>
  );
}

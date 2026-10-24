import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/page";
import { LinkButton } from "@/components/ui/button";
import { Container, PageIntro, SectionHeading } from "@/components/public/section";
import { addressLines, getSiteData } from "@/components/public/site-data";

export const metadata: Metadata = {
  title: "About us",
  description: "OM ENTERPRISE — building materials for homes, shops and construction projects in and around Naswadi, Gujarat.",
};

const PRACTICES = [
  { title: "Branded products", text: "Pipes, fittings, tanks, paints and bath fittings from the manufacturers listed in our catalogue." },
  { title: "One price list", text: "The counter and this website read the same price list, so the price you see is the price you're billed." },
  { title: "A bill for every sale", text: "Every purchase is billed, with a printed copy or a link you can open on your phone." },
  { title: "Help choosing", text: "Tell us the job and we'll help you pick the right size, pressure class and quantity." },
];

export default function AboutPage() {
  return (
    <>
      <PageIntro crumbs={[{ href: "/", label: "Home" }, { label: "About us" }]} eyebrow="About us" title="Your complete building solution">
        <Suspense fallback={<div className="mt-4 h-24 max-w-2xl animate-pulse rounded-md bg-navy-100" />}>
          <AboutIntro />
        </Suspense>
      </PageIntro>

      <section className="py-14 sm:py-20">
        <Container>
          <SectionHeading index="01" eyebrow="How we work" title="What you can expect at the counter" />
          <ol className="grid border-t border-navy-900 sm:grid-cols-2 lg:grid-cols-4">
            {PRACTICES.map((p, i) => (
              <li key={p.title} className="border-b border-navy-100 py-6 sm:pr-6 lg:border-b-0 lg:border-r lg:px-6 lg:first:pl-0 lg:last:border-r-0">
                <span className="font-mono text-[12px] text-gold-700">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-2 text-[17px] font-semibold tracking-[-0.01em] text-navy-950">{p.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-navy-500">{p.text}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section className="border-t border-rule bg-paper py-14 sm:py-20">
        <Container>
          <SectionHeading index="02" eyebrow="What we stock" title="Product range" />
          <Suspense fallback={<Skeleton className="h-40 rounded-xl" />}>
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
      <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-navy-600">{business.about}</p>
      <p className="mt-3 font-mono text-[12.5px] text-navy-500">{addressLines(business).join(", ")}</p>
      <div className="mt-7 flex flex-wrap gap-2.5">
        <LinkButton href="/products" size="lg" icon={<ArrowRight className="h-4 w-4" />} className="flex-row-reverse">
          Browse products
        </LinkButton>
        <LinkButton href="/contact" variant="outline" size="lg">
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
    <ol className="grid gap-x-10 sm:grid-cols-2">
      {top.map((c, i) => (
        <li key={c.slug}>
          <Link href={`/category/${c.slug}`} className="group flex items-baseline gap-3 border-b border-rule py-3.5">
            <span className="font-mono text-[11px] text-navy-400 transition-colors group-hover:text-gold-700">{String(i + 1).padStart(2, "0")}</span>
            <span className="font-medium text-navy-950">{c.name}</span>
            <span aria-hidden className="leader" />
            <span className="font-mono text-[12px] text-navy-500 tabular">{c.productCount} items</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

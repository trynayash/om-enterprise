import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogueResults, parseCatalogueQuery } from "@/components/public/catalogue-results";
import { ProductGridSkeleton } from "@/components/public/product-card";
import { Breadcrumbs, Container } from "@/components/public/section";
import { Skeleton } from "@/components/ui/page";

export const metadata: Metadata = {
  title: "Products",
  description: "Browse paints, water tanks, bathware, CPVC / PVC / UPVC / SWR pipes and fittings, and plumbing accessories at OM ENTERPRISE, Naswadi.",
};

export default function ProductsPage({ searchParams }: PageProps<"/products">) {
  return (
    <>
      <section className="border-b border-navy-100 bg-gradient-to-b from-navy-50 to-white">
        <Container className="py-10 sm:py-12">
          <Breadcrumbs items={[{ href: "/", label: "Home" }, { label: "Products" }]} />
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">Product catalogue</h1>
          <p className="mt-2 max-w-2xl text-base text-navy-500">
            Search our range and add items to your enquiry list — we&apos;ll confirm availability and the final bill amount when you contact us or visit the shop.
          </p>
        </Container>
      </section>
      <Container className="py-8 sm:py-10">
        <Suspense
          fallback={
            <div className="space-y-6">
              <Skeleton className="h-[76px] rounded-2xl" />
              <ProductGridSkeleton />
            </div>
          }
        >
          <Results searchParams={searchParams} />
        </Suspense>
      </Container>
    </>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/products">["searchParams"] }) {
  const query = parseCatalogueQuery(await searchParams);
  return <CatalogueResults query={query} />;
}

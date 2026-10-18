import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/page";
import { CatalogueResults, parseCatalogueQuery } from "@/components/public/catalogue-results";
import { CategoryIcon } from "@/components/public/category-icon";
import { ProductGridSkeleton } from "@/components/public/product-card";
import { Breadcrumbs, Container } from "@/components/public/section";
import { getSiteData } from "@/components/public/site-data";

export async function generateMetadata({ params }: PageProps<"/category/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { categories } = await getSiteData();
  const c = categories.find((x) => x.slug === slug);
  if (!c) return { title: "Category not found" };
  return { title: c.name, description: c.description ?? `${c.name} at OM ENTERPRISE, Naswadi.` };
}

export default function CategoryPage({ params, searchParams }: PageProps<"/category/[slug]">) {
  return (
    <Suspense
      fallback={
        <>
          <div className="h-56 bg-navy-950" />
          <Container className="space-y-6 py-10">
            <Skeleton className="h-[76px] rounded-2xl" />
            <ProductGridSkeleton />
          </Container>
        </>
      }
    >
      <CategoryContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CategoryContent({ params, searchParams }: Pick<PageProps<"/category/[slug]">, "params" | "searchParams">) {
  const { slug } = await params;
  const { categories } = await getSiteData();
  const category = categories.find((c) => c.slug === slug);
  if (!category) notFound();
  const parent = category.parentId ? categories.find((c) => c.id === category.parentId) : null;
  const children = categories.filter((c) => c.parentId === category.id);
  const query = parseCatalogueQuery(await searchParams);

  return (
    <>
      <section className="relative isolate overflow-hidden bg-navy-950">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(212,165,55,0.2),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(58,103,166,0.4),transparent_60%)]" />
        <Container className="py-10 sm:py-14">
          <div className="[&_a]:text-navy-300 [&_a:hover]:text-white [&_span[aria-current]]:text-white">
            <Breadcrumbs
              items={[
                { href: "/", label: "Home" },
                { href: "/products", label: "Products" },
                ...(parent ? [{ href: `/category/${parent.slug}`, label: parent.name }] : []),
                { label: category.name },
              ]}
            />
          </div>
          <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gold-500 text-navy-950 shadow-lift">
              <CategoryIcon name={category.icon} className="h-8 w-8" />
            </span>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{category.name}</h1>
              {category.description && <p className="mt-2 max-w-2xl text-base text-navy-200">{category.description}</p>}
            </div>
          </div>
          {children.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {children.map((c) => (
                <Link
                  key={c.slug}
                  href={`/category/${c.slug}`}
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-navy-100 hover:border-gold-400/60 hover:text-white"
                >
                  {c.name} ({c.productCount})
                </Link>
              ))}
            </div>
          )}
        </Container>
      </section>
      <Container className="py-8 sm:py-10">
        <CatalogueResults query={query} basePath={`/category/${category.slug}`} lockCategory={category.slug} />
      </Container>
    </>
  );
}

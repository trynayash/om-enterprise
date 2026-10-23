import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/page";
import { CatalogueResults, parseCatalogueQuery } from "@/components/public/catalogue-results";
import { ProductGridSkeleton } from "@/components/public/product-card";
import { Container, PageIntro } from "@/components/public/section";
import { getSiteData } from "@/components/public/site-data";
import { TechnicalDrawing, type DrawingKind } from "@/components/public/technical-drawing";

const CATEGORY_DRAWING: Record<string, DrawingKind> = { paint: "can", tank: "tank", bath: "tap", pipe: "pipe", drain: "socket-pipe", wrench: "tin", brick: "box" };

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
          <div className="h-56 border-b border-rule bg-paper" />
          <Container className="space-y-5 py-10">
            <Skeleton className="h-11 rounded-lg" />
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
  const top = categories.filter((c) => !c.parentId);
  const position = top.findIndex((c) => c.id === (parent?.id ?? category.id)) + 1;
  const query = parseCatalogueQuery(await searchParams);

  return (
    <>
      <PageIntro
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/products", label: "Products" },
          ...(parent ? [{ href: `/category/${parent.slug}`, label: parent.name }] : []),
          { label: category.name },
        ]}
        eyebrow={
          <>
            Category {position > 0 ? String(position).padStart(2, "0") : ""} · {category.productCount} {category.productCount === 1 ? "item" : "items"}
          </>
        }
        title={category.name}
        description={category.description}
        aside={
          <div className="blueprint hidden h-36 w-56 shrink-0 rounded-lg border border-navy-200 md:flex md:items-center md:justify-center">
            <TechnicalDrawing kind={CATEGORY_DRAWING[category.icon ?? ""] ?? "box"} animate className="h-[88%] w-[88%]" />
          </div>
        }
      >
        {children.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {children.map((c) => (
              <Link
                key={c.slug}
                href={`/category/${c.slug}`}
                className="rounded-md border border-navy-200 bg-white px-3 py-1.5 text-[13px] font-medium text-navy-800 transition-colors hover:border-navy-900"
              >
                {c.name} <span className="font-mono text-navy-400">{c.productCount}</span>
              </Link>
            ))}
          </div>
        )}
      </PageIntro>
      <Container className="py-8 sm:py-10">
        <CatalogueResults query={query} basePath={`/category/${category.slug}`} lockCategory={category.slug} />
      </Container>
    </>
  );
}

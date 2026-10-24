import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { PaperSheet, SheetStamp } from "@/components/ui/paper-sheet";

export const metadata = { title: "Page not found" };

/** 404 for addresses outside the public site (which has its own, inside the header and footer). */
export default function NotFound() {
  return (
    <PaperSheet
      stamp={<SheetStamp>Error 404</SheetStamp>}
      footer={
        <>
          Looking for the shop?{" "}
          <Link href="/contact" className="link-draw font-semibold text-navy-900">
            Contact us
          </Link>
        </>
      }
    >
      <h1 className="headline text-[2.25rem] font-bold text-navy-950">We couldn&apos;t find that page</h1>
      <p className="mt-2 text-sm leading-relaxed text-navy-500">The page may have moved, or the product is no longer listed. Search the catalogue instead.</p>
      <form action="/products" method="get" role="search" className="mt-6 flex gap-1.5">
        <label htmlFor="nf-q" className="sr-only">
          Search products
        </label>
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
          <Input id="nf-q" name="q" type="search" placeholder="Search products…" className="pl-9" />
        </div>
        <Button type="submit">Search</Button>
      </form>
      <div className="mt-5 flex gap-5 text-sm font-semibold text-navy-950">
        <Link href="/" className="link-draw">
          Home
        </Link>
        <Link href="/products" className="link-draw">
          All products
        </Link>
      </div>
    </PaperSheet>
  );
}

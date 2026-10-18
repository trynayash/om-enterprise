import Link from "next/link";
import { Compass, Search } from "lucide-react";
import { Logo } from "@/components/ui/logo";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-navy-950 px-4 py-16 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(212,165,55,0.18),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(58,103,166,0.35),transparent_60%)]" />
      <div className="relative">
        <Link href="/" aria-label="OM ENTERPRISE home">
          <Logo inverted />
        </Link>
        <div className="mt-12 flex justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-500 text-navy-950">
            <Compass className="h-8 w-8" />
          </span>
        </div>
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.2em] text-gold-400">Error 404</p>
        <h1 className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">We couldn&apos;t find that page</h1>
        <p className="mx-auto mt-3 max-w-md text-base text-navy-200">The page may have moved, or the product is no longer listed. Try searching our catalogue instead.</p>
        <form action="/products" method="get" role="search" className="mx-auto mt-8 flex max-w-md gap-2 rounded-2xl bg-white p-2">
          <label htmlFor="nf-q" className="sr-only">
            Search products
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
            <input id="nf-q" name="q" type="search" placeholder="Search products…" className="h-11 w-full rounded-xl pl-9 pr-3 text-sm text-navy-900 focus:outline-none" />
          </div>
          <button type="submit" className="h-11 rounded-xl bg-navy-900 px-4 text-sm font-bold text-white hover:bg-navy-800">
            Search
          </button>
        </form>
        <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm">
          <Link href="/" className="font-semibold text-white underline decoration-gold-500 underline-offset-4">
            Home
          </Link>
          <Link href="/products" className="font-semibold text-white underline decoration-gold-500 underline-offset-4">
            All products
          </Link>
          <Link href="/contact" className="font-semibold text-white underline decoration-gold-500 underline-offset-4">
            Contact us
          </Link>
        </div>
      </div>
    </div>
  );
}

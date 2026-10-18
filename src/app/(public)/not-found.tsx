import Link from "next/link";
import { PackageSearch, Search } from "lucide-react";

/** 404 inside the public site (keeps the header and footer). */
export default function PublicNotFound() {
  return (
    <section className="bg-gradient-to-b from-navy-50 to-white">
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center sm:py-28">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-900 text-gold-400">
          <PackageSearch className="h-8 w-8" />
        </span>
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.2em] text-gold-600">Not found</p>
        <h1 className="mt-2 text-3xl font-extrabold text-navy-900 sm:text-4xl">This item isn&apos;t listed</h1>
        <p className="mt-3 max-w-md text-base text-navy-500">
          It may have been renamed or removed from the online catalogue. Search for it below, or ask us — we stock more than what&apos;s listed online.
        </p>
        <form action="/products" method="get" role="search" className="mt-8 flex w-full max-w-md gap-2 rounded-2xl border border-navy-100 bg-white p-2 shadow-card">
          <label htmlFor="pnf-q" className="sr-only">
            Search products
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
            <input id="pnf-q" name="q" type="search" placeholder="Search products…" className="h-11 w-full rounded-xl pl-9 pr-3 text-sm text-navy-900 focus:outline-none" />
          </div>
          <button type="submit" className="h-11 rounded-xl bg-navy-900 px-4 text-sm font-bold text-white hover:bg-navy-800">
            Search
          </button>
        </form>
        <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm font-semibold">
          <Link href="/products" className="text-navy-900 underline decoration-gold-500 underline-offset-4">
            All products
          </Link>
          <Link href="/contact" className="text-navy-900 underline decoration-gold-500 underline-offset-4">
            Contact us
          </Link>
        </div>
      </div>
    </section>
  );
}

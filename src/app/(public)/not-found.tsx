import Link from "next/link";
import { Search } from "lucide-react";
import { TechnicalDrawing } from "@/components/public/technical-drawing";

/** 404 inside the public site (keeps the header and footer). */
export default function PublicNotFound() {
  return (
    <section className="border-b border-rule bg-paper">
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center sm:py-28">
        <div className="blueprint flex h-32 w-44 items-center justify-center rounded-lg border border-navy-200">
          <TechnicalDrawing kind="box" animate className="h-[86%] w-[86%] text-navy-500" />
        </div>
        <p className="label-mono mt-7 text-gold-700">Error 404 · not found</p>
        <h1 className="headline mt-3 text-[2.75rem] font-bold text-navy-950 sm:text-[3.25rem]">This item isn&apos;t listed</h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-navy-500">
          It may have been renamed or removed from the online catalogue. Search for it below, or ask us — we stock more than what&apos;s listed online.
        </p>
        <form action="/products" method="get" role="search" className="mt-8 flex w-full max-w-md gap-1.5 rounded-xl border border-navy-200 bg-white p-1.5 shadow-card">
          <label htmlFor="pnf-q" className="sr-only">
            Search products
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
            <input id="pnf-q" name="q" type="search" placeholder="Search products…" className="h-11 w-full rounded-lg pl-9 pr-3 text-sm text-navy-900 focus:outline-none" />
          </div>
          <button type="submit" className="h-11 rounded-lg bg-navy-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-navy-800">
            Search
          </button>
        </form>
        <div className="mt-6 flex flex-wrap justify-center gap-5 text-sm font-semibold text-navy-950">
          <Link href="/products" className="link-draw">
            All products
          </Link>
          <Link href="/contact" className="link-draw">
            Contact us
          </Link>
        </div>
      </div>
    </section>
  );
}

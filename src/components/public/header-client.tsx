"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ChevronDown, ClipboardList, MapPin, Menu, MessageCircle, Phone, Search, X } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/components/ui/cn";
import { whatsappLink } from "@/lib/india";
import { CategoryIcon } from "./category-icon";
import { useEnquiryList } from "./cart-store";

export interface HeaderCategory {
  name: string;
  slug: string;
  icon: string | null;
  productCount: number;
  parentId: string | null;
}

export interface HeaderProps {
  categories: HeaderCategory[];
  whatsapp: string | null;
  phone: string | null;
  addressShort: string | null;
}

const NAV = [
  { href: "/", label: "Home" },
  { href: "/products", label: "Products" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ pathname, categories }: { pathname: string | null; categories: HeaderCategory[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const top = categories.filter((c) => !c.parentId);
  const link = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      aria-current={isActive(pathname, href) ? "page" : undefined}
      className={cn(
        "relative rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
        isActive(pathname, href) ? "text-navy-900" : "text-navy-600 hover:text-navy-900",
        "after:absolute after:inset-x-3 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-gold-500 after:transition-transform",
        isActive(pathname, href) ? "after:scale-x-100" : "after:scale-x-0 hover:after:scale-x-100",
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
      {link("/", "Home")}
      {link("/products", "Products")}
      <div ref={ref} className="relative" onMouseLeave={() => setOpen(false)}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          onMouseEnter={() => setOpen(true)}
          aria-expanded={open}
          aria-haspopup="true"
          className={cn(
            "flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
            pathname?.startsWith("/category") ? "text-navy-900" : "text-navy-600 hover:text-navy-900",
          )}
        >
          Categories <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
        {open && top.length > 0 && (
          <div className="absolute left-1/2 top-full z-50 w-[640px] -translate-x-1/2 pt-2">
            <div className="animate-fade-in rounded-2xl border border-navy-100 bg-white p-3 shadow-lift">
              <div className="grid grid-cols-2 gap-1">
                {top.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/category/${c.slug}`}
                    onClick={() => setOpen(false)}
                    className="group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-navy-50"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700 transition-colors group-hover:bg-gold-500 group-hover:text-navy-950">
                      <CategoryIcon name={c.icon} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-navy-900">{c.name}</span>
                      <span className="block text-xs text-navy-500">
                        {c.productCount} {c.productCount === 1 ? "product" : "products"}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
              <Link href="/products" onClick={() => setOpen(false)} className="mt-2 block rounded-xl bg-navy-900 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-navy-800">
                Browse all products
              </Link>
            </div>
          </div>
        )}
      </div>
      {link("/about", "About")}
      {link("/contact", "Contact")}
    </nav>
  );
}

function ActiveNavLinks({ categories }: { categories: HeaderCategory[] }) {
  const pathname = usePathname();
  return <NavLinks pathname={pathname} categories={categories} />;
}

function EnquiryButton() {
  const { count } = useEnquiryList();
  return (
    <Link
      href="/enquiry"
      className="relative flex h-10 items-center gap-2 rounded-xl px-2.5 text-navy-800 hover:bg-navy-50 sm:px-3"
      aria-label={`Enquiry list, ${count} ${count === 1 ? "item" : "items"}`}
    >
      <ClipboardList className="h-5 w-5" />
      <span className="hidden text-sm font-semibold 2xl:inline">Enquiry list</span>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-500 px-1 text-[11px] font-extrabold text-navy-950 ring-2 ring-white">
          {count}
        </span>
      )}
    </Link>
  );
}

function SearchBox({ className, autoFocus, onSubmit }: { className?: string; autoFocus?: boolean; onSubmit?: () => void }) {
  return (
    <form action="/products" method="get" role="search" className={cn("relative", className)} onSubmit={onSubmit}>
      <label htmlFor={autoFocus ? "site-search-m" : "site-search"} className="sr-only">
        Search products
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
      <input
        id={autoFocus ? "site-search-m" : "site-search"}
        name="q"
        type="search"
        placeholder="Search paints, tanks, pipes…"
        autoFocus={autoFocus}
        className="h-10 w-full rounded-xl border border-navy-100 bg-navy-50/70 pl-9 pr-3 text-sm text-navy-900 placeholder:text-navy-400 focus:border-gold-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gold-200"
      />
    </form>
  );
}

export function HeaderClient({ categories, whatsapp, phone, addressShort }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wa = whatsapp ? whatsappLink(whatsapp, "Hello OM ENTERPRISE, I have an enquiry about building materials.") : null;

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40">
      <div className="hidden bg-navy-950 text-navy-200 md:block">
        <div className="mx-auto flex h-9 max-w-7xl items-center justify-between gap-4 px-4 text-xs sm:px-6 lg:px-8">
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            {addressShort && (
              <>
                <MapPin className="h-3.5 w-3.5 shrink-0 text-gold-400" />
                <span className="truncate">{addressShort}</span>
              </>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-4">
            {phone && (
              <a href={`tel:+91${phone.replace(/\D/g, "").slice(-10)}`} className="flex items-center gap-1.5 hover:text-white">
                <Phone className="h-3.5 w-3.5 text-gold-400" /> {phone}
              </a>
            )}
            <span className="text-navy-400">Your Complete Building Solution</span>
          </span>
        </div>
      </div>
      <div className="border-b border-navy-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:h-20 lg:gap-6 lg:px-8">
          <Link href="/" className="shrink-0" aria-label="OM ENTERPRISE home">
            <span className="sm:hidden">
              <Logo size="sm" />
            </span>
            <span className="hidden sm:block">
              <Logo />
            </span>
          </Link>
          <Suspense fallback={<NavLinks pathname={null} categories={categories} />}>
            <ActiveNavLinks categories={categories} />
          </Suspense>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <SearchBox className="hidden w-52 md:block xl:w-60 2xl:w-72" />
            <EnquiryButton />
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden h-10 items-center gap-2 rounded-xl bg-gold-500 px-4 text-sm font-bold text-navy-950 shadow-sm transition-colors hover:bg-gold-400 sm:flex"
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            )}
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-navy-800 hover:bg-navy-50 lg:hidden"
              aria-label="Open menu"
              aria-expanded={menuOpen}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-navy-950/60 backdrop-blur-[2px]" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[min(22rem,100%)] animate-fade-in flex-col bg-white shadow-lift">
            <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
              <Logo size="sm" compact />
              <button type="button" onClick={() => setMenuOpen(false)} className="rounded-lg p-2 text-navy-700 hover:bg-navy-50" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <SearchBox autoFocus onSubmit={() => setMenuOpen(false)} />
              <nav className="mt-4 space-y-1" aria-label="Mobile">
                {NAV.map((n) => (
                  <Link key={n.href} href={n.href} onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-base font-semibold text-navy-900 hover:bg-navy-50">
                    {n.label}
                  </Link>
                ))}
                <Link href="/enquiry" onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-2.5 text-base font-semibold text-navy-900 hover:bg-navy-50">
                  Enquiry list
                </Link>
              </nav>
              {categories.length > 0 && (
                <div className="mt-5">
                  <div className="px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-gold-600">Categories</div>
                  <div className="mt-2 space-y-1">
                    {categories
                      .filter((c) => !c.parentId)
                      .map((c) => (
                        <Link
                          key={c.slug}
                          href={`/category/${c.slug}`}
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-navy-800 hover:bg-navy-50"
                        >
                          <CategoryIcon name={c.icon} className="h-4 w-4 text-gold-600" />
                          {c.name}
                        </Link>
                      ))}
                  </div>
                </div>
              )}
            </div>
            {wa && (
              <div className="border-t border-navy-100 p-4">
                <a href={wa} target="_blank" rel="noopener noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-xl bg-gold-500 text-base font-bold text-navy-950 hover:bg-gold-400">
                  <MessageCircle className="h-5 w-5" /> Chat on WhatsApp
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

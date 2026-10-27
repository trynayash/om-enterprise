import { Suspense, type ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { getSettings } from "@/server/settings";
import { ownerLang } from "@/server/owner-lang";
import { requireOwner } from "./guard";
import { LogoMark } from "@/components/ui/logo";
import { ToastProvider } from "@/components/ui/toast";
import { LangSwitch } from "@/components/owner/lang-switch";
import { SignOut } from "@/components/owner/sign-out";

export const metadata: Metadata = {
  title: { default: "Owner", template: "%s · OM ENTERPRISE" },
  manifest: "/admin-app.webmanifest",
  appleWebApp: { capable: true, title: "OM Shop", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#0d1b30" };

/** The owner's phone app: one column, big buttons, no sidebar. */
export default function OwnerLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="min-h-dvh bg-paper/50">
        <Suspense fallback={<div className="h-[60px] border-b border-navy-200 bg-white" />}>
          <Header />
        </Suspense>
        <main className="mx-auto w-full max-w-xl px-4 pb-16 pt-5">{children}</main>
      </div>
    </ToastProvider>
  );
}

async function Header() {
  await requireOwner();
  const { lang, t } = await ownerLang();
  const business = await getSettings("business");
  return (
    <header className="border-b border-navy-200 bg-white">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-2.5">
        <Link href="/admin/app" className="flex min-w-0 items-center gap-2.5">
          <LogoMark className="h-9 w-9" />
          <span className="truncate text-[15px] font-bold text-navy-950">{business.name}</span>
        </Link>
        <LangSwitch lang={lang} label={t("language")} />
      </div>
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 pb-2.5 text-sm">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 font-semibold text-navy-600 hover:text-navy-950">
          <LayoutDashboard className="h-4 w-4" /> {t("fullDashboard")}
        </Link>
        <SignOut label={t("signOut")} />
      </div>
    </header>
  );
}

import { Suspense } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { PosTopBar, PosTopBarSkeleton } from "@/components/pos/top-bar";

export const metadata = { title: { default: "Point of Sale", template: "%s · POS · OM ENTERPRISE" }, robots: { index: false } };

export default function PosLayout({ children }: LayoutProps<"/pos">) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col bg-navy-50/60 print:bg-white">
        <Suspense fallback={<PosTopBarSkeleton />}>
          <PosTopBar />
        </Suspense>
        <main className="mx-auto w-full max-w-[1500px] flex-1 px-3 py-4 sm:px-5 lg:py-6 print:max-w-none print:p-0">{children}</main>
      </div>
    </ToastProvider>
  );
}

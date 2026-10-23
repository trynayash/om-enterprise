import { Suspense } from "react";
import { Sidebar, SidebarSkeleton } from "@/components/staff/sidebar";
import { ToastProvider } from "@/components/ui/toast";

export const metadata = { title: { default: "Dashboard", template: "%s · OM ENTERPRISE" }, robots: { index: false } };

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <ToastProvider>
      {/* The sidebar column stretches with the page; its contents stay pinned to the viewport. */}
      <div className="flex min-h-dvh flex-1 flex-col bg-paper/50 lg:flex-row">
        <Suspense fallback={<SidebarSkeleton />}>
          <Sidebar />
        </Suspense>
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1360px] px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-9">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}

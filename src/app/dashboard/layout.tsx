import { Suspense } from "react";
import { Sidebar, SidebarSkeleton } from "@/components/staff/sidebar";
import { ToastProvider } from "@/components/ui/toast";

export const metadata = { title: { default: "Dashboard", template: "%s · OM ENTERPRISE" }, robots: { index: false } };

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col bg-navy-50/50 lg:flex-row">
        <Suspense fallback={<SidebarSkeleton />}>
          <Sidebar />
        </Suspense>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </ToastProvider>
  );
}

import { ToastProvider } from "@/components/ui/toast";
import { SiteFooter, SiteHeader, WhatsAppFloat } from "@/components/public/site-chrome";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col bg-white">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-navy-900 focus:px-4 focus:py-2 focus:text-white">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <WhatsAppFloat />
      </div>
    </ToastProvider>
  );
}

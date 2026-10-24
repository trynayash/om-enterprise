import { ToastProvider } from "@/components/ui/toast";
import { SiteFooter, SiteHeader } from "@/components/public/site-chrome";
import { NotFoundContent } from "@/components/public/not-found-content";

export const metadata = { title: "Page not found" };

/** Any unknown address: the public 404 with the site's header and footer, so visitors keep their way around. */
export default function NotFound() {
  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col bg-white">
        <SiteHeader />
        <main id="main" className="flex-1">
          <NotFoundContent title="We couldn't find that page" text="The address may be mistyped, or the page has moved. Search the catalogue below or start from the home page." />
        </main>
        <SiteFooter />
      </div>
    </ToastProvider>
  );
}

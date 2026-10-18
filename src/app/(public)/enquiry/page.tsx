import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/page";
import { EnquiryList } from "@/components/public/enquiry-list";
import { Breadcrumbs, Container } from "@/components/public/section";
import { getSiteData } from "@/components/public/site-data";

export const metadata: Metadata = {
  title: "Enquiry list",
  description: "Send your list of building materials to OM ENTERPRISE for a quote or order confirmation.",
  robots: { index: false },
};

export default function EnquiryPage() {
  return (
    <>
      <section className="border-b border-navy-100 bg-gradient-to-b from-navy-50 to-white">
        <Container className="py-10 sm:py-12">
          <Breadcrumbs items={[{ href: "/", label: "Home" }, { label: "Enquiry list" }]} />
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">Enquiry &amp; order request</h1>
          <p className="mt-2 max-w-2xl text-base text-navy-500">
            Review your list and send it to us. We&apos;ll confirm stock, the final bill amount and pickup or delivery — usually on WhatsApp.
          </p>
        </Container>
      </section>
      <Container className="py-8 sm:py-10">
        <Suspense
          fallback={
            <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr]">
              <Skeleton className="h-80 rounded-2xl" />
              <Skeleton className="h-[28rem] rounded-3xl" />
            </div>
          }
        >
          <EnquiryContent />
        </Suspense>
      </Container>
    </>
  );
}

async function EnquiryContent() {
  const { business, website } = await getSiteData();
  return <EnquiryList whatsapp={business.whatsapp || null} priceNote={website.priceNote} enquiriesEnabled={website.enquiriesEnabled} />;
}

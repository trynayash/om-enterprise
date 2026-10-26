import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/page";
import { EnquiryList } from "@/components/public/enquiry-list";
import { Container, PageIntro } from "@/components/public/section";
import { getSiteData } from "@/components/public/site-data";

export const metadata: Metadata = {
  title: "Enquiry list",
  description: "Send your list of building materials to OM ENTERPRISE for a quote or order confirmation.",
  robots: { index: false },
};

export default function EnquiryPage() {
  return (
    <>
      <PageIntro
        crumbs={[{ href: "/", label: "Home" }, { label: "Enquiry list" }]}
        title="Enquiry & order request"
        description="Review your list and send it to us. We'll confirm stock, the final bill amount and pickup or delivery — usually on WhatsApp."
      />
      <Container className="py-8 sm:py-10">
        <Suspense
          fallback={
            <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr]">
              <Skeleton className="h-80 rounded-xl" />
              <Skeleton className="h-[28rem] rounded-xl" />
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

import { Suspense } from "react";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { getAllSettings } from "@/server/settings";
import { listTaxClasses } from "@/server/services/catalog";
import { razorpayConfigFromEnv } from "@/server/payments/providers";
import { PageHeader, PageSkeleton } from "@/components/ui/page";
import { SettingsEditor, type SectionKey } from "@/components/dashboard/admin/settings-editor";
import { SETTINGS_EDIT_PERMISSION } from "@/lib/settings-schema";
import type { Permission } from "@/lib/permissions";
import { financialYear, fyShort } from "@/lib/india";

export const metadata = { title: "Settings" };

export default function SettingsPage(props: PageProps<"/dashboard/settings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Settings({ searchParams }: { searchParams: PageProps<"/dashboard/settings">["searchParams"] }) {
  const actor = await requirePageActor(["settings.business", "settings.tax", "settings.payment", "settings.documents", "discounts.configure"]);
  const sp = await searchParams;
  const settings = await getAllSettings();
  const editable = (Object.keys(SETTINGS_EDIT_PERMISSION) as SectionKey[]).filter((k) => {
    const need = SETTINGS_EDIT_PERMISSION[k];
    if (need === "super_admin" || k === "tax") return actor.isSuperAdmin;
    return can(actor, need as Permission);
  });
  const taxClasses = await listTaxClasses();
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Settings" description="Business details, tax, billing documents, payments and policies. Every saved change is versioned in the audit log." />
      <SettingsEditor
        settings={settings}
        editable={editable}
        initial={typeof sp.section === "string" ? (sp.section as SectionKey) : undefined}
        razorpayConfigured={!!razorpayConfigFromEnv()}
        taxClasses={taxClasses.map((t) => ({ id: t.id, name: t.name, gstRate: t.gstRate, cessRate: t.cessRate, isExempt: t.isExempt, description: t.description }))}
        canEditTaxClasses={can(actor, "settings.tax")}
        currentFy={fyShort(financialYear(new Date()))}
      />
    </div>
  );
}

import { Suspense } from "react";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { listRoles, listStaff } from "@/server/services/users";
import { PageHeader, PageSkeleton, Alert } from "@/components/ui/page";
import { StaffManager } from "@/components/dashboard/admin/staff-manager";
import { PERMISSIONS, PERMISSION_GROUPS } from "@/lib/permissions";

export const metadata = { title: "Staff & access" };

export default function StaffPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Staff />
    </Suspense>
  );
}

async function Staff() {
  const actor = await requirePageActor("users.manage");
  const [staff, roles] = [await listStaff(actor), await listRoles()];
  const catalogue = PERMISSION_GROUPS.map((g) => ({
    label: g.label,
    permissions: Object.entries(PERMISSIONS)
      .filter(([k]) => g.prefix.some((p) => k.startsWith(p)))
      .map(([key, description]) => ({ key, description })),
  }));
  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Staff & access"
        description="Create accounts, set discount and approval limits, and decide exactly what each person can do. Every change is recorded in the audit log."
      />
      {!actor.isSuperAdmin && (
        <Alert className="mb-4">You can manage Sales & Operations staff. Administrator accounts, roles and permissions can only be changed by the Super Admin.</Alert>
      )}
      <StaffManager
        staff={staff.map((s) => ({ ...s, lastLoginAt: s.lastLoginAt?.toISOString() ?? null, createdAt: s.createdAt.toISOString(), lockedUntil: s.lockedUntil?.toISOString() ?? null }))}
        roles={roles.map((r) => ({
          key: r.key,
          name: r.name,
          description: r.description,
          permissions: r.permissions,
          defaultDiscountLimitPercent: r.defaultDiscountLimitPercent,
          defaultApprovalLimitPercent: r.defaultApprovalLimitPercent,
        }))}
        catalogue={catalogue}
        me={{ id: actor.id, isSuperAdmin: actor.isSuperAdmin, canSetLimits: can(actor, "discounts.configure") }}
      />
    </div>
  );
}

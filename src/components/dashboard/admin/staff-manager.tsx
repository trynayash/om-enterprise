"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Lock, Pencil, Plus, ShieldCheck, ShieldOff, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Alert, TableWrap } from "@/components/ui/page";
import { rowHover, tdMuted, tdNum, tdText, th, thNum, withPy } from "@/components/dashboard/table";
import { DateTime } from "@/components/ui/money";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { apiFetch, errorMessage } from "@/lib/api-client";

type Staff = {
  id: string;
  username: string;
  displayName: string;
  mobile: string | null;
  email: string | null;
  roleKey: string;
  roleName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  discountLimitPercent: string | null;
  approvalLimitPercent: string | null;
  roleDiscountLimitPercent: string;
  roleApprovalLimitPercent: string;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  hasSecretKey: boolean;
  overrides: { permission: string; effect: "grant" | "deny" }[];
};
type Role = { key: string; name: string; description: string | null; permissions: string[]; defaultDiscountLimitPercent: string; defaultApprovalLimitPercent: string };
type Catalogue = { label: string; permissions: { key: string; description: string }[] }[];

function tempPassword() {
  const words = ["Kite", "Moss", "Brick", "River", "Cedar", "Ember", "Stone", "Maple", "Coral", "Tiger", "Lotus", "Pearl"];
  const r = new Uint32Array(3);
  crypto.getRandomValues(r);
  return `${words[r[0] % words.length]}-${1000 + (r[1] % 9000)}-${words[r[2] % words.length]}`;
}

export function StaffManager({ staff, roles, catalogue, me }: { staff: Staff[]; roles: Role[]; catalogue: Catalogue; me: { id: string; isSuperAdmin: boolean; canSetLimits: boolean } }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Staff | "new" | null>(null);
  const [resetFor, setResetFor] = useState<Staff | null>(null);
  const [permsFor, setPermsFor] = useState<Staff | null>(null);
  const [roleEdit, setRoleEdit] = useState<Role | null>(null);
  const assignableRoles = me.isSuperAdmin ? roles : roles.filter((r) => r.key === "sales");
  const canManage = (s: Staff) => s.id !== me.id && (me.isSuperAdmin || s.roleKey === "sales");

  const toggleActive = async (s: Staff) => {
    if (!confirm(`${s.isActive ? "Deactivate" : "Reactivate"} ${s.displayName}?${s.isActive ? " They will be signed out immediately." : ""}`)) return;
    try {
      await apiFetch(`/api/admin/staff/${s.id}`, { method: "PATCH", body: { isActive: !s.isActive } });
      toast(`${s.displayName} ${s.isActive ? "deactivated" : "reactivated"}`);
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const clearSecretKey = async (s: Staff) => {
    if (!confirm(`Clear ${s.displayName}'s secret key? They will sign in with their password only until they add a new key.`)) return;
    try {
      await apiFetch(`/api/admin/staff/${s.id}/secret-key`, { method: "DELETE", body: {} });
      toast(`Secret key cleared for ${s.displayName}`);
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Staff accounts"
          description="Sign-in accounts for the shop team. There are no shared logins — each person has their own."
          actions={
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>
              Add staff member
            </Button>
          }
        />
        <TableWrap className="rounded-none border-0 shadow-none">
          <table className="stack-sm w-full min-w-[860px]">
            <thead>
              <tr>
                <th className={th}>Name</th>
                <th className={th}>Role</th>
                <th className={th}>Status</th>
                <th className={thNum}>Discount limit</th>
                <th className={thNum}>Approval limit</th>
                <th className={th}>Last sign-in</th>
                <th className={thNum}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className={cn(rowHover, !s.isActive && "opacity-60")}>
                  <td data-label="Name" className={tdText}>
                    <div className="font-semibold">
                      {s.displayName} {s.id === me.id && <span className="text-xs font-normal text-navy-500">(you)</span>}
                    </div>
                    <div className="mt-0.5 tabular text-[11.5px] text-navy-500">
                      @{s.username}
                      {s.mobile ? ` · ${s.mobile}` : ""}
                    </div>
                  </td>
                  <td data-label="Role" className={tdText}>
                    <Badge tone={s.roleKey === "super_admin" ? "gold" : s.roleKey === "admin" ? "navy" : "neutral"}>{s.roleName}</Badge>
                    {s.overrides.length > 0 && <div className="mt-1 text-xs text-navy-500">{s.overrides.length} individual permission change(s)</div>}
                  </td>
                  <td data-label="Status" className={tdText}>
                    <div className="flex flex-wrap items-center gap-1">
                    {!s.isActive ? (
                      <Badge tone="red">Deactivated</Badge>
                    ) : s.lockedUntil && new Date(s.lockedUntil) > new Date() ? (
                      <Badge tone="amber">
                        <Lock className="h-3 w-3" /> Locked
                      </Badge>
                    ) : s.mustChangePassword ? (
                      <Badge tone="amber">Must set password</Badge>
                    ) : (
                      <Badge tone="green">Active</Badge>
                    )}
                    {s.hasSecretKey && (
                      <Badge>
                        <ShieldCheck className="h-3 w-3" /> Secret key
                      </Badge>
                    )}
                    </div>
                  </td>
                  <td data-label="Discount limit" className={tdNum}>
                    {s.roleKey === "super_admin" ? <span className="font-sans text-[13px] text-navy-500">No limit</span> : `${Number(s.discountLimitPercent ?? s.roleDiscountLimitPercent)}%`}
                    {s.discountLimitPercent !== null && s.roleKey !== "super_admin" && <div className="font-sans text-[11px] text-navy-500">custom</div>}
                  </td>
                  <td data-label="Approval limit" className={tdNum}>
                    {s.roleKey === "super_admin" ? <span className="font-sans text-[13px] text-navy-500">No limit</span> : `${Number(s.approvalLimitPercent ?? s.roleApprovalLimitPercent)}%`}
                  </td>
                  <td data-label="Last sign-in" className={`${tdMuted} whitespace-nowrap`}>
                    <DateTime value={s.lastLoginAt} />
                  </td>
                  <td className={`${withPy(tdText, "py-1.5")} text-right`}>
                    {canManage(s) ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" title="Edit" onClick={() => setEditing(s)} icon={<Pencil className="h-4 w-4" />} />
                        <Button size="sm" variant="ghost" title="Reset password" onClick={() => setResetFor(s)} icon={<KeyRound className="h-4 w-4" />} />
                        {me.isSuperAdmin && s.roleKey !== "super_admin" && (
                          <Button size="sm" variant="ghost" title="Individual permissions" onClick={() => setPermsFor(s)} icon={<ShieldCheck className="h-4 w-4" />} />
                        )}
                        {me.isSuperAdmin && s.hasSecretKey && (
                          <Button size="sm" variant="ghost" title="Clear forgotten secret key" onClick={() => clearSecretKey(s)} icon={<ShieldOff className="h-4 w-4" />} />
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          title={s.isActive ? "Deactivate" : "Reactivate"}
                          onClick={() => toggleActive(s)}
                          icon={s.isActive ? <UserX className="h-4 w-4 text-red-700" /> : <UserCheck className="h-4 w-4 text-emerald-700" />}
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-navy-500">{s.id === me.id ? "Use “Change password”" : "Super Admin only"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      {me.isSuperAdmin && (
        <Card className="overflow-hidden">
          <CardHeader title="Roles" description="Default permissions and limits for each role. Individual staff can be adjusted with grant/deny overrides." />
          <div className="grid gap-px bg-navy-100 md:grid-cols-2 xl:grid-cols-4">
            {roles.map((r) => (
              <div key={r.key} className="flex flex-col bg-white p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-navy-950">{r.name}</div>
                  {r.key !== "super_admin" && (
                    <Button size="sm" variant="outline" onClick={() => setRoleEdit(r)}>
                      Edit
                    </Button>
                  )}
                </div>
                <p className="mt-1.5 flex-1 text-xs leading-relaxed text-navy-500">{r.description}</p>
                <div className="mt-3 border-t border-navy-100 pt-2.5 tabular text-[11.5px] leading-relaxed text-navy-600">
                  {r.key === "super_admin" ? "All permissions, no limits" : `${r.permissions.length} permissions · discount ${Number(r.defaultDiscountLimitPercent)}% · approves up to ${Number(r.defaultApprovalLimitPercent)}%`}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {editing && <StaffDialog staff={editing === "new" ? null : editing} roles={assignableRoles} me={me} onClose={() => setEditing(null)} onSaved={() => router.refresh()} />}
      {resetFor && <ResetDialog staff={resetFor} onClose={() => setResetFor(null)} />}
      {permsFor && <PermissionsDialog staff={permsFor} role={roles.find((r) => r.key === permsFor.roleKey)!} catalogue={catalogue} onClose={() => setPermsFor(null)} onSaved={() => router.refresh()} />}
      {roleEdit && <RoleDialog role={roleEdit} catalogue={catalogue} onClose={() => setRoleEdit(null)} onSaved={() => router.refresh()} />}
    </div>
  );
}

function StaffDialog({ staff, roles, me, onClose, onSaved }: { staff: Staff | null; roles: Role[]; me: { isSuperAdmin: boolean; canSetLimits: boolean }; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    username: staff?.username ?? "",
    displayName: staff?.displayName ?? "",
    mobile: staff?.mobile ?? "",
    email: staff?.email ?? "",
    roleKey: staff?.roleKey ?? roles.find((r) => r.key === "sales")?.key ?? roles[0]?.key ?? "sales",
    temporaryPassword: staff ? "" : tempPassword(),
    discountLimitPercent: staff?.discountLimitPercent ?? "",
    approvalLimitPercent: staff?.approvalLimitPercent ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const role = roles.find((r) => r.key === f.roleKey);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const limits = me.canSetLimits
        ? { discountLimitPercent: f.discountLimitPercent || null, approvalLimitPercent: f.approvalLimitPercent || null }
        : {};
      if (staff) {
        await apiFetch(`/api/admin/staff/${staff.id}`, {
          method: "PATCH",
          body: { displayName: f.displayName, mobile: f.mobile || null, email: f.email || null, ...(me.isSuperAdmin ? { roleKey: f.roleKey } : {}), ...limits },
        });
        toast("Staff member updated");
      } else {
        await apiFetch("/api/admin/staff", { method: "POST", body: { ...f, mobile: f.mobile || null, email: f.email || null, ...limits } });
        toast(`Account created. Give ${f.displayName} their username and temporary password.`);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={staff ? `Edit ${staff.displayName}` : "Add staff member"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            {staff ? "Save changes" : "Create account"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {error && <Alert tone="danger" className="sm:col-span-2">{error}</Alert>}
        <Field label="Full name" required>
          <Input value={f.displayName} onChange={set("displayName")} />
        </Field>
        <Field label="Username" required hint="Used to sign in">
          <Input value={f.username} onChange={set("username")} disabled={!!staff} autoCapitalize="none" />
        </Field>
        <Field label="Mobile">
          <Input value={f.mobile} onChange={set("mobile")} inputMode="tel" />
        </Field>
        <Field label="Email">
          <Input value={f.email} onChange={set("email")} type="email" />
        </Field>
        <Field label="Role" required className="sm:col-span-2" hint={role?.description ?? undefined}>
          <Select value={f.roleKey} onChange={set("roleKey")} disabled={!!staff && !me.isSuperAdmin}>
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        {f.roleKey === "super_admin" && (
          <Alert tone="warning" className="sm:col-span-2">
            A Super Admin has complete control of the business system, including all money, prices, staff and settings.
          </Alert>
        )}
        {!staff && (
          <Field label="Temporary password" required className="sm:col-span-2" hint="They must choose their own password at first sign-in.">
            <div className="flex gap-2">
              <Input value={f.temporaryPassword} onChange={set("temporaryPassword")} className="tabular" />
              <Button variant="outline" onClick={() => setF({ ...f, temporaryPassword: tempPassword() })}>
                New
              </Button>
            </div>
          </Field>
        )}
        {me.canSetLimits && f.roleKey !== "super_admin" && (
          <>
            <Field label="Discount limit %" hint={`Blank = role default (${Number(role?.defaultDiscountLimitPercent ?? 0)}%). Above this needs approval.`}>
              <Input value={f.discountLimitPercent} onChange={set("discountLimitPercent")} inputMode="decimal" placeholder="role default" />
            </Field>
            <Field label="Can approve up to %" hint={`Blank = role default (${Number(role?.defaultApprovalLimitPercent ?? 0)}%). Needs the approve permission.`}>
              <Input value={f.approvalLimitPercent} onChange={set("approvalLimitPercent")} inputMode="decimal" placeholder="role default" />
            </Field>
          </>
        )}
      </div>
    </Dialog>
  );
}

function ResetDialog({ staff, onClose }: { staff: Staff; onClose: () => void }) {
  const toast = useToast();
  const [pw, setPw] = useState(tempPassword());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reset = async () => {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/staff/${staff.id}/password`, { method: "POST", body: { temporaryPassword: pw } });
      toast(`Password reset. ${staff.displayName} has been signed out and must set a new password.`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Reset password — ${staff.displayName}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={reset} loading={busy}>
            Reset password
          </Button>
        </>
      }
    >
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      <Field label="Temporary password" hint="Share it privately. It must be changed at the next sign-in.">
        <Input value={pw} onChange={(e) => setPw(e.target.value)} className="tabular" />
      </Field>
    </Dialog>
  );
}

function PermissionsDialog({ staff, role, catalogue, onClose, onSaved }: { staff: Staff; role: Role; catalogue: Catalogue; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<Record<string, "default" | "grant" | "deny">>(() =>
    Object.fromEntries(staff.overrides.map((o) => [o.permission, o.effect])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roleSet = useMemo(() => new Set(role.permissions), [role]);
  const save = async () => {
    setBusy(true);
    try {
      const overrides = Object.entries(state)
        .filter(([, v]) => v !== "default")
        .map(([permission, effect]) => ({ permission, effect: effect as "grant" | "deny" }));
      await apiFetch(`/api/admin/staff/${staff.id}/permissions`, { method: "PUT", body: { overrides } });
      toast("Permissions updated");
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={`Permissions — ${staff.displayName}`}
      description={`Starts from the ${role.name} role. Grant adds a permission just for this person; deny removes it.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Save permissions
          </Button>
        </>
      }
    >
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      <div className="space-y-5">
        {catalogue.map((g) => (
          <div key={g.label}>
            <div className="label-sm mb-2 text-gold-700">{g.label}</div>
            <div className="divide-y divide-navy-100 rounded-lg border border-navy-100">
              {g.permissions.map((p) => {
                const v = state[p.key] ?? "default";
                const effective = v === "grant" || (v === "default" && roleSet.has(p.key));
                return (
                  <div key={p.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{p.description}</div>
                      <div className="tabular text-[11px] text-navy-500">
                        {p.key} · role default: {roleSet.has(p.key) ? "yes" : "no"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={effective ? "green" : "neutral"}>{effective ? "Allowed" : "Not allowed"}</Badge>
                      <div className="w-36">
                        <Select value={v} onChange={(e) => setState({ ...state, [p.key]: e.target.value as "default" | "grant" | "deny" })} aria-label={`${p.key} override`}>
                          <option value="default">Role default</option>
                          <option value="grant">Grant</option>
                          <option value="deny">Deny</option>
                        </Select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

function RoleDialog({ role, catalogue, onClose, onSaved }: { role: Role; catalogue: Catalogue; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [perms, setPerms] = useState(new Set(role.permissions));
  const [discount, setDiscount] = useState(String(Number(role.defaultDiscountLimitPercent)));
  const [approval, setApproval] = useState(String(Number(role.defaultApprovalLimitPercent)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/roles/${role.key}`, { method: "PUT", body: { permissions: [...perms], discountLimitPercent: discount, approvalLimitPercent: approval } });
      toast(`${role.name} role updated`);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={`Role: ${role.name}`}
      description="Changes apply to everyone with this role (except their individual overrides)."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Save role
          </Button>
        </>
      }
    >
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <Field label="Default discount limit %">
          <Input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Default approval limit %">
          <Input value={approval} onChange={(e) => setApproval(e.target.value)} inputMode="decimal" />
        </Field>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {catalogue.map((g) => (
          <div key={g.label}>
            <div className="label-sm mb-2 text-gold-700">{g.label}</div>
            <div className="space-y-1.5">
              {g.permissions.map((p) => (
                <Checkbox
                  key={p.key}
                  checked={perms.has(p.key)}
                  onChange={(e) => {
                    const next = new Set(perms);
                    if (e.target.checked) next.add(p.key);
                    else next.delete(p.key);
                    setPerms(next);
                  }}
                  label={
                    <>
                      {p.description} <span className="tabular text-[11px] text-navy-400">{p.key}</span>
                    </>
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

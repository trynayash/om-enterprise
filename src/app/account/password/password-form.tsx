"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { landingPath } from "@/lib/nav";
import type { PublicActor } from "@/server/auth/actor";

export function PasswordForm() {
  const required = useSearchParams().get("required") === "1";
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return setError("The new passwords do not match");
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/auth/password", { method: "POST", body: { currentPassword: current, newPassword: next } });
      setDone(true);
      const me = await apiFetch<PublicActor>("/api/auth/me");
      // First sign-in of the owner or an admin: offer to add a secret key next.
      const offerKey = required && !me.hasSecretKey && (me.isSuperAdmin || me.roleKey === "admin");
      setTimeout(() => (window.location.href = offerKey ? "/account/security?setup=1" : landingPath(me.permissions, me.isSuperAdmin)), 900);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-navy-900">{required ? "Set your own password" : "Change password"}</h1>
        <p className="mt-1 text-sm text-navy-500">
          {required ? "You signed in with a temporary password. Choose a new one to continue." : "Other devices will be signed out."}
        </p>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {done && <Alert tone="success">Password changed. Taking you back…</Alert>}
      <Field label="Current password" htmlFor="cur">
        <Input id="cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </Field>
      <Field label="New password" htmlFor="new" hint="At least 10 characters (12 for the Super Admin), mixing letters with numbers or symbols. Don't include your username.">
        <Input id="new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
      </Field>
      <Field label="Confirm new password" htmlFor="conf">
        <Input id="conf" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!current || !next || !confirm || done}>
        Save new password
      </Button>
    </form>
  );
}

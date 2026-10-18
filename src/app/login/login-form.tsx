"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { landingPath } from "@/lib/nav";
import type { PublicActor } from "@/server/auth/actor";

export function LoginForm() {
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { actor } = await apiFetch<{ actor: PublicActor }>("/api/auth/login", { method: "POST", body: { username, password } });
      const next = params.get("next");
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
      window.location.href = actor.mustChangePassword ? "/account/password?required=1" : (safeNext ?? landingPath(actor.permissions, actor.isSuperAdmin));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Username" htmlFor="username">
        <div className="relative">
          <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
          <Input id="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} className="h-12 pl-9 text-base" required autoFocus />
        </div>
      </Field>
      <Field label="Password" htmlFor="password">
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 pl-9 text-base" required />
        </div>
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!username || !password}>
        Sign in
      </Button>
      <p className="text-center text-xs text-navy-400">Forgot your password? Ask the Super Admin to reset it.</p>
    </form>
  );
}

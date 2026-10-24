"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { landingPath } from "@/lib/nav";
import type { PublicActor } from "@/server/auth/actor";

type Step1 = { actor: PublicActor } | { secretKeyRequired: true; challenge: string; expiresAt: string };

/** Two-step sign-in: username + password, then the secret key for accounts that have one. */
export function LoginForm() {
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const enter = (actor: PublicActor) => {
    const next = params.get("next");
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
    window.location.href = actor.mustChangePassword ? "/account/password?required=1" : (safeNext ?? landingPath(actor.permissions, actor.isSuperAdmin));
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<Step1>("/api/auth/login", { method: "POST", body: { username, password } });
      if ("secretKeyRequired" in res) {
        setChallenge(res.challenge);
        setPassword("");
        setBusy(false);
        return;
      }
      enter(res.actor);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const submitSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { actor } = await apiFetch<{ actor: PublicActor }>("/api/auth/login/secret", { method: "POST", body: { challenge, secretKey } });
      enter(actor);
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      setSecretKey("");
      // The pending sign-in ended (expired or too many tries): start again from the password.
      if (/expired|sign in again|locked/i.test(message)) setChallenge(null);
      setBusy(false);
    }
  };

  if (challenge) {
    return (
      <form onSubmit={submitSecret} className="mt-6 animate-fade-in space-y-4" noValidate>
        <div className="rounded-md border border-navy-200 border-l-[3px] border-l-emerald-600 bg-paper/70 px-4 py-3 text-sm leading-relaxed text-navy-800">
          Password accepted for <b className="font-semibold text-navy-950">{username}</b>. Enter your secret key to finish signing in.
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Secret key" htmlFor="secret-key">
          <Input id="secret-key" type="password" autoComplete="off" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} className="h-12 text-base" required autoFocus />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!secretKey}>
          Verify and sign in
        </Button>
        <div className="flex flex-col items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              setChallenge(null);
              setSecretKey("");
              setError(null);
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-navy-600 transition-colors hover:text-navy-950"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Use a different account
          </button>
          <p className="text-center text-xs text-navy-500">Forgot your secret key? The Super Admin can clear it for you.</p>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitPassword} className="mt-6 space-y-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Username" htmlFor="username">
        <Input id="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} className="h-12 text-base" required autoFocus />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 text-base" required />
      </Field>
      <Button type="submit" size="lg" className="mt-2 w-full" loading={busy} disabled={!username || !password}>
        Sign in
      </Button>
      <p className="text-center text-xs text-navy-500">Forgot your password? Ask the Super Admin to reset it.</p>
    </form>
  );
}

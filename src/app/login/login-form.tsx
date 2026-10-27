"use client";
import { useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { landingPath } from "@/lib/nav";
import type { PublicActor } from "@/server/auth/actor";

type Step1 = { actor: PublicActor } | { secretKeyRequired: true; challenge: string; expiresAt: string };

const LAST_USERNAME = "om:last-username";

/**
 * Two-step sign-in: username + password, then the secret key for accounts that have one. Counter staff
 * can use their PIN instead of the password (where `allowPin`); the username is remembered on the device.
 */
export function LoginForm({ allowPin, next: defaultNext }: { allowPin?: boolean; next?: string }) {
  const params = useSearchParams();
  const last = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return localStorage.getItem(LAST_USERNAME) ?? "";
      } catch {
        return "";
      }
    },
    () => "",
  );
  const [typed, setUsername] = useState<string | null>(null);
  const username = typed ?? last;
  const [usePin, setUsePin] = useState(false);
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const enter = (actor: PublicActor) => {
    try {
      localStorage.setItem(LAST_USERNAME, username.trim());
    } catch {
      // storage unavailable
    }
    const next = params.get("next") ?? defaultNext ?? null;
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
    window.location.href = actor.mustChangePassword ? "/account/password?required=1" : (safeNext ?? landingPath(actor.permissions, actor.isSuperAdmin));
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (usePin) {
        const { actor } = await apiFetch<{ actor: PublicActor }>("/api/auth/login/pin", { method: "POST", body: { username, pin } });
        enter(actor);
        return;
      }
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
        <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm leading-relaxed text-navy-800">
          Password accepted for <b className="font-semibold text-navy-950">{username}</b>. Enter your secret key to finish signing in.
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Secret key" htmlFor="secret-key">
          <Input id="secret-key" type="password" autoComplete="off" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} className="h-12 text-base" required autoFocus />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={busy}>
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
      {usePin ? (
        <Field label="PIN" htmlFor="pin">
          <Input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            className="h-12 text-lg tracking-[0.3em]"
            required
          />
        </Field>
      ) : (
        <Field label="Password" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 text-base" required />
        </Field>
      )}
      <Button type="submit" size="lg" className="mt-2 w-full" loading={busy}>
        Sign in
      </Button>
      {allowPin && (
        <button
          type="button"
          onClick={() => {
            setUsePin((v) => !v);
            setError(null);
          }}
          className="block w-full text-center text-sm font-semibold text-navy-700 underline underline-offset-[3px] hover:text-navy-950"
        >
          {usePin ? "Sign in with password instead" : "Sign in with PIN (counter staff)"}
        </button>
      )}
      <p className="text-center text-xs text-navy-500">{usePin ? "No PIN yet, or forgot it? Ask the Super Admin." : "Forgot your password? Ask the Super Admin to reset it."}</p>
    </form>
  );
}

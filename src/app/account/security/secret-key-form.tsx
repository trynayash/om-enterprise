"use client";
import { useState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { cn } from "@/components/ui/cn";
import { apiFetch, errorMessage } from "@/lib/api-client";

/** Add, change or remove the sign-in secret key (asked after the password at every sign-in). */
export function SecretKeyForm({ hasKey, setAt, setup, home }: { hasKey: boolean; setAt: string | null; setup: boolean; home: string }) {
  const [mode, setMode] = useState<"set" | "remove">("set");
  const [currentPassword, setCurrentPassword] = useState("");
  const [currentKey, setCurrentKey] = useState("");
  const [newKey, setNewKey] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "set" && newKey !== confirm) return setError("The secret keys don't match");
    setBusy(true);
    setError(null);
    try {
      if (mode === "set") {
        await apiFetch("/api/auth/secret-key", { method: "POST", body: { currentPassword, currentSecretKey: hasKey ? currentKey : null, newSecretKey: newKey } });
        setDone(hasKey ? "Secret key changed. Other devices were signed out." : "Secret key added. You'll be asked for it every time you sign in.");
      } else {
        await apiFetch("/api/auth/secret-key", { method: "DELETE", body: { currentPassword, currentSecretKey: currentKey } });
        setDone("Secret key removed. Sign-in now needs only your password.");
      }
      setTimeout(() => (window.location.href = setup ? home : "/account/security"), 1500);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const valid = mode === "set" ? currentPassword && newKey && confirm && (!hasKey || currentKey) : currentPassword && currentKey;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="headline text-[1.625rem] font-bold text-navy-950">{setup ? "Protect your account" : "Secret key"}</h1>
        <p className="mt-2 text-sm leading-relaxed text-navy-500">
          A secret key is a second code, asked after your password every time you sign in. Even someone who learns your password can&apos;t get in without it.
        </p>
      </div>

      <div
        className={cn(
          "flex items-center gap-2.5 rounded-md border px-3.5 py-2.5 text-sm",
          hasKey ? "border-emerald-200 bg-emerald-50/70 text-emerald-950" : "border-amber-200 bg-amber-50/70 text-amber-950",
        )}
      >
        {hasKey ? (
          <span>
            <b className="font-semibold">Secret key is on</b>
            {setAt ? (
              <span className="text-emerald-800">
                {" "}
                · set <span className="tabular text-[13px]">{new Date(setAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}</span>
              </span>
            ) : (
              ""
            )}
          </span>
        ) : (
          <b className="font-semibold">No secret key yet — sign-in needs only your password.</b>
        )}
      </div>

      {hasKey && (
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-navy-200 bg-paper/60 p-1" role="radiogroup" aria-label="What to do">
          {(["set", "remove"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={cn(
                "h-9 rounded-md text-sm font-semibold transition-colors duration-150",
                mode === m ? "bg-navy-900 text-white shadow-[inset_0_-1px_0_rgb(0_0_0/0.35)]" : "text-navy-600 hover:bg-white hover:text-navy-900",
              )}
            >
              {m === "set" ? "Change key" : "Remove key"}
            </button>
          ))}
        </div>
      )}

      {error && <Alert tone="danger">{error}</Alert>}
      {done && <Alert tone="success">{done}</Alert>}

      <Field label="Your current password" htmlFor="sk-password">
        <Input id="sk-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
      </Field>
      {hasKey && (
        <Field label="Current secret key" htmlFor="sk-current">
          <Input id="sk-current" type="password" autoComplete="off" value={currentKey} onChange={(e) => setCurrentKey(e.target.value)} required />
        </Field>
      )}
      {mode === "set" && (
        <>
          <Field label={hasKey ? "New secret key" : "Secret key"} htmlFor="sk-new" hint="At least 8 characters, mixing letters with numbers or symbols. Must be different from your password.">
            <Input id="sk-new" type="password" autoComplete="new-password" value={newKey} onChange={(e) => setNewKey(e.target.value)} required />
          </Field>
          <Field label="Confirm secret key" htmlFor="sk-confirm">
            <Input id="sk-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </Field>
          <p className="text-xs leading-relaxed text-navy-500">Write it down and keep it somewhere safe and separate from your password. If you forget it, see “Recovery” in the handover note.</p>
        </>
      )}

      <Button
        type="submit"
        size="lg"
        variant={mode === "remove" ? "danger" : "primary"}
        className="mt-2 w-full"
        loading={busy}
        disabled={!valid || !!done}
        icon={mode === "remove" ? <ShieldOff className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
      >
        {mode === "remove" ? "Remove secret key" : hasKey ? "Change secret key" : "Add secret key"}
      </Button>
      {setup && !done && (
        <LinkButton href={home} variant="ghost" className="w-full">
          Skip for now
        </LinkButton>
      )}
    </form>
  );
}

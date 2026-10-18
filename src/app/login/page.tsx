import { Suspense } from "react";
import { Logo } from "@/components/ui/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Staff sign in", robots: { index: false } };

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy-950 px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(212,165,55,0.18),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(58,103,166,0.35),transparent_60%)]" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo inverted />
        </div>
        <div className="rounded-3xl border border-white/10 bg-white p-6 shadow-lift sm:p-8">
          <h1 className="text-xl font-extrabold text-navy-900">Staff sign in</h1>
          <p className="mt-1 text-sm text-navy-500">For OM ENTERPRISE team members only.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-xs text-navy-300">
          Customers: <a href="/" className="font-semibold text-gold-400 hover:underline">visit our website</a>
        </p>
      </div>
    </div>
  );
}

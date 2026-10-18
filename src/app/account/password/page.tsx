import { Suspense } from "react";
import { Logo } from "@/components/ui/logo";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Change password", robots: { index: false } };

export default function PasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card sm:p-8">
          <Suspense>
            <PasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

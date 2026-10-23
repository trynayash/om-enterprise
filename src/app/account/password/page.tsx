import { Suspense } from "react";
import { AuthSheet, SheetStamp } from "@/app/login/auth-sheet";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Change password", robots: { index: false } };

export default function PasswordPage() {
  return (
    <AuthSheet stamp={<SheetStamp>Account</SheetStamp>}>
      <Suspense>
        <PasswordForm />
      </Suspense>
    </AuthSheet>
  );
}
